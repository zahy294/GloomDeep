import { describe, expect, it } from 'vitest';
import { TILE_SIZE } from '../../src/config';
import { itemId } from '../../src/data/items';
import { tileId } from '../../src/data/tiles';
import { Simulation } from '../../src/sim/Simulation';
import { AIR } from '../../src/sim/world/World';

/**
 * M6 "Done when": you can progress from wood tools to iron tools purely by mining and crafting.
 * A hand-made world holds floating rows of living wood, stone, copper ore and iron ore over a
 * floor; the player starts with the normal starting inventory and only mines, places stations and
 * sends craft commands, exactly as the UI does.
 */
const T = TILE_SIZE;
const FLOOR = 40;
const ROW = 35;
const WIDTH = 160;
const STEP_MS = 1000 / 60;

const RESOURCES = [
  // A tree trunk: background wall, chopped by hand.
  { tile: 'living_wood', count: 7, wall: true },
  { tile: 'stone', count: 20, wall: false },
  { tile: 'copper_ore', count: 28, wall: false },
  { tile: 'iron_ore', count: 20, wall: false },
] as const;

function world(): { sim: Simulation; columns: Map<string, number[]> } {
  const columns = new Map<string, number[]>();
  const sim = new Simulation({
    size: { width: WIDTH, height: 50, chunkSize: 16 },
    generate: (w) => {
      const floor = tileId('stone');
      for (let y = FLOOR; y < 50; y++) for (let x = 0; x < WIDTH; x++) w.set(x, y, floor);
      let x = 4;
      for (const r of RESOURCES) {
        const xs: number[] = [];
        for (let i = 0; i < r.count; i++, x++) {
          if (r.wall) w.setBg(x, ROW, tileId(r.tile));
          else w.set(x, ROW, tileId(r.tile));
          xs.push(x);
        }
        columns.set(r.tile, xs);
      }
      return { spawnX: 2 * T, spawnY: FLOOR * T };
    },
  });
  return { sim, columns };
}

function step(sim: Simulation, n = 1): void {
  for (let i = 0; i < n; i++) sim.update(STEP_MS);
}

/** Moves the player to stand on the floor under column `tx`. */
function standAt(sim: Simulation, tx: number): void {
  const b = sim.player.body;
  b.x = (tx + 0.5) * T - b.width / 2;
  b.y = FLOOR * T - b.height;
  b.vx = 0;
  b.vy = 0;
  sim.player.prevX = b.x;
  sim.player.prevY = b.y;
}

/** Mines a tile with the left button from below and waits for its drop to be collected. */
function mine(sim: Simulation, tx: number, ty: number): void {
  standAt(sim, tx);
  sim.input.setAim((tx + 0.5) * T, (ty + 0.5) * T);
  sim.input.setHeld('useItem', true);
  const cleared = () => sim.world.get(tx, ty) === AIR && sim.world.getBg(tx, ty) === AIR;
  for (let i = 0; i < 60 * 10 && !cleared(); i++) step(sim);
  sim.input.setHeld('useItem', false);
  expect(cleared(), `mined ${tx},${ty}`).toBe(true);
  step(sim, 45); // the drop falls into the magnet and is collected
}

function mineAll(sim: Simulation, columns: Map<string, number[]>, tile: string): void {
  for (const x of columns.get(tile) ?? []) mine(sim, x, ROW);
}

function craft(sim: Simulation, recipe: string, times = 1): void {
  sim.enqueue({ type: 'craft', recipe, times });
  step(sim);
}

/** Selects the hotbar slot holding the item and places it on the floor next to the player. */
function placeStation(sim: Simulation, item: string, tx: number): void {
  const slot = sim.inventory.slots.findIndex((s) => s?.itemId === itemId(item));
  expect(slot, `${item} in the hotbar`).toBeGreaterThanOrEqual(0);
  expect(slot).toBeLessThan(sim.inventory.hotbarSize);
  sim.enqueue({ type: 'selectSlot', slot });
  step(sim, 10); // past the placement cooldown of the previous station
  sim.input.setAim((tx + 0.5) * T, (FLOOR - 0.5) * T);
  sim.input.setHeld('useAlt', true);
  step(sim);
  sim.input.setHeld('useAlt', false);
  expect(sim.world.get(tx, FLOOR - 1)).toBe(tileId(item));
}

const has = (sim: Simulation, item: string) => sim.inventory.count(itemId(item));

describe('progression (M6 Done when)', () => {
  it('goes from bare hands to an iron pickaxe by mining and crafting only', () => {
    const { sim, columns } = world();
    expect(has(sim, 'elderwood_pickaxe')).toBe(0);

    // Bare hands can't break stone, but can chop wood.
    const stoneX = columns.get('stone')?.[0] ?? 0;
    standAt(sim, stoneX);
    sim.input.setAim((stoneX + 0.5) * T, (ROW + 0.5) * T);
    sim.input.setHeld('useItem', true);
    step(sim, 300);
    sim.input.setHeld('useItem', false);
    expect(sim.world.get(stoneX, ROW)).toBe(tileId('stone'));

    mineAll(sim, columns, 'living_wood');
    craft(sim, 'planks_from_living_wood', 7);
    expect(has(sim, 'elderwood_planks')).toBe(28);
    craft(sim, 'workbench');
    standAt(sim, 60);
    placeStation(sim, 'workbench', 61);
    craft(sim, 'elderwood_pickaxe');
    expect(has(sim, 'elderwood_pickaxe')).toBe(1);

    mineAll(sim, columns, 'stone');
    mineAll(sim, columns, 'copper_ore');
    standAt(sim, 60);
    craft(sim, 'furnace');
    placeStation(sim, 'furnace', 59);
    craft(sim, 'copper_bar', 14);
    craft(sim, 'anvil');
    placeStation(sim, 'anvil', 62);
    craft(sim, 'copper_pickaxe');
    expect(has(sim, 'copper_pickaxe')).toBe(1);

    mineAll(sim, columns, 'iron_ore');
    standAt(sim, 60);
    craft(sim, 'iron_bar', 10);
    craft(sim, 'iron_pickaxe');
    expect(has(sim, 'iron_pickaxe')).toBe(1);
  });
});
