import { describe, expect, it } from 'vitest';
import { TILE_SIZE } from '../../../src/config';
import { DEPTH_LAYERS, LIQUID, SURFACE_BIOMES } from '../../../src/data/biomes';
import { tileId, TILES } from '../../../src/data/tiles';
import { generateWorld, WORLDGEN_STEPS } from '../../../src/workers/worldgen/generateWorld';

const W = 700;
const H = 360;

function fnv1a(...arrays: ArrayLike<number>[]): number {
  let h = 0x811c9dc5;
  for (const a of arrays)
    for (let i = 0; i < a.length; i++) h = Math.imul(h ^ (a[i] ?? 0), 0x01000193);
  return h >>> 0;
}

describe('generateWorld', () => {
  const world = generateWorld(W, H, 42);
  const { fg, liquidType, surfaceBiome, layerTops } = world.arrays;
  const at = (x: number, y: number) => fg[y * W + x] ?? 0;

  it('same seed → identical world (every array), different seed → different', () => {
    const again = generateWorld(W, H, 42);
    const a = world.arrays;
    const b = again.arrays;
    expect(fnv1a(b.fg, b.bg, b.liquid, b.liquidType, b.gloam, b.surfaceBiome, b.layerTops)).toBe(
      fnv1a(a.fg, a.bg, a.liquid, a.liquidType, a.gloam, a.surfaceBiome, a.layerTops),
    );
    expect([again.spawnX, again.spawnY]).toEqual([world.spawnX, world.spawnY]);
    expect(fnv1a(generateWorld(W, H, 43).arrays.fg)).not.toBe(fnv1a(a.fg));
  });

  it('runs the 12 steps of plan 3.2 in order with progress', () => {
    const progress: number[] = [];
    generateWorld(200, 120, 1, (f) => progress.push(f));
    expect(WORLDGEN_STEPS).toHaveLength(12);
    expect(progress).toEqual([...progress].sort((p, q) => p - q));
    expect(progress.at(-1)).toBe(1);
  });

  it('spawns the player in the middle on dry, solid ground with open air above', () => {
    const tx = Math.floor(world.spawnX / TILE_SIZE);
    const ty = world.spawnY / TILE_SIZE;
    expect(tx).toBe(W / 2);
    expect(TILES[at(tx, ty)]?.solid).toBe(true);
    for (let dy = 1; dy <= 4; dy++) {
      expect(at(tx, ty - dy)).toBe(0);
      expect(liquidType[(ty - dy) * W + tx]).toBe(LIQUID.none);
    }
  });

  it('places Elderglade in the middle and the other two surface biomes on the sides', () => {
    expect(SURFACE_BIOMES[surfaceBiome[W / 2] ?? 0]?.key).toBe('elderglade');
    const sides = new Set([surfaceBiome[5], surfaceBiome[W - 6]]);
    expect(sides).toEqual(new Set([1, 2]));
  });

  it('stacks the depth layers in order, each with its own rock', () => {
    for (let i = 1; i < layerTops.length; i++)
      expect(layerTops[i]).toBeGreaterThan(layerTops[i - 1]!);
    const count = (id: number, y0: number, y1: number) => {
      let n = 0;
      for (let y = y0; y < y1; y++) for (let x = 0; x < W; x++) if (at(x, y) === id) n++;
      return n;
    };
    const bottom = DEPTH_LAYERS.length - 1;
    expect(count(tileId('gloam_veined_stone'), layerTops[bottom]! + 12, H)).toBeGreaterThan(500);
    const ember = DEPTH_LAYERS.findIndex((l) => l.key === 'ember_roots');
    expect(
      count(tileId('basalt'), layerTops[ember]! + 12, layerTops[ember + 1]! - 12),
    ).toBeGreaterThan(500);
  });

  it('puts ores in their layers (no emberite near the top, copper up high)', () => {
    let copperTop = 0;
    let emberiteTop = 0;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (at(x, y) === tileId('copper_ore') && y < layerTops[2]!) copperTop++;
        if (at(x, y) === tileId('emberite_ore') && y < layerTops[3]! - 12) emberiteTop++;
      }
    }
    expect(copperTop).toBeGreaterThan(50);
    expect(emberiteTop).toBe(0);
  });

  it('has caves, water and (deep down) lava, and liquids rest on something', () => {
    let water = 0;
    let lava = 0;
    let floating = 0;
    for (let y = 0; y < H - 1; y++) {
      for (let x = 0; x < W; x++) {
        const t = liquidType[y * W + x];
        if (t === LIQUID.water) water++;
        if (t === LIQUID.lava) lava++;
        if (t && at(x, y + 1) === 0 && liquidType[(y + 1) * W + x] === LIQUID.none) floating++;
      }
    }
    expect(water).toBeGreaterThan(0);
    expect(lava).toBeGreaterThan(0);
    expect(floating).toBe(0);
  });

  it('fills some surface dips with open-air water pools, never in the spawn glade', () => {
    // Real dips are rare on the gentle hills, so this needs a full-width (medium) world.
    const MW = 4200;
    const MH = 1200;
    const medium = generateWorld(MW, MH, 42).arrays;
    let poolColumns = 0;
    for (let x = 0; x < MW; x++) {
      // The first non-air cell from the sky down is water: a pool open to the sky.
      let y = 0;
      while (y < MH && medium.fg[y * MW + x] === 0 && medium.liquidType[y * MW + x] === 0) y++;
      if (medium.liquidType[y * MW + x] !== LIQUID.water) continue;
      poolColumns++;
      expect(Math.abs(x - MW / 2)).toBeGreaterThan(40);
    }
    expect(poolColumns).toBeGreaterThan(0);
  }, 30_000);

  it('generates a medium world well under the 15 s budget', () => {
    const t = performance.now();
    generateWorld(4200, 1200, 7);
    const ms = performance.now() - t;
    console.log(`medium world generated in ${Math.round(ms)} ms`);
    expect(ms).toBeLessThan(15_000);
  }, 30_000);
});
