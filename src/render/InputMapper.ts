import * as Phaser from 'phaser';
import { DEFAULT_BINDINGS, HOTBAR_KEYS, MOUSE_BINDINGS } from '../data/keybindings';
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

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly actions: ActionState,
    enqueue: (command: SimCommand) => void,
  ) {
    const keyboard = scene.input.keyboard;
    if (!keyboard) throw new Error('Keyboard input is disabled in the game config');
    for (const action of ACTIONS) {
      this.bindings.push({
        action,
        keys: (DEFAULT_BINDINGS[action] ?? []).map((name) => keyboard.addKey(name, true)),
        mouse: MOUSE_BINDINGS[action] ?? null,
      });
    }

    HOTBAR_KEYS.forEach((name, slot) => {
      keyboard.on(`keydown-${name}`, () => enqueue({ type: 'selectSlot', slot }));
    });
    const onWheel = (_p: Phaser.Input.Pointer, _over: unknown, _dx: number, dy: number) => {
      if (dy !== 0) enqueue({ type: 'cycleSlot', delta: Math.sign(dy) });
    };
    scene.input.on(Phaser.Input.Events.POINTER_WHEEL, onWheel);

    // Releasing the window while a key is held would otherwise leave it "stuck" down.
    scene.game.events.on(Phaser.Core.Events.BLUR, this.releaseAll, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      scene.game.events.off(Phaser.Core.Events.BLUR, this.releaseAll, this);
      for (const name of HOTBAR_KEYS) keyboard.off(`keydown-${name}`);
      scene.input.off(Phaser.Input.Events.POINTER_WHEEL, onWheel);
    });
  }

  /** Call once per frame, before advancing the simulation. */
  update(): void {
    const pointer = this.scene.input.activePointer;
    pointer.updateWorldPoint(this.scene.cameras.main);
    this.actions.setAim(pointer.worldX, pointer.worldY);
    const left = this.pointerEnabled && pointer.leftButtonDown();
    const right = this.pointerEnabled && pointer.rightButtonDown();

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
