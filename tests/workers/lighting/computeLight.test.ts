import { describe, expect, it } from 'vitest';
import { LIGHT } from '../../../src/config';
import { lightByKey } from '../../../src/data/lights';
import { TILES, tileId } from '../../../src/data/tiles';
import { mulberry32 } from '../../../src/sim/random';
import { computeLight, seedLight } from '../../../src/workers/lighting/computeLight';
import type { LightCone, LightJob } from '../../../src/workers/lighting/lightJob';

const AIR = tileId('air');
const STONE = tileId('stone');
const LUMEN = tileId('lumen_crystal');
const TORCH = tileId('torch');

function makeJob(width: number, height: number, over: Partial<LightJob> = {}): LightJob {
  const n = width * height;
  return {
    id: 1,
    x0: 0,
    y0: 0,
    width,
    height,
    fg: new Uint16Array(n).fill(AIR),
    skyline: new Int32Array(width).fill(-1000),
    sunR: 0,
    sunG: 0,
    sunB: 0,
    points: new Float32Array(0),
    cone: null,
    time: 0,
    focusX: 0,
    focusY: 0,
    outR: new Uint8Array(n),
    outG: new Uint8Array(n),
    outB: new Uint8Array(n),
    ...over,
  };
}

function point(
  x: number,
  y: number,
  r: number,
  g: number,
  b: number,
  radius: number,
): Float32Array {
  return new Float32Array([x, y, r, g, b, radius]);
}

const at = (r: { r: Uint8Array; width: number }, x: number, y: number) => r.r[y * r.width + x]!;

