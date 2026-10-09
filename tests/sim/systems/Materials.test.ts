import { describe, expect, it } from 'vitest';
import { FALLING, FIRE, LIGHT, LIQUID, SWIM, TILE_SIZE } from '../../../src/config';
import { LIQUID as KIND } from '../../../src/data/biomes';
import { itemId } from '../../../src/data/items';
import { tileId } from '../../../src/data/tiles';
import { Simulation } from '../../../src/sim/Simulation';
import { AIR, type World } from '../../../src/sim/world/World';
import { computeLight } from '../../../src/workers/lighting/computeLight';
import { WATER_LIGHT_ID, type LightJob } from '../../../src/workers/lighting/lightJob';

const T = TILE_SIZE;
const STONE = tileId('stone');

/** 60×40 stone box, hollow inside (x 2..57, y 2..29), floor from row 30; player at column 8. */
function box(): Simulation {
  const sim = new Simulation({
    size: { width: 60, height: 40, chunkSize: 20 },
    generate: (w) => {
      for (let y = 0; y < 40; y++) {
        for (let x = 0; x < 60; x++) {
          const inside = x >= 2 && x < 58 && y >= 2 && y < 30;
          if (!inside) w.set(x, y, STONE);
          w.setBg(x, y, STONE);
        }
      }
      return { spawnX: 8.5 * T, spawnY: 30 * T };
    },
    startDayFraction: 0,
  });
  sim.input.setFocus(30 * T, 20 * T);
  sim.player.lanternOn = false;
  return sim;
}

function step(sim: Simulation, seconds: number): void {
  for (let i = 0; i < Math.round(seconds * 60); i++) sim.update(1000 / 60);
}

function total(world: World, type: number): number {
  let n = 0;
  for (let i = 0; i < world.liquid.length; i++)
    if (world.liquidType[i] === type) n += world.liquid[i] ?? 0;
  return n;
}

describe('liquids', () => {
  it('water falls, spreads into a level pool and is conserved', () => {
    const sim = box();
    const w = sim.world;
    // A basin: walls at x 20 and x 31 on the floor, 4 high.
    for (let y = 26; y < 30; y++) {
      w.set(20, y, STONE);
      w.set(31, y, STONE);
    }
    for (let k = 0; k < 6; k++) sim.liquids.pour(25, 5, KIND.water, LIQUID.max);
    const poured = total(w, KIND.water);
    step(sim, 6);
    expect(total(w, KIND.water)).toBe(poured);
    // All of it is in the basin's bottom rows, roughly level.
    let topRow = 99;
    for (let y = 2; y < 30; y++) {
      for (let x = 21; x < 31; x++)
        if ((w.liquid[w.index(x, y)] ?? 0) > 0) topRow = Math.min(topRow, y);
    }
    expect(topRow).toBeGreaterThanOrEqual(28);
    const bottom = Array.from({ length: 10 }, (_, k) => w.liquid[w.index(21 + k, 29)] ?? 0);
    expect(Math.max(...bottom) - Math.min(...bottom)).toBeLessThan(40);
  });

  it('floods into a cave when the wall holding it back is mined', () => {
    const sim = box();
    const w = sim.world;
    for (let y = 2; y < 30; y++) w.set(40, y, STONE); // a dam
    for (let y = 22; y < 30; y++) {
      for (let x = 41; x < 58; x++) {
        w.liquid[w.index(x, y)] = LIQUID.max;
        w.liquidType[w.index(x, y)] = KIND.water;
      }
    }
    step(sim, 1);
    expect(w.liquid[w.index(30, 29)]).toBe(0);
    for (let y = 22; y < 30; y++) w.set(40, y, AIR); // breach the dam
    step(sim, 8);
    expect(w.liquid[w.index(30, 29)] ?? 0).toBeGreaterThan(0);
    expect(w.liquid[w.index(10, 29)] ?? 0).toBeGreaterThan(0);
  });

  it('water meeting lava cools it into obsidian (with a reaction event)', () => {
    const sim = box();
    const w = sim.world;
    const reactions: string[] = [];
    sim.events.on('liquidReaction', ({ x, y }) => reactions.push(`${x},${y}`));
    sim.liquids.pour(30, 29, KIND.lava, LIQUID.max);
    sim.liquids.pour(30, 20, KIND.water, LIQUID.max);
    step(sim, 3);
    expect(w.get(30, 29)).toBe(tileId('obsidian'));
    expect(reactions).toContain('30,29');
  });

  it('a block placed into liquid displaces it', () => {
    const sim = box();
    const w = sim.world;
    sim.liquids.pour(30, 29, KIND.water, LIQUID.max);
    w.set(30, 29, STONE);
    expect(w.liquid[w.index(30, 29)]).toBe(0);
  });
});

