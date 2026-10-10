import { describe, expect, it } from 'vitest';
import { WORLD_SIZES } from '../../../src/config';
import { BOSSES } from '../../../src/data/bosses';
import { DEPTH_LAYERS, LIQUID, SURFACE_BIOMES } from '../../../src/data/biomes';
import { prefabByKey } from '../../../src/data/prefabs';
import { tileId, TILES } from '../../../src/data/tiles';
import { WARDS } from '../../../src/data/wards';
import { generateWorld } from '../../../src/workers/worldgen/generateWorld';

const { width: W, height: H } = WORLD_SIZES.small;
const world = generateWorld(W, H, 42);
const { fg, liquid, liquidType, surfaceBiome, layerTops } = world.arrays;
const WARD_IDS = new Set(WARDS.map((w) => tileId(w.tile)));
const SOLID = TILES.map((t) => t.solid && !t.platform);

const arena = (key: string) => {
  const a = world.arenas.find((r) => r.key === key);
  if (!a) throw new Error(`no arena ${key}`);
  return a;
};
const layerRows = (key: string) => {
  const i = DEPTH_LAYERS.findIndex((l) => l.key === key);
  return { top: layerTops[i] ?? 0, bottom: layerTops[i + 1] ?? H };
};

/**
 * Flood fill through open cells (air, liquid, platforms) from (x, y); wards count as open when
 * `throughWards`. True if it reaches open sky: a cell above every solid tile in its column.
 */
function reachesSky(x: number, y: number, throughWards: boolean): boolean {
  const ground = new Int32Array(W).fill(H);
  for (let cx = 0; cx < W; cx++) {
    for (let cy = 0; cy < H; cy++) {
      if (SOLID[fg[cy * W + cx] ?? 0]) {
        ground[cx] = cy;
        break;
      }
    }
  }
  const open = (i: number) => {
    const id = fg[i] ?? 0;
    return !SOLID[id] || (throughWards && WARD_IDS.has(id));
  };
  const seen = new Uint8Array(W * H);
  const queue = [y * W + x];
  seen[y * W + x] = 1;
  while (queue.length > 0) {
    const i = queue.pop() ?? 0;
    const cx = i % W;
    const cy = Math.floor(i / W);
    if (cy < (ground[cx] ?? H)) return true;
    for (const j of [i - 1, i + 1, i - W, i + W]) {
      if (j < 0 || j >= W * H || seen[j] || !open(j)) continue;
      seen[j] = 1;
      queue.push(j);
    }
  }
  return false;
}

describe('Boss arenas and wards (M12 world generation)', () => {
  it('places all four arenas, apart from the towns and each other', () => {
    expect(world.arenas.map((a) => a.key).sort()).toEqual(BOSSES.map((b) => b.key).sort());
    const rects = [...world.towns, ...world.arenas];
    for (const a of rects) {
      for (const b of rects) {
        if (a === b) continue;
        const apart = a.x1 < b.x0 || b.x1 < a.x0 || a.y1 < b.y0 || b.y1 < a.y0;
        expect(apart, `${a.key} vs ${b.key}`).toBe(true);
      }
    }
  });

  it('puts each arena in its own place', () => {
    const moth = arena('moth_matriarch');
    expect(moth.y1).toBeLessThan(layerRows('rootdeep').top);
    const warden = arena('hollow_warden');
    const hollows = layerRows('moonstone_hollows');
    expect(warden.y0).toBeGreaterThan(hollows.top);
    expect(warden.y1).toBeLessThan(hollows.bottom);
    const heart = arena('gloam_heart');
    expect(heart.y0).toBeGreaterThan(layerRows('gloam_heart').top);
    expect(Math.abs((heart.x0 + heart.x1) / 2 - W / 2)).toBeLessThanOrEqual(1);
    const mire = arena('mire_sovereign');
    const mireBiome = SURFACE_BIOMES.findIndex((b) => b.key === 'weeping_mire');
    for (let x = mire.x0; x <= mire.x1; x++) expect(surfaceBiome[x]).toBe(mireBiome);
  });

  it('lays each ward across the whole width at the top of its layer', () => {
    for (const ward of WARDS) {
      const { top } = layerRows(ward.layer);
      const id = tileId(ward.tile);
      for (let x = 0; x < W; x++) expect(fg[top * W + x], `${ward.key} at ${x}`).toBe(id);
    }
  });

  it('keeps the Gloam Heart chamber thick with Gloam and the Mire pool filled', () => {
    const heart = arena('gloam_heart');
    const cx = Math.floor((heart.x0 + heart.x1) / 2);
    expect(world.arrays.gloam[(heart.y0 + 1) * W + cx]).toBeGreaterThan(200);
    const mire = arena('mire_sovereign');
    const pool = prefabByKey('mire_arena').objects.find((o) => o.kind === 'pool');
    expect(pool).toBeDefined();
    if (!pool) return;
    const i = (mire.y0 + pool.y1) * W + mire.x0 + pool.x0 + 2;
    expect(liquid[i]).toBe(255);
    expect(liquidType[i]).toBe(LIQUID.water);
  });

  it('opens a way from the surface to every arena (the deep ones through their wards)', () => {
    for (const key of ['moth_matriarch', 'hollow_warden', 'gloam_heart']) {
      const a = arena(key);
      const def = BOSSES.find((b) => b.key === key);
      const boss = prefabByKey(def?.arena ?? '').objects.find((o) => o.kind === 'boss');
      if (!boss) throw new Error('no boss point');
      const bx = a.x0 + boss.x0;
      const by = a.y0 + boss.y0;
      expect(reachesSky(bx, by, true), `${key} reachable`).toBe(true);
    }
    // The Moth's nest needs no ward; the Warden's hall can't be reached without breaking one.
    const moth = arena('moth_matriarch');
    expect(reachesSky(moth.x0 + 36, moth.y0 + 8, false)).toBe(true);
    const warden = arena('hollow_warden');
    expect(reachesSky(warden.x0 + 35, warden.y0 + 20, false)).toBe(false);
  });

  it('keeps the corridors into the deep arenas open on bigger worlds (no gravel poured in)', () => {
    for (const [size, seed] of [
      ['medium', 1],
      ['large', 1],
    ] as const) {
      const { width: w, height: h } = WORLD_SIZES[size];
      const g = generateWorld(w, h, seed);
      for (const a of g.arenas) {
        const d = BOSSES.find((b) => b.key === a.key);
        if (!d || d.placement.kind === 'surface') continue;
        const gates = prefabByKey(d.arena).objects.filter((o) => o.kind === 'gate');
        // The gate a tunnel came into: one with open cells just outside it.
        const open = gates.some((gate) => {
          const gx = a.x0 + gate.x0;
          const gy = a.y0 + gate.y0;
          const out = gate.x0 === 0 ? -1 : 1;
          for (let k = 1; k <= 4; k++) {
            for (let dy = 0; dy < 2; dy++) {
              if (SOLID[g.arrays.fg[(gy - dy) * w + gx + out * k] ?? 0]) return false;
            }
          }
          return true;
        });
        expect(open, `${size} ${seed} ${a.key}`).toBe(true);
      }
    }
  }, 120000);

  it('is the same for the same seed', () => {
    expect(generateWorld(W, H, 42).arenas).toEqual(world.arenas);
  });
});
