import { INVENTORY } from '../../config';
import { itemById } from '../../data/items';

export interface ItemStack {
  itemId: number;
  count: number;
}

/** Items missing from the registry can't stack. */
const UNKNOWN_ITEM_MAX_STACK = 1;

function maxStackOf(itemId: number): number {
  return itemById(itemId)?.maxStack ?? UNKNOWN_ITEM_MAX_STACK;
}

/** Slots 0..hotbarSize-1 are the hotbar. `version` bumps on every change so the UI knows when to redraw. */
export class Inventory {
  readonly slots: (ItemStack | null)[];
  readonly hotbarSize: number;
  selected = 0;
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
    if (!(count > 0)) return 0;
    const max = maxStackOf(itemId);
    let left = count;
    for (let i = 0; i < this.slots.length && left > 0; i++) {
      const s = this.slots[i];
      if (!s || s.itemId !== itemId || s.count >= max) continue;
      const n = Math.min(left, max - s.count);
      s.count += n;
      left -= n;
    }
    for (let i = 0; i < this.slots.length && left > 0; i++) {
      if (this.slots[i]) continue;
      const n = Math.min(left, max);
      this.slots[i] = { itemId, count: n };
      left -= n;
    }
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

  private validSlot(slot: number): boolean {
    return Number.isInteger(slot) && slot >= 0 && slot < this.slots.length;
  }
}
