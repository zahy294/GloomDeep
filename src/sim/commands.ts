/**
 * Discrete requests from the UI or input layer (CLAUDE.md rule 3: the UI sends commands, it never
 * changes state directly). Queued and applied at the start of the next simulation step.
 */
export type SimCommand =
  | { readonly type: 'selectSlot'; readonly slot: number }
  /** Moves the hotbar selection by ±n slots, wrapping (mouse wheel). */
  | { readonly type: 'cycleSlot'; readonly delta: number }
  | { readonly type: 'swapSlots'; readonly a: number; readonly b: number };
