import { describe, expect, it } from 'vitest';
import { GLOAM, TILE_SIZE } from '../../../src/config';
import { itemId } from '../../../src/data/items';
import { tileId } from '../../../src/data/tiles';
import { EventBus, type SimEvents } from '../../../src/sim/events';
import { Simulation } from '../../../src/sim/Simulation';
import { GloamSystem, type TileRect } from '../../../src/sim/systems/GloamSystem';
import { createCone, type Cone } from '../../../src/sim/systems/lanternCone';
import { AIR, World } from '../../../src/sim/world/World';

const STONE = tileId('stone');
const TICK = 1 / GLOAM.tickHz;

/** 30×20 world of solid stone; the whole world is the "lit region" handed to the system. */
function setup() {
  const events = new EventBus<SimEvents>();
  const world = new World({ width: 30, height: 20, chunkSize: 10 }, events);
  for (let y = 0; y < 20; y++) for (let x = 0; x < 30; x++) world.set(x, y, STONE);
  const gloam = new GloamSystem(world, events);
  const region: TileRect = { x0: 0, y0: 0, width: 30, height: 20 };
  const run = (seconds: number, crimson: Cone | null = null) => {
    for (let t = 0; t < seconds; t += TICK) gloam.update(TICK, region, crimson);
  };
  const at = (x: number, y: number) => world.gloam[world.index(x, y)] ?? 0;
  const light = (x0: number, y0: number, w: number, h: number, v: number) => {
    for (let y = y0; y < y0 + h; y++) {
      for (let x = x0; x < x0 + w; x++) world.lightR[world.index(x, y)] = v;
    }
  };
  return { events, world, gloam, region, run, at, light };
}

describe('GloamSystem', () => {
  it('creeps outwards through darkness and thickens where it is', () => {
    const { world, run, at } = setup();
    world.gloam[world.index(15, 10)] = 255;
    run(30);
    expect(at(16, 10)).toBeGreaterThan(GLOAM.spreadMin);
    expect(at(17, 10)).toBeGreaterThan(0);
    expect(at(25, 10)).toBe(0); // far cells not reached yet
    const near = at(16, 10);
    run(60);
    expect(at(16, 10)).toBeGreaterThan(near);
    expect(at(20, 10)).toBeGreaterThan(0);
  });

  it('weak traces below spreadMin do not grow on their own', () => {
    const { world, run, at } = setup();
    world.gloam[world.index(5, 5)] = GLOAM.spreadMin - 1;
    run(60);
    expect(at(5, 5)).toBe(GLOAM.spreadMin - 1);
  });

  it('burns away in light and never grows into lit cells', () => {
    const { world, run, at, light } = setup();
    for (let x = 0; x < 30; x++) world.gloam[world.index(x, 10)] = 255;
    light(0, 0, 15, 20, 200); // left half lit
    run(5);
    expect(at(5, 10)).toBe(0);
    expect(at(25, 10)).toBe(255);
    run(60);
    expect(at(5, 9)).toBe(0);
    expect(at(25, 9)).toBeGreaterThan(0);
  });

  it('a Crimson cone burns Gloam even in moderate light', () => {
    const { world, run, at, light } = setup();
    world.gloam.fill(255);
    light(0, 0, 30, 20, 80);
    const cone = Object.assign(createCone(), {
      x: 2,
      y: 10.5,
      dirX: 1,
      dirY: 0,
      range: 10,
      cosHalf: Math.cos(0.4),
    });
    run(1, cone);
    expect(at(6, 10)).toBe(0);
    expect(at(6, 2)).toBeGreaterThan(at(6, 10)); // outside the cone: only the plain light burns
  });

  it('placing a light burns a ring of Gloam at once', () => {
    const { world, events, at } = setup();
    world.gloam.fill(255);
    world.set(15, 10, tileId('torch'));
    events.emit('tilePlaced', { x: 15, y: 10, id: tileId('torch'), layer: 'fg' });
    expect(at(16, 10)).toBeLessThan(255 * 0.3);
    expect(at(15 + GLOAM.burstRadius + 1, 10)).toBe(255);
  });

  it('only solid blocks and background walls hold Gloam', () => {
    const { world, at, events } = setup();
    let updates = 0;
    events.on('gloamUpdated', () => updates++);
    world.gloam[world.index(3, 3)] = 200;
    world.set(3, 3, AIR);
    expect(at(3, 3)).toBe(0);
    expect(updates).toBe(1);
    world.gloam[world.index(4, 4)] = 200;
    world.setBg(4, 4, STONE);
    world.set(4, 4, AIR);
    expect(at(4, 4)).toBe(200); // the wall behind still holds it
  });
});

describe('Gloam in the running simulation (M7 Done when)', () => {
  /** A stone world with a long walled tunnel; Gloam at its far end; the player at the other. */
  function tunnelSim() {
    const sim = new Simulation({
      size: { width: 80, height: 40, chunkSize: 16 },
      generate: (w) => {
        for (let y = 0; y < 40; y++) for (let x = 0; x < 80; x++) w.set(x, y, STONE);
        for (let y = 16; y < 20; y++) {
          for (let x = 4; x < 76; x++) {
            w.set(x, y, AIR);
            w.setBg(x, y, STONE);
          }
        }
        for (let y = 14; y < 22; y++) for (let x = 66; x < 76; x++) w.gloam[w.index(x, y)] = 255;
        return { spawnX: 8 * TILE_SIZE, spawnY: 20 * TILE_SIZE };
      },
    });
    sim.input.setFocus(40 * TILE_SIZE, 18 * TILE_SIZE);
    return sim;
  }
  /** Total Gloam in columns x0..x1 of rows y0..y1 (default: the tunnel and its rock lining). */
  const gloamIn = (sim: Simulation, x0: number, x1: number, y0 = 14, y1 = 22) => {
    let n = 0;
    for (let y = y0; y < y1; y++)
      for (let x = x0; x < x1; x++) n += sim.world.gloam[sim.world.index(x, y)] ?? 0;
    return n;
  };

  it('left dark, the Gloam takes the tunnel; a torch pushes it back', () => {
    const sim = tunnelSim();
    sim.player.lanternOn = false;
    const step = (seconds: number) => {
      for (let i = 0; i < seconds * 60; i++) sim.update(1000 / 60);
    };
    const before = gloamIn(sim, 50, 66);
    step(60);
    const spread = gloamIn(sim, 50, 66);
    expect(spread).toBeGreaterThan(before + 500);

    // Light it: a torch on the tunnel floor in the middle of the spread.
    sim.giveItems([{ item: 'torch', count: 1 }]);
    const slot = sim.inventory.slots.findIndex((s) => s?.itemId === itemId('torch'));
    sim.enqueue({ type: 'selectSlot', slot });
    sim.player.body.x = 58 * TILE_SIZE;
    sim.player.body.y = 20 * TILE_SIZE - sim.player.body.height;
    sim.input.setAim(60.5 * TILE_SIZE, 18.5 * TILE_SIZE);
    sim.input.setHeld('useAlt', true);
    step(0.2);
    sim.input.setHeld('useAlt', false);
    expect(sim.world.get(60, 18)).toBe(tileId('torch'));
    step(10);
    // The tunnel around the torch is clean; only Gloam deep in the rock, out of the light, stays.
    expect(gloamIn(sim, 56, 65, 16, 20)).toBe(0);
    expect(gloamIn(sim, 56, 65)).toBeLessThan(spread / 2);
  });
});
