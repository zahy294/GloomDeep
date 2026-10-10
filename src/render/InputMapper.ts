import * as Phaser from 'phaser';
import { DEFAULT_BINDINGS, HOTBAR_KEYS, MOUSE_BINDINGS } from '../data/keybindings';
import type { Settings } from '../settings';
import type { SimCommand } from '../sim/commands';
import { ACTIONS, type Action, type ActionState } from '../sim/input';

interface Binding {
  action: Action;
  keys: Phaser.Input.Keyboard.Key[];
  mouse: 'left' | 'right' | null;
}

/**
 * Reads keyboard and mouse each frame and turns them into simulation actions plus the cursor's
 * world position (plan 3: "Input → actions"). Hotbar keys and the wheel become commands.
 */
export class InputMapper {
  /** Plain array (not a Map) so the per-frame loop allocates no iterator entries. */
  private readonly bindings: Binding[] = [];
  /** While false (e.g. the cursor is over a UI panel) mouse buttons don't reach the game. */
  pointerEnabled = true;
  /** Set by the scene while a click in the world means something else (throwing a held stack). */
  mouseBlocked = false;
  /** While true (photo mode) the hotbar keys and the wheel send nothing. */
  commandsBlocked = false;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly actions: ActionState,
    enqueue: (command: SimCommand) => void,
    /** The settings' key bindings (M13); the defaults for anything they don't list. */
    keys: Partial<Settings['keys']> = {},
  ) {
    if (!scene.input.keyboard) throw new Error('Keyboard input is disabled in the game config');
    this.setKeys(keys);
    const keyboard = scene.input.keyboard;

    HOTBAR_KEYS.forEach((name, slot) => {
      keyboard.on(`keydown-${name}`, () => {
        if (!this.commandsBlocked) enqueue({ type: 'selectSlot', slot });
      });
    });
    const onWheel = (_p: Phaser.Input.Pointer, _over: unknown, _dx: number, dy: number) => {
      if (dy !== 0 && !this.commandsBlocked) enqueue({ type: 'cycleSlot', delta: Math.sign(dy) });
    };
    scene.input.on(Phaser.Input.Events.POINTER_WHEEL, onWheel);

    // Releasing the window while a key is held would otherwise leave it "stuck" down.
    scene.game.events.on(Phaser.Core.Events.BLUR, this.releaseAll, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      scene.game.events.off(Phaser.Core.Events.BLUR, this.releaseAll, this);
      for (const name of HOTBAR_KEYS) keyboard.off(`keydown-${name}`);
      for (const binding of this.bindings) for (const key of binding.keys) key.removeAllListeners();
      scene.input.off(Phaser.Input.Events.POINTER_WHEEL, onWheel);
    });
  }

  /** (Re)binds the actions' keys: the settings menu applies changes at once (M13). */
  setKeys(keys: Partial<Settings['keys']>): void {
    const keyboard = this.scene.input.keyboard;
    if (!keyboard) return;
    for (const binding of this.bindings) {
      for (const key of binding.keys) {
        key.removeAllListeners();
        key.reset();
      }
    }
    this.bindings.length = 0;
    for (const action of ACTIONS) {
      this.bindings.push({
        action,
        keys: (keys[action] ?? DEFAULT_BINDINGS[action] ?? []).map((name) => {
          const key = keyboard.addKey(name, true);
          // Polling isDown once per frame misses taps shorter than a frame; latch the edge too.
          key.on(Phaser.Input.Keyboard.Events.DOWN, () => this.actions.press(action));
          return key;
        }),
        mouse: MOUSE_BINDINGS[action] ?? null,
      });
    }
    this.actions.releaseAll();
  }

  /** Call once per frame, before advancing the simulation. */
  update(): void {
    const pointer = this.scene.input.activePointer;
    pointer.updateWorldPoint(this.scene.cameras.main);
    this.actions.setAim(pointer.worldX, pointer.worldY);
    const mouse = this.pointerEnabled && !this.mouseBlocked;
    const left = mouse && pointer.leftButtonDown();
    const right = mouse && pointer.rightButtonDown();

    for (let i = 0; i < this.bindings.length; i++) {
      const binding = this.bindings[i];
      if (!binding) continue;
      let down = binding.mouse === 'left' ? left : binding.mouse === 'right' ? right : false;
      for (let k = 0; k < binding.keys.length; k++) down ||= binding.keys[k]?.isDown === true;
      this.actions.setHeld(binding.action, down);
    }
  }

  private releaseAll(): void {
    for (const binding of this.bindings) for (const key of binding.keys) key.reset();
    this.actions.releaseAll();
  }
}
