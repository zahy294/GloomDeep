import { describe, expect, it } from 'vitest';
import { CRAFTING, TILE_SIZE } from '../../../src/config';
import { ITEMS, itemId } from '../../../src/data/items';
import { RECIPES } from '../../../src/data/recipes';
import { TILES, tileId } from '../../../src/data/tiles';
import { createPlayer } from '../../../src/sim/entities/Player';
import { EventBus, type SimEvents } from '../../../src/sim/events';
import { Inventory } from '../../../src/sim/inventory/Inventory';
import {
  craft,
  maxCrafts,
  nearbyStations,
  recipeByKey,
  RESOLVED_RECIPES,
} from '../../../src/sim/systems/CraftingSystem';
import { World } from '../../../src/sim/world/World';

const T = TILE_SIZE;
const NO_STATIONS = new Set<string>();

function recipe(key: string) {
  const r = recipeByKey(key);
  if (!r) throw new Error(`missing recipe ${key}`);
  return r;
}

describe('recipe data', () => {
  it('every recipe resolves, and every station key belongs to a placeable tile', () => {
    expect(RESOLVED_RECIPES).toHaveLength(RECIPES.length);
    const stations = new Set(TILES.flatMap((t) => (t.station ? [t.station] : [])));
    for (const r of RECIPES) if (r.station) expect(stations.has(r.station)).toBe(true);
    for (const station of stations) {
      const tile = TILES.find((t) => t.station === station);
      expect(ITEMS.some((i) => i.placesTile === tile?.key)).toBe(true);
    }
    expect(new Set(RECIPES.map((r) => r.key)).size).toBe(RECIPES.length);
  });

  it('every pickaxe tier is craftable from a material the tier below can mine', () => {
    // The easiest tile that drops each item.
    const tierOfTile = new Map<string, number>();
    for (const t of TILES) {
      if (t.drop) tierOfTile.set(t.drop, Math.min(tierOfTile.get(t.drop) ?? 99, t.tier ?? 0));
    }
    for (const item of ITEMS) {
      if (!item.tool) continue;
      const r = RESOLVED_RECIPES.find((x) => x.output.itemId === item.id);
      expect(r, item.key).toBeDefined();
      // Raw materials behind the recipe (one level of bars → ore is enough for this tree).
      for (const input of r?.inputs ?? []) {
        const bar = RESOLVED_RECIPES.find((x) => x.output.itemId === input.itemId);
        const raw = bar ? bar.inputs.map((i) => i.itemId) : [input.itemId];
        for (const id of raw) {
          const tier = tierOfTile.get(ITEMS[id]?.key ?? '') ?? 0;
          expect(tier, `${item.key} needs ${ITEMS[id]?.key}`).toBeLessThan(item.tool.tier);
        }
      }
    }
  });
});

describe('CraftingSystem', () => {
  it('crafts by hand, removing inputs and adding the output', () => {
    const inv = new Inventory();
    inv.add(itemId('living_wood'), 3);
    const r = recipe('planks_from_living_wood');
    expect(maxCrafts(r, inv)).toBe(3);
    expect(craft(r, 2, inv, NO_STATIONS)).toEqual({ crafted: 2, overflow: 0 });
    expect(inv.count(itemId('living_wood'))).toBe(1);
    expect(inv.count(itemId('elderwood_planks'))).toBe(8);
  });

  it('needs the station and enough of every input', () => {
    const inv = new Inventory();
    inv.add(itemId('stone'), 20);
    inv.add(itemId('elderwood_planks'), 4);
    inv.add(itemId('torch'), 2);
    const furnace = recipe('furnace');
    expect(craft(furnace, 1, inv, new Set(['workbench'])).crafted).toBe(0); // 2 of 3 torches
    inv.add(itemId('torch'), 1);
    expect(craft(furnace, 1, inv, NO_STATIONS).crafted).toBe(0); // no workbench
    expect(craft(furnace, 1, inv, new Set(['workbench'])).crafted).toBe(1);
    expect(inv.count(itemId('furnace'))).toBe(1);
    expect(inv.count(itemId('stone'))).toBe(0);
  });

  it('caps a batch at what the materials allow and CRAFTING.maxBatch', () => {
    const inv = new Inventory();
    inv.add(itemId('copper_ore'), 999);
    const r = recipe('copper_bar');
    expect(craft(r, 1000, inv, new Set(['furnace'])).crafted).toBe(CRAFTING.maxBatch);
  });

  it('reports output that does not fit', () => {
    const inv = new Inventory(1, 1);
    inv.add(itemId('rootwood'), 1);
    // The rootwood slot frees up, so the planks fit.
    expect(craft(recipe('planks_from_rootwood'), 1, inv, NO_STATIONS)).toEqual({
      crafted: 1,
      overflow: 0,
    });
    const full = new Inventory(2, 1);
    full.add(itemId('rootwood'), 2);
    full.slots[1] = { itemId: itemId('stone'), count: 1 };
    full.slots[0] = { itemId: itemId('rootwood'), count: 2 };
    // 1 rootwood stays, so the 2 planks have nowhere to go.
    expect(craft(recipe('planks_from_rootwood'), 1, full, NO_STATIONS)).toEqual({
      crafted: 1,
      overflow: 2,
    });
  });

  it('finds stations within reach of the player', () => {
    const world = new World({ width: 40, height: 20, chunkSize: 10 }, new EventBus<SimEvents>());
    const player = createPlayer(20.5 * T, 15 * T);
    world.set(22, 14, tileId('workbench'));
    world.set(20 + CRAFTING.stationReach + 3, 14, tileId('anvil'));
    const found = nearbyStations(world, player.body, new Set());
    expect([...found]).toEqual(['workbench']);
  });
});
