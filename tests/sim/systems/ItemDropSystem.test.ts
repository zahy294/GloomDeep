import { describe, expect, it } from 'vitest';
import { ITEM_DROP, TILE_SIZE } from '../../../src/config';
import { ITEMS } from '../../../src/data/items';
import { createItemDrop, type ItemDrop } from '../../../src/sim/entities/ItemDrop';
import { createPlayer, type Player } from '../../../src/sim/entities/Player';
import { EventBus, type SimEvents } from '../../../src/sim/events';
import { Inventory } from '../../../src/sim/inventory/Inventory';
import { mulberry32 } from '../../../src/sim/random';
import { updateItemDrops } from '../../../src/sim/systems/ItemDropSystem';
import { World } from '../../../src/sim/world/World';

const STONE = 4;
const DT = 1 / 60;
const T = TILE_SIZE;
const STACK = ITEMS[0]?.maxStack ?? 0;

function setup() {
  const world = new World({ width: 40, height: 20, chunkSize: 10 });
  for (let x = 0; x < 40; x++) world.set(x, 15, STONE);
  const events = new EventBus<SimEvents>();
  const picked: { itemId: number; count: number }[] = [];
  let changed = 0;
  events.on('itemPickedUp', (e) => picked.push({ itemId: e.itemId, count: e.count }));
  events.on('inventoryChanged', () => changed++);
  return { world, events, picked, changedCount: () => changed, inventory: new Inventory() };
}

function dist(d: ItemDrop, p: Player): number {
  const dx = d.body.x + d.body.width / 2 - (p.body.x + p.body.width / 2);
  const dy = d.body.y + d.body.height / 2 - (p.body.y + p.body.height / 2);
  return Math.hypot(dx, dy);
}

