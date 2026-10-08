/** Abstract actions; keys/buttons map onto these on the render side so controls can be rebound. */
export const ACTIONS = ['moveLeft', 'moveRight', 'moveUp', 'moveDown', 'jump'] as const;
export type Action = (typeof ACTIONS)[number];

/**
 * What the player is asking for. The render side calls `setHeld` every frame; the simulation reads
 * `isHeld` and consumes `pressed` edges. A press is latched until a simulation step consumes it,
 * so a tap shorter than one step (or a frame with zero steps) is never lost.
 */
export class ActionState {
  private readonly held = new Map<Action, boolean>();
  private readonly pressed = new Set<Action>();

  setHeld(action: Action, down: boolean): void {
    if (down && !this.held.get(action)) this.pressed.add(action);
    this.held.set(action, down);
  }

  isHeld(action: Action): boolean {
    return this.held.get(action) === true;
  }

  /** True once per press: returns whether it was pressed since the last call, and clears it. */
  consumePressed(action: Action): boolean {
    return this.pressed.delete(action);
  }

  releaseAll(): void {
    this.held.clear();
    this.pressed.clear();
  }
}
