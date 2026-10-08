import * as Phaser from 'phaser';
import { DEFAULT_BINDINGS } from '../data/keybindings';
import { ACTIONS, type Action, type ActionState } from '../sim/input';

/** Reads the keyboard each frame and turns it into simulation actions (plan 3: "Input → actions"). */
export class InputMapper {
  /** Plain array (not a Map) so the per-frame loop allocates no iterator entries. */
  private readonly bindings: { action: Action; keys: Phaser.Input.Keyboard.Key[] }[] = [];

  constructor(
    scene: Phaser.Scene,
    private readonly actions: ActionState,
    bindings: Readonly<Record<Action, readonly string[]>> = DEFAULT_BINDINGS,
  ) {
    const keyboard = scene.input.keyboard;
    if (!keyboard) throw new Error('Keyboard input is disabled in the game config');
    for (const action of ACTIONS) {
      this.bindings.push({
        action,
        keys: bindings[action].map((name) => keyboard.addKey(name, true)),
      });
    }
    // Releasing the window while a key is held would otherwise leave it "stuck" down.
    scene.game.events.on(Phaser.Core.Events.BLUR, this.releaseAll, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      scene.game.events.off(Phaser.Core.Events.BLUR, this.releaseAll, this);
    });
  }

  /** Call once per frame, before advancing the simulation. */
  update(): void {
    for (let i = 0; i < this.bindings.length; i++) {
      const binding = this.bindings[i];
      if (!binding) continue;
      let down = false;
      for (let k = 0; k < binding.keys.length; k++) down ||= binding.keys[k]?.isDown === true;
      this.actions.setHeld(binding.action, down);
    }
  }

  private releaseAll(): void {
    for (const binding of this.bindings) for (const key of binding.keys) key.reset();
    this.actions.releaseAll();
  }
}