describe('computeLight flood fill', () => {
  it('falls off linearly by airFalloff per tile (Manhattan distance)', () => {
    const job = makeJob(21, 21, { points: point(10.5, 10.5, 255, 255, 255, 10) });
    const res = computeLight(job);
    const start = Math.min(255, 10 * LIGHT.airFalloff);
    expect(at(res, 10, 10)).toBe(start);
    expect(at(res, 13, 10)).toBe(start - 3 * LIGHT.airFalloff);
    expect(at(res, 12, 13)).toBe(start - 5 * LIGHT.airFalloff);
    expect(at(res, 0, 0)).toBe(0);
  });

  it('is blocked by a thick wall', () => {
    const w = 15;
    const job = makeJob(w, 5, { points: point(2.5, 2.5, 255, 255, 255, 8) });
    for (let y = 0; y < 5; y++) for (let x = 6; x <= 8; x++) job.fg[y * w + x] = STONE;
    const res = computeLight(job);
    const start = 8 * LIGHT.airFalloff;
    expect(start - 3 * LIGHT.solidFalloff).toBeLessThan(0);
    expect(at(res, 9, 2)).toBe(0);
    expect(at(res, 5, 2)).toBeGreaterThan(0);
  });

  it('creeps exactly one step into a solid tile', () => {
    const job = makeJob(8, 1, { points: point(0.5, 0.5, 255, 255, 255, 14) });
    job.fg[3] = STONE;
    const res = computeLight(job);
    const before = at(res, 2, 0);
    expect(at(res, 3, 0)).toBe(before - LIGHT.solidFalloff);
  });

  it('keeps colour channel ratios', () => {
    const job = makeJob(9, 1, { points: point(0.5, 0.5, 200, 100, 50, 15) });
    const res = computeLight(job);
    const k = (15 * LIGHT.airFalloff) / 255;
    const d = 2 * LIGHT.airFalloff;
    expect(res.r[2]).toBe(Math.round(200 * k) - d);
    expect(res.g[2]).toBe(Math.round(100 * k) - d);
    expect(res.b[2]).toBe(Math.round(50 * k) - d);
  });

  it('takes the per-channel max of two sources, not the sum', () => {
    const job = makeJob(11, 1, {
      points: new Float32Array([
        ...point(0.5, 0.5, 255, 0, 0, 10),
        ...point(10.5, 0.5, 255, 0, 0, 10),
      ]),
    });
    const res = computeLight(job);
    expect(res.r[5]).toBe(160 - 5 * LIGHT.airFalloff);
    expect(res.r[0]).toBe(160);
  });

  it('fills columns above the skyline and spreads into an overhang', () => {
    const w = 10;
    const h = 8;
    const job = makeJob(w, h, { sunR: 255, sunG: 255, sunB: 200 });
    job.skyline.fill(4);
    for (let x = 0; x < 5; x++) job.skyline[x] = 2; // left half has a ceiling at row 2
    const res = computeLight(job);
    expect(at(res, 7, 0)).toBe(255);
    expect(at(res, 7, 3)).toBe(255);
    expect(at(res, 0, 1)).toBe(255);
    expect(res.b[0 * w + 7]).toBe(200);
    // below the skyline on the sunny side, light spreads sideways under the overhang
    expect(at(res, 5, 4)).toBe(255 - LIGHT.airFalloff);
    expect(at(res, 4, 4)).toBe(255 - 2 * LIGHT.airFalloff);
    expect(at(res, 3, 2)).toBe(255 - LIGHT.airFalloff);
  });

  it('lights an emissive tile in its colour', () => {
    const job = makeJob(9, 1);
    job.fg[4] = LUMEN;
    const def = lightByKey('lumen_crystal');
    const res = computeLight(job);
    const strength = Math.min(255, def.radius * LIGHT.airFalloff);
    expect(res.r[4]).toBe(Math.round((def.color[0] * strength) / 255));
    expect(res.g[4]).toBe(Math.round((def.color[1] * strength) / 255));
    expect(res.b[4]).toBe(Math.round((def.color[2] * strength) / 255));
    expect(res.g[5]).toBeGreaterThan(res.r[5]!);
  });

  it('keeps flicker deterministic and within [1 - flicker, 1]', () => {
    const def = lightByKey('torch');
    const full = Math.min(255, def.radius * LIGHT.airFalloff);
    const seen = new Set<number>();
    for (let t = 0; t < 20; t += 0.37) {
      const job = makeJob(3, 1, { time: t });
      job.fg[1] = TORCH;
      const a = computeLight(job).r[1]!;
      const job2 = makeJob(3, 1, { time: t });
      job2.fg[1] = TORCH;
      expect(computeLight(job2).r[1]).toBe(a);
      const peak = (def.color[0] * full) / 255;
      expect(a).toBeLessThanOrEqual(Math.round(peak));
      expect(a).toBeGreaterThanOrEqual(Math.floor(peak * (1 - def.flicker)));
      seen.add(a);
    }
    expect(seen.size).toBeGreaterThan(1);
  });

  it('supports point lights', () => {
    const job = makeJob(5, 5, { points: point(2.9, 2.1, 100, 50, 0, 4) });
    const res = computeLight(job);
    expect(at(res, 2, 2)).toBe(Math.round((100 * 4 * LIGHT.airFalloff) / 255));
    expect(res.g[2 * 5 + 2]).toBe(Math.round((50 * 4 * LIGHT.airFalloff) / 255));
    expect(res.b[2 * 5 + 2]).toBe(0);
  });

  describe('cone', () => {
    const cone = (over: Partial<LightCone> = {}): LightCone => ({
      x: 10.5,
      y: 10.5,
      dirX: 1,
      dirY: 0,
      range: 8,
      halfAngle: Math.PI / 6,
      r: 255,
      g: 255,
      b: 255,
      ...over,
    });

    const seeds = (job: LightJob) => {
      const copy = {
        ...job,
        outR: new Uint8Array(job.fg.length),
        outG: new Uint8Array(job.fg.length),
        outB: new Uint8Array(job.fg.length),
      };
      seedLight(copy);
      return copy.outR;
    };

    it('seeds cells in front, not behind, bounded by range', () => {
      const w = 30;
      const r = seeds(makeJob(w, 21, { cone: cone() }));
      expect(r[10 * w + 14]).toBeGreaterThan(0);
      expect(r[10 * w + 6]).toBe(0);
      expect(r[10 * w + 20]).toBe(0);
      expect(r[10 * w + 12]).toBeGreaterThan(r[10 * w + 15]!);
      expect(r[10 * w + 11]).toBe(Math.round(255 * (1 - 1 / 8)));
    });

    it('is blocked by a solid tile in the path but lights the wall face', () => {
      const w = 30;
      const job = makeJob(w, 21, { cone: cone() });
      for (let y = 0; y < 21; y++) job.fg[y * w + 13] = STONE;
      const r = seeds(job);
      expect(r[10 * w + 13]).toBeGreaterThan(0);
      expect(r[10 * w + 14]).toBe(0);
      expect(r[10 * w + 15]).toBe(0);
    });
  });

  it('matches a slow Bellman-Ford reference on random grids', () => {
    for (let trial = 0; trial < 5; trial++) {
      const rnd = mulberry32(100 + trial);
      const w = 30;
      const h = 24;
      const job = makeJob(w, h, { time: trial });
      for (let i = 0; i < w * h; i++) {
        const v = rnd();
        job.fg[i] = v < 0.3 ? STONE : v < 0.33 ? LUMEN : v < 0.35 ? TORCH : AIR;
      }
      for (let x = 0; x < w; x++) job.skyline[x] = Math.floor(rnd() * 8);
      job.sunR = 240;
      job.sunG = 200;
      job.sunB = 120;
      const pts: number[] = [];
      for (let p = 0; p < 6; p++) {
        pts.push(rnd() * w, rnd() * h, rnd() * 255, rnd() * 255, rnd() * 255, 2 + rnd() * 12);
      }
      job.points = new Float32Array(pts);
      job.cone = cone2(rnd);

      // Seeds only on a copy, then relax naively.
      const seedJob = {
        ...job,
        outR: new Uint8Array(w * h),
        outG: new Uint8Array(w * h),
        outB: new Uint8Array(w * h),
      };
      seedLight(seedJob);
      const seeds = [seedJob.outR, seedJob.outG, seedJob.outB];
      const res = computeLight(job);
      for (const [ch, out] of [
        [0, res.r],
        [1, res.g],
        [2, res.b],
      ] as const) {
        const ref = Uint8Array.from(seeds[ch]!);
        let changed = true;
        while (changed) {
          changed = false;
          for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
              const v = ref[y * w + x]!;
              for (const [dx, dy] of [
                [1, 0],
                [-1, 0],
                [0, 1],
                [0, -1],
              ] as const) {
                const nx = x + dx;
                const ny = y + dy;
                if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
                const f = TILES[job.fg[ny * w + nx]!]!.solid
                  ? LIGHT.solidFalloff
                  : LIGHT.airFalloff;
                if (v - f > ref[ny * w + nx]!) {
                  ref[ny * w + nx] = v - f;
                  changed = true;
                }
              }
            }
          }
        }
        expect(Array.from(out.subarray(0, w * h))).toEqual(Array.from(ref));
      }
    }
  });

  it('computes a 104x78 region with many sources quickly', () => {
    const w = 104;
    const h = 78;
    const rnd = mulberry32(7);
    const job = makeJob(w, h, { sunR: 255, sunG: 240, sunB: 200 });
    for (let i = 0; i < w * h; i++) {
      const v = rnd();
      job.fg[i] = v < 0.35 ? STONE : v < 0.37 ? LUMEN : v < 0.38 ? TORCH : AIR;
    }
    for (let x = 0; x < w; x++) job.skyline[x] = 20 + Math.floor(rnd() * 5);
    computeLight(job); // warm up
    let best = Infinity;
    for (let i = 0; i < 10; i++) best = Math.min(best, computeLight(job).computeMs);
    console.log(`computeLight 104x78 best of 10: ${best.toFixed(2)} ms`);
    expect(best).toBeLessThan(25);
  });
});

