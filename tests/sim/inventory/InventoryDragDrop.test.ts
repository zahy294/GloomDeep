import { describe, expect, it } from 'vitest';
import { itemId } from '../../../src/data/items';
import { Inventory } from '../../../src/sim/inventory/Inventory';

const SOIL = itemId('forest_soil');
const STONE = itemId('stone');
const PICK = itemId('copper_pickaxe');
const TORCH = itemId('torch');
const WORKBENCH = itemId('workbench');
const IRON_BAR = itemId('iron_bar');

function inv(): Inventory {
  return new Inventory(8, 3);
}

describe('Inventory drag and drop', () => {
  it('picks up a whole stack and puts it down in an empty slot', () => {
    const i = inv();
    i.add(SOIL, 10);
    i.click(0, 'primary');
    expect(i.cursor).toEqual({ itemId: SOIL, count: 10 });
    expect(i.slots[0]).toBeNull();
    i.click(5, 'primary');
    expect(i.cursor).toBeNull();
    expect(i.slots[5]).toEqual({ itemId: SOIL, count: 10 });
  });

  it('swaps with a different item and merges into the same item', () => {
    const i = inv();
    i.add(SOIL, 10);
    i.add(STONE, 4);
    i.click(0, 'primary'); // holding soil
    i.click(1, 'primary'); // swap: stone on the cursor, soil in slot 1
    expect(i.slots[1]).toEqual({ itemId: SOIL, count: 10 });
    expect(i.cursor).toEqual({ itemId: STONE, count: 4 });
    i.click(0, 'primary');
    i.add(SOIL, 5); // goes into slot 1 (existing stack)
    i.click(1, 'primary'); // pick up 15 soil
    i.slots[4] = { itemId: SOIL, count: 990 };
    i.click(4, 'primary'); // merge: 999 max, 6 stay on the cursor
    expect(i.slots[4]?.count).toBe(999);
    expect(i.cursor).toEqual({ itemId: SOIL, count: 6 });
  });

  it('secondary click picks up half, then puts down one at a time', () => {
    const i = inv();
    i.add(TORCH, 7);
    i.click(0, 'secondary');
    expect(i.cursor).toEqual({ itemId: TORCH, count: 4 });
    expect(i.slots[0]?.count).toBe(3);
    i.click(2, 'secondary');
    i.click(2, 'secondary');
    expect(i.slots[2]).toEqual({ itemId: TORCH, count: 2 });
    expect(i.cursor?.count).toBe(2);
    i.add(STONE, 1); // lands in slot 1
    i.click(1, 'secondary'); // a different item: nothing happens
    expect(i.slots[1]).toEqual({ itemId: STONE, count: 1 });
    i.click(0, 'secondary');
    i.click(0, 'secondary');
    expect(i.cursor).toBeNull();
    expect(i.slots[0]?.count).toBe(5);
  });

  it('shift-click moves stacks between hotbar and bag', () => {
    const i = inv();
    i.add(PICK, 1); // slot 0 (hotbar)
    i.quickMove(0);
    expect(i.slots[0]).toBeNull();
    expect(i.slots[3]).toEqual({ itemId: PICK, count: 1 });
    i.quickMove(3);
    expect(i.slots[0]).toEqual({ itemId: PICK, count: 1 });
  });

  it('sorts the bag by category and merges stacks, leaving the hotbar alone', () => {
    const i = inv();
    i.slots[0] = { itemId: SOIL, count: 1 };
    i.slots[3] = { itemId: SOIL, count: 5 };
    i.slots[4] = { itemId: IRON_BAR, count: 2 };
    i.slots[5] = { itemId: SOIL, count: 7 };
    i.slots[6] = { itemId: PICK, count: 1 };
    i.slots[7] = { itemId: WORKBENCH, count: 1 };
    i.sortBag();
    expect(i.slots.slice(3)).toEqual([
      { itemId: PICK, count: 1 }, // tool
      { itemId: WORKBENCH, count: 1 }, // station
      { itemId: IRON_BAR, count: 2 }, // material
      { itemId: SOIL, count: 12 }, // block
      null,
    ]);
    expect(i.slots[0]).toEqual({ itemId: SOIL, count: 1 });
  });

  it('stows the cursor back, and returns what did not fit', () => {
    const i = new Inventory(2, 1);
    i.add(SOIL, 5);
    i.click(0, 'primary');
    expect(i.stowCursor()).toBeNull();
    expect(i.slots[0]).toEqual({ itemId: SOIL, count: 5 });
    i.click(0, 'primary');
    i.slots[0] = { itemId: STONE, count: 1 };
    i.slots[1] = { itemId: TORCH, count: 1 };
    expect(i.stowCursor()).toEqual({ itemId: SOIL, count: 5 });
    expect(i.cursor).toBeNull();
  });

  it('counts and removes items, bag before hotbar', () => {
    const i = inv();
    i.slots[0] = { itemId: STONE, count: 5 };
    i.slots[6] = { itemId: STONE, count: 3 };
    expect(i.count(STONE)).toBe(8);
    expect(i.remove(STONE, 4)).toBe(4);
    expect(i.slots[6]).toBeNull();
    expect(i.slots[0]?.count).toBe(4);
    expect(i.remove(STONE, 10)).toBe(4);
    expect(i.count(STONE)).toBe(0);
  });
});