describe('updateItemDrops', () => {
  it('a pulled drop heads straight in and is collected, never orbiting (playtest bug)', () => {
    const { world, events, inventory, picked } = setup();
    const player = createPlayer(20 * T, 15 * T);
    // Within magnet range, flying sideways past the player at top speed (the orbit case).
    const drop = createItemDrop(0, 1, 20 * T + 40, 13 * T, mulberry32(1));
    drop.age = ITEM_DROP.pickupDelay;
    drop.body.vx = 0;
    drop.body.vy = -ITEM_DROP.magnetMaxSpeed;
    const drops = [drop];
    let steps = 0;
    let previous = dist(drop, player);
    while (drops.length > 0 && steps < 120) {
      updateItemDrops(drops, player, inventory, world, events, DT);
      if (drops.length > 0) {
        const now = dist(drop, player);
        expect(now).toBeLessThanOrEqual(previous + 1e-6); // only ever closer
        previous = now;
      }
      steps++;
    }
    expect(picked).toHaveLength(1);
    expect(steps).toBeLessThan(30); // half a second at most
  });

  it('falls, lands on the floor and stops', () => {
    const { world, events, inventory } = setup();
    const player = createPlayer(30 * T, 10 * T);
    const drop = createItemDrop(0, 1, 5 * T, 10 * T, mulberry32(1));
    for (let i = 0; i < 300; i++) updateItemDrops([drop], player, inventory, world, events, DT);
    expect(drop.body.y + drop.body.height).toBeCloseTo(15 * T, 5);
    expect(drop.body.vx).toBe(0);
    expect(drop.body.vy).toBe(0);
    const x = drop.body.x;
    updateItemDrops([drop], player, inventory, world, events, DT);
    expect(drop.body.x).toBe(x);
  });

  it('is not collected before pickupDelay', () => {
    const { world, events, inventory, picked } = setup();
    const player = createPlayer(5 * T, 15 * T);
    const drop = createItemDrop(0, 1, 5 * T, 15 * T - 20, mulberry32(1));
    drop.body.vx = 0;
    drop.body.vy = 0;
    const drops = [drop];
    const steps = Math.floor(ITEM_DROP.pickupDelay / DT) - 2;
    for (let i = 0; i < steps; i++) updateItemDrops(drops, player, inventory, world, events, DT);
    expect(drops).toHaveLength(1);
    expect(picked).toHaveLength(0);
  });

  it('is collected once after the delay with one event of each kind', () => {
    const { world, events, inventory, picked, changedCount } = setup();
    const player = createPlayer(5 * T, 15 * T);
    const drops = [createItemDrop(0, 3, 5 * T, 15 * T - 20, mulberry32(2))];
    for (let i = 0; i < 120; i++) updateItemDrops(drops, player, inventory, world, events, DT);
    expect(drops).toHaveLength(0);
    expect(inventory.slots[0]).toEqual({ itemId: 0, count: 3 });
    expect(picked).toEqual([{ itemId: 0, count: 3 }]);
    expect(changedCount()).toBe(1);
  });

  it('flies towards a player in range, even through a wall', () => {
    const { world, events, inventory } = setup();
    for (let y = 8; y <= 14; y++) world.set(7, y, STONE);
    const player = createPlayer(5 * T, 14 * T);
    const drop = createItemDrop(0, 1, 9 * T, 13 * T, mulberry32(3));
    drop.body.vx = 0;
    drop.body.vy = 0;
    drop.age = ITEM_DROP.pickupDelay;
    expect(dist(drop, player)).toBeLessThan(ITEM_DROP.magnetRadius);
    const drops = [drop];
    let last = dist(drop, player);
    for (let i = 0; i < 20 && drops.length > 0; i++) {
      updateItemDrops(drops, player, inventory, world, events, DT);
      if (drops.length === 0) break;
      const d = dist(drop, player);
      expect(d).toBeLessThan(last);
      last = d;
    }
    expect(drop.magnetized).toBe(true);
  });

  it('stays put when the inventory is full', () => {
    const { world, events, inventory, picked } = setup();
    for (let i = 0; i < inventory.slots.length; i++) inventory.add(1, STACK);
    const player = createPlayer(5 * T, 15 * T);
    const drops = [createItemDrop(0, 1, 5 * T, 15 * T - 4, mulberry32(4))];
    for (let i = 0; i < 120; i++) updateItemDrops(drops, player, inventory, world, events, DT);
    expect(drops).toHaveLength(1);
    expect(drops[0]?.magnetized).toBe(false);
    expect(picked).toHaveLength(0);
  });

  it('keeps the leftover on the ground when only part fits', () => {
    const { world, events, inventory } = setup();
    for (let i = 0; i < inventory.slots.length; i++) inventory.add(1, STACK);
    inventory.removeFromSlot(0, STACK);
    inventory.add(0, STACK - 2);
    const player = createPlayer(5 * T, 15 * T);
    const drops = [createItemDrop(0, 5, 5 * T, 15 * T - 4, mulberry32(5))];
    for (let i = 0; i < 120; i++) updateItemDrops(drops, player, inventory, world, events, DT);
    expect(drops).toHaveLength(1);
    expect(drops[0]?.count).toBe(3);
    expect(inventory.slots[0]?.count).toBe(STACK);
  });

  it('despawns after despawnAfter', () => {
    const { world, events, inventory } = setup();
    const player = createPlayer(35 * T, 15 * T);
    const drop = createItemDrop(0, 1, 5 * T, 15 * T - 4, mulberry32(6));
    drop.age = ITEM_DROP.despawnAfter - DT / 2;
    const drops = [drop];
    updateItemDrops(drops, player, inventory, world, events, DT);
    expect(drops).toHaveLength(0);
  });

  it('is deterministic with a seeded random', () => {
    const run = () => {
      const { world, events, inventory } = setup();
      const player = createPlayer(30 * T, 10 * T);
      const random = mulberry32(99);
      const drops = [
        createItemDrop(0, 1, 5 * T, 10 * T, random),
        createItemDrop(1, 2, 6 * T, 10 * T, random),
      ];
      for (let i = 0; i < 100; i++) updateItemDrops(drops, player, inventory, world, events, DT);
      return drops.map((d) => [d.body.x, d.body.y, d.body.vx, d.body.vy]);
    };
    expect(run()).toEqual(run());
  });
});
