import { describe, expect, it } from 'vitest';
import { SHAFTS } from '../../src/config';
import {
  beamAlpha,
  beamLean,
  findShafts,
  makeRandom,
  wantedCounts,
  whenFactor,
} from '../../src/render/glowMath';
import { VISUALS } from '../../src/render/biomeBlend';
import type { VisualState } from '../../src/render/VisualState';
import { World } from '../../src/sim/world/World';

const W = 60;
const H = 60;
const GROUND = 40;

function leafId(): number {
  // Find a non-solid tile that lets only part of the sun through.
  const probe = new World({ width: 3, height: 3, chunkSize: 3 });
  for (let id = 1; id < 200; id++) {
    probe.set(1, 1, id);
    if ((probe.canopyShade[1] ?? 1) < 1 && (probe.skyline[1] ?? 0) > 1) return id;
  }
  throw new Error('no leaf tile found');
}

/** Ground at row 40, leaves rows 10-14 everywhere in x 10..40 except a gap at 20..21. */
function treeWorld(gapFrom = 20, gapTo = 21): World {
  const leaf = leafId();
  const world = new World({ width: W, height: H, chunkSize: 20 });
  for (let x = 0; x < W; x++) for (let y = GROUND; y < H; y++) world.set(x, y, 4);
  for (let x = 10; x <= 40; x++) {
    if (x >= gapFrom && x <= gapTo) continue;
    for (let y = 10; y <= 14; y++) world.set(x, y, leaf);
  }
  return world;
}

describe('findShafts', () => {
  it('finds one merged shaft in a canopy gap', () => {
    const shafts = findShafts(treeWorld(), 0, W - 1);
    expect(shafts).toHaveLength(1);
    const s = shafts[0]!;
    expect(s.widthTiles).toBe(2);
    expect(s.x).toBe(21);
    expect(s.topRow).toBe(10 + SHAFTS.topInsetTiles);
    expect(s.bottomRow).toBe(GROUND);
  });

  it('ignores open sky at the canopy edge and gaps that are too wide', () => {
    expect(findShafts(treeWorld(20, 20 + SHAFTS.maxGapTiles), 0, W - 1)).toHaveLength(0);
    const edgeOnly = findShafts(treeWorld(10, 11), 0, W - 1);
    expect(edgeOnly.every((s) => s.x > 10)).toBe(true);
  });

  it('only reports columns inside the requested range and follows tile edits', () => {
    const world = treeWorld();
    expect(findShafts(world, 0, 10)).toHaveLength(0);
    for (let y = 10; y <= 14; y++) world.set(20, y, world.fg[10 * W + 19] ?? 0);
    for (let y = 10; y <= 14; y++) world.set(21, y, world.fg[10 * W + 19] ?? 0);
    expect(findShafts(world, 0, W - 1)).toHaveLength(0);
  });
});

describe('beamLean', () => {
  it('slants right in the morning, left in the evening, vertical at noon', () => {
    expect(beamLean(0.25)).toBeCloseTo(SHAFTS.maxLean);
    expect(beamLean(0.5)).toBeCloseTo(0);
    expect(beamLean(0.75)).toBeCloseTo(-SHAFTS.maxLean);
    expect(beamLean(0.35)).toBeGreaterThan(0);
  });
});

describe('beamAlpha', () => {
  it('is strongest at golden hours, dimmer at noon, gone at night, rain and indoors', () => {
    const golden = beamAlpha(1, 0.3, 0, 1);
    const noon = beamAlpha(1, 0.5, 0, 1);
    expect(golden).toBeGreaterThan(noon);
    expect(noon).toBeGreaterThan(0);
    expect(beamAlpha(0, 0.9, 0, 1)).toBe(0);
    expect(beamAlpha(1, 0.3, 1, 1)).toBe(0);
    expect(beamAlpha(1, 0.3, 0, 0)).toBe(0);
    expect(golden).toBeLessThanOrEqual(SHAFTS.peakAlpha);
  });
});

describe('whenFactor and wantedCounts', () => {
  it('follows the time of day', () => {
    expect(whenFactor('always', 0, 1, 0)).toBe(1);
    expect(whenFactor('day', 0.8, 0.2, 0)).toBeCloseTo(0.8);
    expect(whenFactor('night', 0.1, 0.9, 0)).toBeCloseTo(0.9);
    expect(whenFactor('dusk', 0.5, 0.5, 1)).toBe(1);
    expect(whenFactor('dusk', 1, 0, 0)).toBe(0);
  });

  it('scales biome counts by weight, time and density', () => {
    const weights = new Float32Array(VISUALS.length);
    const elder = VISUALS.findIndex((v) => v.key === 'elderglade');
    weights[elder] = 1;
    const visual = { weights, daylight: 0.2, night: 0.8, dusk: 1 } as unknown as VisualState;
    const full = new Float32Array(5);
    const half = new Float32Array(5);
    wantedCounts(visual, 1, full);
    wantedCounts(visual, 0.5, half);
    const rule = VISUALS[elder]!.particles.find((p) => p.kind === 'firefly')!;
    expect(full[2]).toBeCloseTo(rule.count);
    expect(half[2]).toBeCloseTo(rule.count / 2);
    expect(full[0]).toBeCloseTo(VISUALS[elder]!.motes.count);
    visual.dusk = 0;
    visual.night = 0;
    wantedCounts(visual, 1, full);
    expect(full[2]).toBe(0);
  });
});

describe('makeRandom', () => {
  it('is deterministic and in range', () => {
    const a = makeRandom(5);
    const b = makeRandom(5);
    for (let i = 0; i < 20; i++) {
      const v = a();
      expect(v).toBe(b());
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});
