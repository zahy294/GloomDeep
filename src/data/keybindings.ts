import type { Action } from '../sim/input';

/**
 * Default key bindings: action → Phaser key names (Phaser.Input.Keyboard.KeyCodes keys).
 * The settings menu (M13) will let players rebind these.
 */
export const DEFAULT_BINDINGS: Readonly<Record<Action, readonly string[]>> = {
  moveLeft: ['A', 'LEFT'],
  moveRight: ['D', 'RIGHT'],
  moveUp: ['W', 'UP'],
  moveDown: ['S', 'DOWN'],
  jump: ['SPACE', 'W', 'UP'],
};

/** Keys outside the action system. */
export const DEBUG_KEYS = {
  toggleOverlay: 'F3',
} as const;
