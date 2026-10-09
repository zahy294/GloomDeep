import { INVENTORY } from '../../config';
import { ITEM_CATEGORIES, itemById } from '../../data/items';

export interface ItemStack {
  itemId: number;
  count: number;
}

/** Items missing from the registry can't stack. */
const UNKNOWN_ITEM_MAX_STACK = 1;
/** Unknown items sort last. */
const UNKNOWN_CATEGORY_RANK = ITEM_CATEGORIES.length;

function maxStackOf(itemId: number): number {
  return itemById(itemId)?.maxStack ?? UNKNOWN_ITEM_MAX_STACK;
}

function categoryRank(itemId: number): number {
  const item = itemById(itemId);
  return item ? ITEM_CATEGORIES.indexOf(item.category) : UNKNOWN_CATEGORY_RANK;
}

/** Which mouse button clicked a slot: primary picks up / places whole stacks, secondary halves / one. */
export type SlotButton = 'primary' | 'secondary';

/**
 * Slots 0..hotbarSize-1 are the hotbar, the rest is the bag. `cursor` is the stack held by the
 * mouse while the inventory screen is open (drag and drop). `version` bumps on every change so the
 * UI knows when to redraw.
 */
export class Inventory {
  readonly slots: (ItemStack | null)[];
  readonly hotbarSize: number;
  selected = 0;
  cursor: ItemStack | null = null;
  version = 0;

  constructor(size: number = INVENTORY.slots, hotbarSize: number = INVENTORY.hotbarSlots) {
    this.slots = new Array<ItemStack | null>(size).fill(null);
    this.hotbarSize = hotbarSize;
  }

  get selectedStack(): ItemStack | null {
    return this.slots[this.selected] ?? null;
  }

  /** Returns the leftover that didn't fit. */
  add(itemId: number, count: number): number {
    const left = this.addRange(itemId, count, 0, this.slots.length);
    if (left !== count) this.version++;
    return left;
  }

  canAccept(itemId: number): boolean {
    const max = maxStackOf(itemId);
    for (let i = 0; i < this.slots.length; i++) {
      const s = this.slots[i];
      if (!s || (s.itemId === itemId && s.count < max)) return true;
    }
    return false;
  }

  /** How many of an item the slots hold (the cursor doesn't count: it isn't in the bag). */
  count(itemId: number): number {
    let n = 0;
    for (let i = 0; i < this.slots.length; i++) {
      const s = this.slots[i];
      if (s?.itemId === itemId) n += s.count;
    }
    return n;
  }

  /**
   * Removes up to `count` of an item, bag slots first and the hotbar last (so crafting doesn't
   * empty the hotbar while the bag still has some). Returns the amount removed.
   */
  remove(itemId: number, count: number): number {
    let left = count;
    for (let i = this.slots.length - 1; i >= 0 && left > 0; i--) {
      const s = this.slots[i];
      if (s?.itemId !== itemId) continue;
      const n = Math.min(left, s.count);
      s.count -= n;
      left -= n;
      if (s.count <= 0) this.slots[i] = null;
    }
    if (left !== count) this.version++;
    return count - left;
  }

  /** Returns the amount actually removed. */
  removeFromSlot(slot: number, count: number): number {
    const s = this.slots[slot];
    if (!s || !(count > 0)) return 0;
    const n = Math.min(count, s.count);
    s.count -= n;
    if (s.count <= 0) this.slots[slot] = null;
    this.version++;
    return n;
  }

  swap(a: number, b: number): void {
    if (!this.validSlot(a) || !this.validSlot(b) || a === b) return;
    const tmp = this.slots[a] ?? null;
    this.slots[a] = this.slots[b] ?? null;
    this.slots[b] = tmp;
    this.version++;
  }