describe('swimming and lava', () => {
  it('sinks slowly in water and swims up while jump is held', () => {
    const sim = box();
    const w = sim.world;
    for (let y = 10; y < 30; y++) {
      for (let x = 2; x < 20; x++) {
        w.liquid[w.index(x, y)] = LIQUID.max;
        w.liquidType[w.index(x, y)] = KIND.water;
      }
    }
    sim.player.body.y = 15 * T;
    step(sim, 0.5);
    expect(sim.player.inLiquid).toBe(KIND.water);
    expect(sim.player.body.vy).toBeLessThanOrEqual(SWIM.maxFallSpeed);
    const y = sim.player.body.y;
    sim.input.setHeld('jump', true);
    step(sim, 0.5);
    expect(sim.player.body.y).toBeLessThan(y);
  });

  it('lava hurts', () => {
    const sim = box();
    const w = sim.world;
    for (let y = 26; y < 30; y++) {
      for (let x = 2; x < 20; x++) {
        w.liquid[w.index(x, y)] = LIQUID.max;
        w.liquidType[w.index(x, y)] = KIND.lava;
      }
    }
    step(sim, 0.1);
    expect(sim.player.health).toBe(100 - SWIM.lavaDamage);
  });
});

describe('buckets', () => {
  it('scoop water into an empty bucket and pour it back out', () => {
    const sim = box();
    const w = sim.world;
    sim.liquids.pour(11, 29, KIND.water, LIQUID.max);
    sim.giveItems([{ item: 'bucket', count: 1 }]);
    const slot = sim.inventory.slots.findIndex((s) => s?.itemId === itemId('bucket'));
    sim.enqueue({ type: 'selectSlot', slot });
    step(sim, 1 / 60);
    // Scoop before it spreads out thin.
    w.liquid[w.index(11, 29)] = LIQUID.max;
    sim.input.setAim(11.5 * T, 29.5 * T);
    sim.input.setHeld('useAlt', true);
    step(sim, 1 / 60);
    sim.input.setHeld('useAlt', false);
    expect(sim.inventory.count(itemId('water_bucket'))).toBe(1);
    const left = total(w, KIND.water);
    sim.input.setAim(13.5 * T, 27.5 * T); // within reach
    sim.input.setHeld('useAlt', true);
    step(sim, 0.3);
    sim.input.setHeld('useAlt', false);
    expect(sim.inventory.count(itemId('bucket'))).toBe(1);
    expect(total(w, KIND.water)).toBe(left + LIQUID.max);
  });
});

describe('review fixes', () => {
  it('a bucket only scoops a full cell, and pours only where it all fits', () => {
    const sim = box();
    const w = sim.world;
    w.liquid[w.index(11, 29)] = LIQUID.max - 1;
    w.liquidType[w.index(11, 29)] = KIND.water;
    expect(sim.liquids.pour(11, 29, KIND.water, LIQUID.max)).toBe(false);
    sim.giveItems([{ item: 'bucket', count: 1 }]);
    const slot = sim.inventory.slots.findIndex((s) => s?.itemId === itemId('bucket'));
    sim.enqueue({ type: 'selectSlot', slot });
    sim.input.setAim(11.5 * T, 29.5 * T);
    sim.input.setHeld('useAlt', true);
    step(sim, 1 / 60);
    expect(sim.inventory.count(itemId('water_bucket'))).toBe(0);
  });

  it('rain puts out burning grass open to the sky', () => {
    const sim = new Simulation({
      size: { width: 40, height: 20, chunkSize: 20 },
      generate: (w) => {
        for (let x = 0; x < 40; x++) w.set(x, 10, tileId('elderglade_grass'));
        for (let y = 11; y < 20; y++) for (let x = 0; x < 40; x++) w.set(x, y, STONE);
        return { spawnX: 2 * T, spawnY: 10 * T };
      },
    });
    let burned = 0;
    sim.events.on('tileBurned', () => burned++);
    sim.fire.ignite(20, 10);
    // Heavy rain the whole time.
    for (let i = 0; i < 6 * 60; i++) {
      sim.fire.update(1 / 60, 1);
    }
    expect(sim.fire.burning.size + burned).toBeLessThan(40); // it didn't sweep the whole row
  });
});

