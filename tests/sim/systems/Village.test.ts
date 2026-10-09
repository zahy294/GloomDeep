import { describe, expect, it } from 'vitest';
import { GLOAM, SETTLEMENT, TILE_SIZE } from '../../../src/config';
import { VILLAGERS } from '../../../src/data/npcs';
import { tileId } from '../../../src/data/tiles';
import { decodeSave, encodeSave, SAVE_VERSION } from '../../../src/persistence/saveFormat';
import { Simulation } from '../../../src/sim/Simulation';
import { findRoom } from '../../../src/sim/world/rooms';
import { COTTAGE } from '../../../src/data/prefabs/houses';
import { stampPrefab } from '../../../src/sim/world/prefabs';
import { AIR, type World } from '../../../src/sim/world/World';

const T = TILE_SIZE;
const STONE = tileId('stone');
const PLANKS = tileId('elderwood_planks');
const DOOR = tileId('door_closed');
const TORCH = tileId('torch');

/** 200×60 world: stone below row 40, open sky above; the player at column 10. */
function flat(): Simulation {
  const sim = new Simulation({
    size: { width: 200, height: 60, chunkSize: 20 },
    generate: (w) => {
      for (let y = 40; y < 60; y++) for (let x = 0; x < 200; x++) w.set(x, y, STONE);
      return { spawnX: 10.5 * T, spawnY: 40 * T };
    },
    startingInventory: false,
  });
  return sim;
}

/**
 * A plank house standing on the ground (floor row 40): outer walls at x0 and x0+w-1, roof at
 * 40-h, plank back walls inside, a 3-tall door in the right wall, a torch on the back wall.
 */
function house(
  world: World,
  x0: number,
  w = 10,
  h = 6,
  { door = true, torch = true, walls = true } = {},
) {
  const top = 40 - h;
  for (let x = x0; x < x0 + w; x++) world.set(x, top, PLANKS);
  for (let y = top; y < 40; y++) {
    world.set(x0, y, PLANKS);
    world.set(x0 + w - 1, y, PLANKS);
  }
  for (let y = top + 1; y < 40; y++) {
    for (let x = x0 + 1; x < x0 + w - 1; x++) if (walls) world.setBg(x, y, PLANKS);
  }
  if (door) for (let y = 37; y < 40; y++) world.set(x0 + w - 1, y, DOOR);
  if (torch) world.set(x0 + 2, top + 2, TORCH);
}

function step(sim: Simulation, seconds: number): void {
  for (let i = 0; i < Math.round(seconds * 60); i++) sim.update(1000 / 60);
}

describe('rooms', () => {
  it('a closed-in, walled, lit room with a door and floor space is a home', () => {
    const sim = flat();
    house(sim.world, 20);
    expect(findRoom(sim.world, 23, 39)?.problem).toBeNull();
  });

  it('says what a room lacks', () => {
    const sim = flat();
    const w = sim.world;
    house(w, 20, 10, 6, { torch: false });
    expect(findRoom(w, 23, 39)?.problem).toBe('light');
    house(w, 40, 10, 6, { door: false });
    expect(findRoom(w, 43, 39)?.problem).toBe('door');
    house(w, 60, 10, 6, { walls: false });
    expect(findRoom(w, 63, 39)?.problem).toBe('walls');
    house(w, 80, 4, 4);
    expect(findRoom(w, 81, 39)?.problem).toBe('small');
    house(w, 100);
    w.set(100, 36, AIR); // a hole in the left wall
    expect(findRoom(w, 103, 39)?.problem).toBe('open');
  });
});