function cone2(rnd: () => number): LightCone {
  const a = rnd() * Math.PI * 2;
  return {
    x: 15 + rnd() * 5,
    y: 10 + rnd() * 5,
    dirX: Math.cos(a),
    dirY: Math.sin(a),
    range: 10,
    halfAngle: 0.6,
    r: 255,
    g: 180,
    b: 90,
  };
}

describe('per-tile falloff', () => {
  it('leaf canopies dim light by their own falloff (more than air, less than stone)', () => {
    const LEAVES = tileId('elder_leaves');
    const leafFalloff = TILES[LEAVES]?.lightFalloff ?? 0;
    const w = 15;
    const open = computeLight(makeJob(w, 5, { points: point(2.5, 2.5, 255, 255, 255, 12) }));
    const job = makeJob(w, 5, { points: point(2.5, 2.5, 255, 255, 255, 12) });
    for (let y = 0; y < 5; y++) job.fg[y * w + 6] = LEAVES;
    const shaded = computeLight(job);
    expect(at(open, 8, 2) - at(shaded, 8, 2)).toBe(leafFalloff - LIGHT.airFalloff);
    expect(leafFalloff).toBeGreaterThan(LIGHT.airFalloff);
    expect(leafFalloff).toBeLessThan(LIGHT.solidFalloff);
  });
});
