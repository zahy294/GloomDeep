import { describe, expect, it } from 'vitest';
import { ITEMS } from '../../../src/data/items';
import { Inventory } from '../../../src/sim/inventory/Inventory';

const STACK = ITEMS[0]?.maxStack ?? 0;

describe('Inventory', () => {
  it('tops up existing stacks before using empty slots', () => {
    const inv = new Inventory(5, 2);
    inv.add(0, 10);
    inv.swap(0, 3);
    expect(inv.add(0, 5)).toBe(0);
    expect(inv.slots[3]?.count).toBe(15);
    expect(inv.slots[0]).toBeNull();
  });

  it('respects maxStack across multiple slots', () => {
    const inv = new Inventory(5, 2);
    expect(inv.add(0, STACK * 2 + 5)).toBe(0);
    expect(inv.slots[0]?.count).toBe(STACK);
    expect(inv.slots[1]?.count).toBe(STACK);
    expect(inv.slots[2]?.count).toBe(5);
  });

  it('returns the leftover when full', () => {
    const inv = new Inventory(2, 1);
    expect(inv.add(0, STACK * 2 + 7)).toBe(7);
    expect(inv.add(1, 1)).toBe(1);
  });

  it('canAccept is true for a partial stack of the same item in a full inventory', () => {
    const inv = new Inventory(2, 1);
    inv.add(0, STACK);
    inv.add(1, 3);
    expect(inv.canAccept(0)).toBe(false);
    expect(inv.canAccept(1)).toBe(true);
    expect(inv.canAccept(2)).toBe(false);
  });

  it('removes and empties slots', () => {
    const inv = new Inventory(3, 1);
    inv.add(0, 5);
    expect(inv.removeFromSlot(0, 2)).toBe(2);
    expect(inv.slots[0]?.count).toBe(3);
    expect(inv.removeFromSlot(0, 10)).toBe(3);
    expect(inv.slots[0]).toBeNull();
    expect(inv.removeFromSlot(0, 1)).toBe(0);
    expect(inv.removeFromSlot(99, 1)).toBe(0);
  });

  it('swaps slots and ignores invalid indices', () => {
    const inv = new Inventory(3, 1);
    inv.add(0, 5);
    inv.swap(0, 2);
    expect(inv.slots[0]).toBeNull();
    expect(inv.slots[2]?.count).toBe(5);
    inv.swap(0, 99);
    inv.swap(-1, 1);
    expect(inv.slots[2]?.count).toBe(5);
  });

  it('select ignores out-of-range slots and exposes selectedStack', () => {
    const inv = new Inventory(10, 4);
    inv.add(0, 5);
    inv.select(3);
    expect(inv.selected).toBe(3);
    inv.select(4);
    inv.select(-1);
    expect(inv.selected).toBe(3);
    inv.select(0);
    expect(inv.selectedStack?.itemId).toBe(0);
    inv.select(1);
    expect(inv.selectedStack).toBeNull();
  });

  it('cycle wraps both ways within the hotbar', () => {
    const inv = new Inventory(10, 4);
    inv.cycle(-1);
    expect(inv.selected).toBe(3);
    inv.cycle(1);
    expect(inv.selected).toBe(0);
    inv.cycle(6);
    expect(inv.selected).toBe(2);
  });

  it('bumps version on changes only', () => {
    const inv = new Inventory(3, 2);
    const v0 = inv.version;
    inv.add(0, 1);
    const v1 = inv.version;
    expect(v1).toBeGreaterThan(v0);
    inv.select(1);
    const v2 = inv.version;
    expect(v2).toBeGreaterThan(v1);
    inv.removeFromSlot(0, 1);
    expect(inv.version).toBeGreaterThan(v2);
    const v3 = inv.version;
    inv.select(99);
    inv.add(0, 0);
    expect(inv.version).toBe(v3);
  });
});