describe('falling silt and gravel', () => {
  it('mining the support brings a gravel column down, which lands as tiles again', () => {
    const sim = box();
    const w = sim.world;
    sim.giveItems([{ item: 'iron_pickaxe', count: 1 }]);
    w.set(12, 29, STONE); // a support block on the floor
    for (let y = 25; y < 29; y++) w.set(12, y, tileId('gravel'));
    sim.input.setAim(12.5 * T, 29.5 * T);
    sim.input.setHeld('useItem', true);
    for (let i = 0; i < 120 && w.get(12, 29) === STONE; i++) step(sim, 1 / 60);
    sim.input.setHeld('useItem', false); // stop before the pick digs into the gravel
    expect(w.get(12, 29)).not.toBe(STONE);
    step(sim, 2);
    // Four gravel tiles now rest on the floor, one row lower than before.
    for (let y = 26; y < 30; y++) expect(w.get(12, y)).toBe(tileId('gravel'));
    expect(w.get(12, 25)).toBe(AIR);
    expect(sim.falling.blocks).toHaveLength(0);
  });

  it('a falling block hurts what it lands on', () => {
    const sim = box();
    const w = sim.world;
    w.set(8, 10, tileId('gravel')); // hangs in the air above the player
    w.set(8, 9, STONE);
    w.set(8, 9, AIR); // a change next to it wakes the check
    step(sim, 2);
    expect(sim.player.health).toBe(100 - FALLING.damage);
    // It didn't entomb the player: no gravel tile where the body is.
    for (let y = 27; y < 30; y++) expect(w.get(8, y)).not.toBe(tileId('gravel'));
  });
});

describe('fire', () => {
  it('spreads through wood and grass, burns out, and leaves soil under burned grass', () => {
    const sim = box();
    const w = sim.world;
    for (let x = 20; x < 40; x++) w.set(x, 29, tileId('elderglade_grass'));
    for (let y = 20; y < 29; y++) w.set(30, y, tileId('living_wood'));
    const started: string[] = [];
    sim.events.on('fireStarted', ({ x, y }) => started.push(`${x},${y}`));
    expect(sim.fire.ignite(25, 29)).toBe(true);
    step(sim, 25);
    expect(started.length).toBeGreaterThan(10);
    expect(w.get(30, 25)).toBe(AIR); // the wooden column burned away
    let soil = 0;
    for (let x = 20; x < 40; x++) if (w.get(x, 29) === tileId('forest_soil')) soil++;
    expect(soil).toBeGreaterThan(10);
  });

  it('water puts fires out, and stone never burns', () => {
    const sim = box();
    const w = sim.world;
    w.set(20, 29, tileId('elderwood_planks'));
    expect(sim.fire.ignite(25, 29)).toBe(false); // stone wall behind, stone block: nothing burns
    expect(sim.fire.ignite(20, 29)).toBe(true);
    // Water flowing over a burning block puts it out.
    sim.liquids.pour(20, 28, KIND.water, LIQUID.max);
    step(sim, 1);
    expect(sim.fire.isBurning(20, 29)).toBe(false);
  });

  it('a flare lying on grass sets it alight', () => {
    const sim = box();
    const w = sim.world;
    for (let x = 2; x < 58; x++) w.set(x, 29, tileId('elderglade_grass'));
    for (let x = 12; x < 58; x++) w.set(x, 28, tileId('grass_tuft'));
    sim.giveItems([{ item: 'flare', count: 1 }]);
    const slot = sim.inventory.slots.findIndex((s) => s?.itemId === itemId('flare'));
    sim.enqueue({ type: 'selectSlot', slot });
    sim.input.setAim(16 * T, 27 * T);
    sim.input.setHeld('useAlt', true);
    step(sim, 1 / 30);
    sim.input.setHeld('useAlt', false);
    let fires = 0;
    sim.events.on('fireStarted', () => fires++);
    step(sim, 3 / FIRE.flareIgnitePerSecond + 2);
    expect(fires).toBeGreaterThan(0);
  });
});

describe('light through water', () => {
  it('water dims red faster than blue', () => {
    const width = 20;
    const height = 1;
    const fg = new Uint16Array(width).fill(WATER_LIGHT_ID);
    const job: LightJob = {
      id: 1,
      x0: 0,
      y0: 0,
      width,
      height,
      fg,
      skyline: new Int32Array(width).fill(height),
      canopyTop: new Int32Array(width).fill(height),
      canopyShade: new Float32Array(width).fill(1),
      sunR: 0,
      sunG: 0,
      sunB: 0,
      points: new Float32Array([0.5, 0.5, 255, 255, 255, 12]),
      cone: null,
      time: 0,
      focusX: 0,
      focusY: 0,
      outR: new Uint8Array(width),
      outG: new Uint8Array(width),
      outB: new Uint8Array(width),
    };
    const r = computeLight(job);
    expect(r.b[3]! - r.r[3]!).toBe(3 * (LIGHT.waterFalloff.r - LIGHT.waterFalloff.b));
  });
});
