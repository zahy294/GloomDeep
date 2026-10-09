import type { Action } from '../sim/input';

/**
 * Default key bindings: action → Phaser key names (Phaser.Input.Keyboard.KeyCodes keys).
 * Actions bound to mouse buttons are listed in MOUSE_BINDINGS. The settings menu (M13) will let
 * players rebind both.
 */
export const DEFAULT_BINDINGS: Readonly<Partial<Record<Action, readonly string[]>>> = {
  moveLeft: ['A', 'LEFT'],
  moveRight: ['D', 'RIGHT'],
  moveUp: ['W', 'UP'],
  moveDown: ['S', 'DOWN'],
  jump: ['SPACE', 'W', 'UP'],
  wallMode: ['SHIFT'],
  toggleLantern: ['F'],
  cycleLens: ['Q'],
};

export const MOUSE_BINDINGS: Readonly<Partial<Record<Action, 'left' | 'right'>>> = {
  useItem: 'left',
  useAlt: 'right',
};

/** Keys that select hotbar slots 1–10, in slot order. */
export const HOTBAR_KEYS = [
  'ONE',
  'TWO',
  'THREE',
  'FOUR',
  'FIVE',
  'SIX',
  'SEVEN',
  'EIGHT',
  'NINE',
  'ZERO',
] as const;

/** Keys outside the action system. */
export const DEBUG_KEYS = {
  toggleOverlay: 'F3',
  /** Jumps to the next named time of day (dawn, noon, sunset, night...). */
  cycleTime: 'T',
} as const;

export const UI_KEYS = {
  toggleInventory: 'E',
  /** Closes the inventory panel, otherwise opens/closes the pause menu. */
  pause: 'ESC',
} as const;