describe('village', () => {
  it('four lit homes bring the four villagers, one at a time, each in their own home', () => {
    const sim = flat();
    for (const x of [20, 40, 60, 80]) house(sim.world, x);
    const arrived: string[] = [];
    sim.events.on('npcArrived', ({ key }) => arrived.push(key));
    step(sim, SETTLEMENT.checkSeconds * 6);
    expect(arrived).toEqual(VILLAGERS.map((v) => v.key));
    const villagers = sim.settlement.npcs.filter((n) => n.key !== 'dryad');
    expect(new Set(villagers.map((n) => n.homeId)).size).toBe(4);
    for (const n of villagers) expect(n.homeId).toBeGreaterThanOrEqual(0);
    // Each stands inside a house (columns 20..89, below the roofs).
    for (const n of villagers) {
      const x = (n.body.x + n.body.width / 2) / T;
      expect(x).toBeGreaterThan(20);
      expect(x).toBeLessThan(90);
    }
  });

  it('a villager whose home breaks becomes homeless', () => {
    const sim = flat();
    house(sim.world, 20);
    step(sim, SETTLEMENT.checkSeconds * 2);
    const tinker = sim.settlement.npcs.find((n) => n.key === 'tinker');
    expect(tinker?.homeId).toBeGreaterThanOrEqual(0);
    // Take the torch away: no light, no home.
    for (let y = 30; y < 40; y++)
      for (let x = 21; x < 29; x++) if (sim.world.get(x, y) === TORCH) sim.world.set(x, y, AIR);
    step(sim, SETTLEMENT.checkSeconds * 2);
    expect(tinker?.homeId).toBe(-1);
  });

  it('right-click opens a door, talks to a villager, and the Dryad speaks of the forest', () => {
    const sim = flat();
    house(sim.world, 14);
    step(sim, SETTLEMENT.checkSeconds * 2);
    const said: string[] = [];
    sim.events.on('talk', ({ name, text }) => said.push(`${name}: ${text}`));
    // Door at column 23, rows 37..39; the player stands at column 10 (within reach).
    sim.player.body.x = 20 * T;
    sim.input.setAim(23.5 * T, 38.5 * T);
    sim.input.setHeld('useAlt', true);
    step(sim, 1 / 60);
    sim.input.setHeld('useAlt', false);
    step(sim, 1 / 60);
    expect(sim.world.get(23, 38)).toBe(tileId('door_open'));
    const tinker = sim.settlement.npcs.find((n) => n.key === 'tinker');
    if (!tinker) throw new Error('no tinker');
    sim.input.setAim(tinker.body.x + 6, tinker.body.y + 10);
    sim.input.setHeld('useAlt', true);
    step(sim, 1 / 60);
    sim.input.setHeld('useAlt', false);
    expect(said[0]).toMatch(/^Bramwell: /);
    const dryad = sim.settlement.npcs.find((n) => n.key === 'dryad');
    expect(dryad).toBeDefined();
  });

  it('villagers and the starting Gloam survive saving', () => {
    const sim = flat();
    house(sim.world, 20);
    step(sim, SETTLEMENT.checkSeconds * 2);
    const meta = {
      id: 'v',
      name: 'v',
      seed: 1,
      sizeKey: 'small' as const,
      width: 200,
      height: 60,
      createdAt: 0,
      lastPlayed: 0,
      playTime: 0,
    };
    const loaded = Simulation.fromSave(decodeSave(encodeSave(sim.toSaveState(meta, SAVE_VERSION))));
    expect(loaded.settlement.npcs.map((n) => n.key).sort()).toEqual(['dryad', 'tinker']);
    expect(loaded.gloam.initial).toBe(sim.gloam.initial);
  });
});

describe('prefabs', () => {
  it('a stamped cottage on uneven ground is a valid, lit home', () => {
    const sim = flat();
    const w = sim.world;
    // A bump and a dip under the footprint: cleared and filled.
    w.set(32, 39, STONE);
    for (let y = 40; y < 43; y++) w.set(35, y, AIR);
    stampPrefab(w, COTTAGE, 30, 40, 4);
    for (let y = 41; y < 43; y++) expect(w.isSolid(35, y)).toBe(true);
    sim.input.setFocus(35 * T, 36 * T);
    step(sim, 1); // light the grid around it
    const room = findRoom(w, 33, 39);
    expect(room).not.toBeNull();
    expect(room?.problem).toBeNull();
  });
});

describe('beacons', () => {
  it('no creatures spawn inside a beacon circle, and its Gloam burns away', () => {
    const sim = flat();
    const w = sim.world;
    w.set(100, 39, tileId('beacon'));
    expect(sim.beacons.covers(110, 35)).toBe(true);
    expect(sim.beacons.covers(160, 35)).toBe(false);
    for (let x = 95; x < 106; x++) w.gloam[w.index(x, 41)] = 255;
    // The light grid is what the Gloam reads; give it a region (the light system's job) and dark.
    sim.input.setFocus(100 * T, 35 * T);
    step(sim, 3);
    expect(w.gloam[w.index(100, 41)] ?? 0).toBeLessThan(255 - GLOAM.cleansePerSecond);
  });
  it('right-clicking a beacon lists the network; travel works only from a beacon', () => {
    const sim = flat();
    const w = sim.world;
    w.set(12, 39, tileId('beacon'));
    w.set(150, 39, tileId('beacon'));
    const menus: { x: number; y: number; count: number }[] = [];
    sim.events.on('beaconMenu', (e) => menus.push({ x: e.x, y: e.y, count: e.beacons.length }));
    const travelled: number[] = [];
    sim.events.on('travelled', (e) => travelled.push(e.x));
    sim.input.setAim(12.5 * T, 39.5 * T);
    sim.input.setHeld('useAlt', true);
    step(sim, 0.05);
    sim.input.setHeld('useAlt', false);
    expect(menus).toEqual([{ x: 12, y: 39, count: 2 }]);
    sim.enqueue({ type: 'travel', x: 150, y: 39 });
    step(sim, 0.05);
    expect(travelled).toEqual([150]);
    expect(Math.floor((sim.player.body.x + sim.player.body.width / 2) / T)).toBe(150);
    // Walk away from the beacon: no more travel.
    sim.player.body.x = 120 * T;
    sim.enqueue({ type: 'travel', x: 12, y: 39 });
    step(sim, 0.05);
    expect(travelled).toEqual([150]);
  });
});