  /**
   * A click on a slot while the inventory screen is open (drag and drop is a press on one slot and
   * a release on another, i.e. two clicks).
   * - primary, empty cursor: pick up the whole stack;
   * - primary, holding: put it down, merging into the same item or swapping with another;
   * - secondary, empty cursor: pick up half (rounded up);
   * - secondary, holding: put one down into an empty slot or the same item.
   */
  click(slot: number, button: SlotButton): void {
    if (!this.validSlot(slot)) return;
    const here = this.slots[slot] ?? null;
    const held = this.cursor;
    if (!held) {
      if (!here) return;
      if (button === 'primary' || here.count === 1) {
        this.cursor = here;
        this.slots[slot] = null;
      } else {
        const half = Math.ceil(here.count / 2);
        here.count -= half;
        this.cursor = { itemId: here.itemId, count: half };
      }
      this.version++;
      return;
    }
    if (button === 'secondary') {
      if (here && (here.itemId !== held.itemId || here.count >= maxStackOf(here.itemId))) return;
      if (here) here.count++;
      else this.slots[slot] = { itemId: held.itemId, count: 1 };
      held.count--;
      if (held.count <= 0) this.cursor = null;
      this.version++;
      return;
    }
    if (here && here.itemId === held.itemId) {
      const n = Math.min(held.count, maxStackOf(here.itemId) - here.count);
      if (n <= 0) {
        // A full stack of the same item: swap, so the click still does something.
        this.slots[slot] = held;
        this.cursor = here;
      } else {
        here.count += n;
        held.count -= n;
        if (held.count <= 0) this.cursor = null;
      }
    } else {
      this.slots[slot] = held;
      this.cursor = here;
    }
    this.version++;
  }

  /** Shift-click: moves a stack from the hotbar into the bag, or from the bag into the hotbar. */
  quickMove(slot: number): void {
    const s = this.validSlot(slot) ? this.slots[slot] : null;
    if (!s) return;
    const toHotbar = slot >= this.hotbarSize;
    const from = toHotbar ? 0 : this.hotbarSize;
    const to = toHotbar ? this.hotbarSize : this.slots.length;
    this.slots[slot] = null;
    const left = this.addRange(s.itemId, s.count, from, to);
    if (left > 0) this.slots[slot] = { itemId: s.itemId, count: left };
    if (left !== s.count) this.version++;
  }

  /**
   * Sorts the bag (never the hotbar): merges partial stacks, then orders by category
   * (ITEM_CATEGORIES), item id and largest stack first.
   */
  sortBag(): void {
    const totals = new Map<number, number>();
    for (let i = this.hotbarSize; i < this.slots.length; i++) {
      const s = this.slots[i];
      if (s) totals.set(s.itemId, (totals.get(s.itemId) ?? 0) + s.count);
      this.slots[i] = null;
    }
    const ids = [...totals.keys()].sort((a, b) => categoryRank(a) - categoryRank(b) || a - b);
    let slot = this.hotbarSize;
    for (const id of ids) {
      let left = totals.get(id) ?? 0;
      const max = maxStackOf(id);
      while (left > 0 && slot < this.slots.length) {
        const n = Math.min(left, max);
        this.slots[slot++] = { itemId: id, count: n };
        left -= n;
      }
    }
    this.version++;
  }

  /** Puts the cursor stack back into the slots (inventory closed). Returns what didn't fit. */
  stowCursor(): ItemStack | null {
    const held = this.cursor;
    if (!held) return null;
    this.cursor = null;
    const left = this.addRange(held.itemId, held.count, 0, this.slots.length);
    this.version++;
    return left > 0 ? { itemId: held.itemId, count: left } : null;
  }

  /** Takes the cursor stack out of the inventory (thrown into the world). */
  takeCursor(): ItemStack | null {
    const held = this.cursor;
    if (!held) return null;
    this.cursor = null;
    this.version++;
    return held;
  }

  select(slot: number): void {
    if (!Number.isInteger(slot) || slot < 0 || slot >= this.hotbarSize || slot === this.selected)
      return;
    this.selected = slot;
    this.version++;
  }

  cycle(delta: number): void {
    const n = this.hotbarSize;
    const next = (((this.selected + Math.trunc(delta)) % n) + n) % n;
    this.select(next);
  }

  /** Fills existing stacks of the item in [from, to), then empty slots. Returns the leftover. */
  private addRange(itemId: number, count: number, from: number, to: number): number {
    if (!(count > 0)) return 0;
    const max = maxStackOf(itemId);
    let left = count;
    for (let i = from; i < to && left > 0; i++) {
      const s = this.slots[i];
      if (!s || s.itemId !== itemId || s.count >= max) continue;
      const n = Math.min(left, max - s.count);
      s.count += n;
      left -= n;
    }
    for (let i = from; i < to && left > 0; i++) {
      if (this.slots[i]) continue;
      const n = Math.min(left, max);
      this.slots[i] = { itemId, count: n };
      left -= n;
    }
    return left;
  }

  private validSlot(slot: number): boolean {
    return Number.isInteger(slot) && slot >= 0 && slot < this.slots.length;
  }
}
