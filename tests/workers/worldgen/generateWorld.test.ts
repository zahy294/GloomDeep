import { describe, expect, it } from 'vitest';
import { TILE_SIZE, WATER_FX } from '../../../src/config';
import { DEPTH_LAYERS, LIQUID, SURFACE_BIOMES } from '../../../src/data/biomes';
import { tileId, TILES } from '../../../src/data/tiles';
import { generateWorld, WORLDGEN_STEPS } from '../../../src/workers/worldgen/generateWorld';
import { SPAWN_TREE } from '../../../src/data/trees';
import { Simulation } from '../../../src/sim/Simulation';
import { isSolidId } from '../../../src/workers/worldgen/context';
import { decorSupported, isDecor } from '../../../src/sim/world/decor';

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

describe('giant trees (medium world)', () => {
  const MW = 4200;
  const MH = 1200;
  const generated = generateWorld(MW, MH, 1);
  const { world } = Simulation.fromGenerated(generated);
  const TRUNK = tileId('living_wood');
  const BRANCH = tileId('branch');
  const spawnX = Math.floor(generated.spawnX / TILE_SIZE);

  /** Trunk centres: runs of living-wood wall columns 10 rows above the ground. */
  function trunks(): number[] {
    const found: number[] = [];
    let start = -1;
    for (let x = 0; x <= MW; x++) {
      const y = world.groundRow(Math.min(x, MW - 1)) - 10;
      const isTrunk = x < MW && world.getBg(x, y) === TRUNK;
      if (isTrunk && start < 0) start = x;
      if (!isTrunk && start >= 0) {
        found.push(Math.floor((start + x - 1) / 2));
        start = -1;
      }
    }
    return found;
  }

  it('grows a giant tree at the edge of the starting glade, its canopy over the spawn side', () => {
    const near = trunks().filter((x) => Math.abs(x - (spawnX + SPAWN_TREE.offset)) <= 3);
    expect(near).toHaveLength(1);
    // The canopy filters the sun over part of the glade, with gaps letting full sun through.
    const span = Array.from({ length: 60 }, (_, i) => spawnX + SPAWN_TREE.offset - 30 + i);
    expect(span.some((x) => world.canopyShade[x]! < 1)).toBe(true);
    expect(span.some((x) => world.canopyShade[x] === 1)).toBe(true);
    // The spawn itself stays clear: open air above the feet.
    const ground = world.groundRow(spawnX);
    for (let y = ground - 3; y < ground; y++) expect(world.isSolid(spawnX, y)).toBe(false);
  });

  it('has the wood, copper and iron for the first tools near the spawn (M6)', () => {
    const count = (key: string, x0: number, x1: number, dy0: number, dy1: number, bg = false) => {
      const id = tileId(key);
      let n = 0;
      for (let x = x0; x < x1; x++) {
        const ground = world.groundRow(x);
        for (let y = ground + dy0; y < ground + dy1; y++) {
          if ((bg ? world.getBg(x, y) : world.get(x, y)) === id) n++;
        }
      }
      return n;
    };
    // Trunk walls within jumping height, choppable by hand.
    expect(count('living_wood', spawnX - 100, spawnX + 100, -12, 0, true)).toBeGreaterThan(50);
    expect(count('copper_ore', spawnX - 150, spawnX + 150, 0, 80)).toBeGreaterThan(150);
    expect(count('iron_ore', spawnX - 150, spawnX + 150, 0, 120)).toBeGreaterThan(40);
  });

  it('hides Azure secrets: veiled ore veins and spirit bridges over chasms (M7)', () => {
    const VEILED = new Set([tileId('veiled_lumen'), tileId('veiled_moonsilver')]);
    const BRIDGE = tileId('veiled_spirit_platform');
    let veiled = 0;
    const bridges: { x: number; y: number; length: number }[] = [];
    for (let y = 0; y < MH; y++) {
      for (let x = 0; x < MW; x++) {
        const id = world.get(x, y);
        if (VEILED.has(id)) veiled++;
        if (id === BRIDGE && world.get(x - 1, y) !== BRIDGE) {
          let length = 0;
          while (world.get(x + length, y) === BRIDGE) length++;
          bridges.push({ x, y, length });
        }
      }
    }
    expect(veiled).toBeGreaterThan(100);
    expect(bridges.length).toBeGreaterThanOrEqual(10);
    for (const b of bridges) {
      // Flush with the cave floor on both sides, over a pit.
      expect(world.isSolid(b.x - 1, b.y)).toBe(true);
      expect(world.isSolid(b.x + b.length, b.y)).toBe(true);
      expect(world.isSolid(b.x + (b.length >> 1), b.y + 1)).toBe(false);
      expect(world.isSolid(b.x + (b.length >> 1), b.y - 1)).toBe(false);
    }
  });

  it('every surface biome has giant trees', () => {
    const biomes = new Set(trunks().map((x) => world.surfaceBiome[x]));
    expect(biomes.size).toBe(SURFACE_BIOMES.length);
  });

  it('branches are walkable platforms (no solid block on top of them)', () => {
    let branches = 0;
    for (let i = 0; i < MW * MH; i++) {
      if (world.fg[i] !== BRANCH) continue;
      branches++;
      const x = i % MW;
      const y = (i - x) / MW;
      expect(world.isSolid(x, y - 1)).toBe(false);
    }
    expect(branches).toBeGreaterThan(20);
  });

  it('every decoration is supported', () => {
    let decor = 0;
    for (let i = 0; i < MW * MH; i++) {
      const id = world.fg[i]!;
      if (!isDecor(id)) continue;
      decor++;
      const x = i % MW;
      expect(decorSupported(world, x, (i - x) / MW, id)).toBe(true);
    }
    expect(decor).toBeGreaterThan(0);
  });

  it('each surface biome grows its own flora; caves grow theirs', () => {
    const count = (key: string) => {
      const id = tileId(key);
      let n = 0;
      for (let i = 0; i < MW * MH; i++) if (world.fg[i] === id) n++;
      return n;
    };
    for (const key of ['grass_tuft', 'fern', 'silver_grass', 'moonpetal_bloom', 'mire_reed']) {
      expect(count(key), key).toBeGreaterThan(20);
    }
    for (const key of ['glowcap_sprout', 'glowmoss_tuft', 'crystal_shard', 'hanging_moss']) {
      expect(count(key), key).toBeGreaterThan(10);
    }
    expect(
      count('elder_sapling') + count('moonbirch_sapling') + count('willow_sapling'),
    ).toBeGreaterThan(5);
  });

  it('a small rune ruin stands on the glade, right of the spawn', () => {
    const RUNE = tileId('carved_runestone');
    const STONE = tileId('runestone');
    let ruin = 0;
    for (let x = spawnX + 1; x < spawnX + 30; x++) {
      for (let y = world.groundRow(x) - 8; y < world.groundRow(x) + 1; y++) {
        const id = world.get(x, y);
        if (id === RUNE || id === STONE) ruin++;
      }
    }
    expect(ruin).toBeGreaterThanOrEqual(4);
  });

  it('cuts a few waterfalls: open air along each fall, ending on ground', () => {
    const MW = 4200;
    const MH = 1200;
    const { fg } = generateWorld(MW, MH, 1).arrays;
    const FALL = tileId('waterfall');
    let falls = 0;
    for (let x = 0; x < MW; x++) {
      for (let y = 1; y < MH - 1; y++) {
        if (fg[y * MW + x] !== FALL || fg[(y - 1) * MW + x] === FALL) continue;
        // Top of a run: air above it, then falling water down to solid ground.
        falls++;
        expect(isSolidId(fg[(y - 1) * MW + x] ?? 0), 'air above the spring').toBe(false);
        let bottom = y;
        while (fg[(bottom + 1) * MW + x] === FALL) bottom++;
        expect(bottom - y, 'a real drop').toBeGreaterThanOrEqual(WATER_FX.worldgen.minDrop - 1);
        expect(isSolidId(fg[(bottom + 1) * MW + x] ?? 0), 'lands on ground').toBe(true);
        // A ledge of solid ground stands beside the top of the fall.
        const ledge = isSolidId(fg[y * MW + x - 1] ?? 0) || isSolidId(fg[y * MW + x + 1] ?? 0);
        expect(ledge, 'a ledge beside the spring').toBe(true);
      }
    }
    expect(falls).toBeGreaterThanOrEqual(3);
  });
});
