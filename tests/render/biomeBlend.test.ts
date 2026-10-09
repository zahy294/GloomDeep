import { describe, expect, it } from 'vitest';
import { BIOME_BLEND } from '../../src/config';
import { BIOME_VISUALS } from '../../src/data/biomeVisuals';
import { DEPTH_LAYERS, SURFACE_BIOMES } from '../../src/data/biomes';
import {
  approachWeights,
  biomeWeights,
  blendColor,
  blendNumber,
  SURFACE_COUNT,
  VISUALS,
} from '../../src/render/biomeBlend';
import { World } from '../../src/sim/world/World';

const W = 400;
const H = 300;
const GROUND = 60;

/** Biome 0 left of x = 200, biome 1 right of it; layers start at rows 100, 150, 200, 230, 260. */
function makeWorld(): World {
  const world = new World({ width: W, height: H, chunkSize: 50 });
  for (let x = 0; x < W; x++) {
    world.surfaceBiome[x] = x < 200 ? 0 : 1;
    for (let y = GROUND; y < H; y++) world.fg[y * W + x] = 4;
  }
  world.layerTops.set([100, 150, 200, 230, 260]);
  world.touchAll();
  return world;
}

const weights = () => new Float32Array(VISUALS.length);
const sum = (w: Float32Array) => w.reduce((a, b) => a + b, 0);

describe('biomeWeights', () => {
  it('has a visual entry for every surface biome and depth layer', () => {
    expect(VISUALS.map((v) => v.key)).toEqual([
      ...SURFACE_BIOMES.map((b) => b.key),
      ...DEPTH_LAYERS.map((l) => l.key),
    ]);
    expect(BIOME_VISUALS).toHaveLength(VISUALS.length);
  });

  it('is one surface biome in the middle of it, on the surface', () => {
    const w = biomeWeights(makeWorld(), 50, GROUND - 5, weights());
    expect(w[0]).toBeCloseTo(1, 6);
    expect(sum(w)).toBeCloseTo(1, 6);
  });

  it('blends across a biome border, half and half right on it', () => {
    const world = makeWorld();
    const atBorder = biomeWeights(world, 200, GROUND - 5, weights());
    expect(atBorder[0]).toBeGreaterThan(0.35);
    expect(atBorder[1]).toBeGreaterThan(0.35);
    const pastIt = biomeWeights(world, 200 + BIOME_BLEND.columnRadius + 2, GROUND - 5, weights());
    expect(pastIt[1]).toBeCloseTo(1, 6);
  });

  it('fades from the surface into the depth layer going underground', () => {
    const world = makeWorld();
    const shallow = biomeWeights(world, 50, GROUND + BIOME_BLEND.surfaceDepth - 1, weights());
    expect(shallow[0]).toBeCloseTo(1, 6);
    const deep = biomeWeights(world, 50, 120, weights());
    expect(deep[0]).toBe(0);
    expect(deep[SURFACE_COUNT + 0]).toBeCloseTo(1, 6); // first layer (rows 100–149)
    expect(sum(deep)).toBeCloseTo(1, 6);
  });

  it('blends neighbouring depth layers near their boundary', () => {
    const world = makeWorld();
    const w = biomeWeights(world, 50, 199, weights()); // just above layer 2's top (200)
    expect(w[SURFACE_COUNT + 1]).toBeGreaterThan(0.45);
    expect(w[SURFACE_COUNT + 2]).toBeGreaterThan(0.45);
    expect(sum(w)).toBeCloseTo(1, 6);
  });
});

describe('blending helpers', () => {
  it('approachWeights gets ~95% of the way in the transition time, frame-rate independent', () => {
    const target = weights();
    target[1] = 1;
    const at60 = weights();
    at60[0] = 1;
    for (let i = 0; i < BIOME_BLEND.transitionSeconds * 60; i++) {
      approachWeights(at60, target, 1 / 60);
    }
    const at30 = weights();
    at30[0] = 1;
    for (let i = 0; i < BIOME_BLEND.transitionSeconds * 30; i++) {
      approachWeights(at30, target, 1 / 30);
    }
    expect(at60[1]).toBeGreaterThan(0.94);
    expect(at60[1]).toBeCloseTo(at30[1] ?? 0, 6);
  });

  it('blendNumber and blendColor average by weight', () => {
    const w = weights();
    w[0] = 0.5;
    w[1] = 0.5;
    const a = VISUALS[0]!;
    const b = VISUALS[1]!;
    expect(blendNumber(w, (v) => v.grade.saturation)).toBeCloseTo(
      (a.grade.saturation + b.grade.saturation) / 2,
      6,
    );
    const red = blendColor(w, (v) => (v === a ? 0xff0000 : 0x0000ff));
    expect(red).toBe(0x800080);
  });
});
