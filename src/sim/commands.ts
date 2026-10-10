import type { SlotButton } from './inventory/Inventory';

/**
 * Discrete requests from the UI or input layer (CLAUDE.md rule 3: the UI sends commands, it never
 * changes state directly). Queued and applied at the start of the next simulation step.
 */
export type SimCommand =
  | { readonly type: 'selectSlot'; readonly slot: number }
  /** Moves the hotbar selection by ±n slots, wrapping (mouse wheel). */
  | { readonly type: 'cycleSlot'; readonly delta: number }
  | { readonly type: 'swapSlots'; readonly a: number; readonly b: number }
  /** A click on an inventory slot (drag and drop = press on one slot, release on another). */
  | {
      readonly type: 'slotClick';
      readonly slot: number;
      readonly button: SlotButton;
      /** Shift-click: move the stack between hotbar and bag instead. */
      readonly quick: boolean;
    }
  /** Sorts the bag (not the hotbar). */
  | { readonly type: 'sortInventory' }
  /** Throws the stack held by the cursor into the world. */
  | { readonly type: 'dropCursor' }
  /** The inventory screen closed: put the held stack back (what doesn't fit is dropped). */
  | { readonly type: 'stowCursor' }
  /** Fast travel to the beacon at tile (x, y) (from a beacon's travel list). */
  | { readonly type: 'travel'; readonly x: number; readonly y: number }
  /** Crafts a recipe (src/data/recipes.ts key) up to `times` times. */
  | { readonly type: 'craft'; readonly recipe: string; readonly times: number }
  /** Debug: jump to a time of day (0..1). */
  | { readonly type: 'setDayFraction'; readonly value: number }
  /** Takes on a quest someone offered (src/data/quests key). */
  | { readonly type: 'acceptQuest'; readonly quest: string }
  /** Buys one lot of a trader's offer (index into their SHOPS offers). */
  | { readonly type: 'buy'; readonly npc: number; readonly offer: number }
  /** Sells `count` of an item to a trader. */
  | { readonly type: 'sell'; readonly npc: number; readonly item: number; readonly count: number }
  /** Debug: sets a story flag (e.g. a boss kill, to see a festival). */
  | { readonly type: 'setFlag'; readonly flag: string };
