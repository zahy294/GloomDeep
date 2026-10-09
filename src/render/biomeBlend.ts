import { BIOME_BLEND } from '../config';
import { DEPTH_LAYERS, SURFACE_BIOMES } from '../data/biomes';
import { biomeVisual, type BiomeVisual } from '../data/biomeVisuals';
import type { World } from '../sim/world/World';

/** Visual entries in blend order: the surface biomes, then the depth layers. */
export const VISUALS: readonly BiomeVisual[] = [
  ...SURFACE_BIOMES.map((b) => biomeVisual(b.key)),
  ...DEPTH_LAYERS.map((l) => biomeVisual(l.key)),
];
export const SURFACE_COUNT = SURFACE_BIOMES.length;

const smooth = (t: number) => {
  const c = t < 0 ? 0 : t > 1 ? 1 : t;
  return c * c * (3 - 2 * c);
};

/**
 * How much each place (VISUALS order) shapes the look at a tile, summing to 1. Surface biomes
 * blend across borders (a weighted window of columns); below the ground the surface fades into
 * the depth layer, and neighbouring layers blend near their boundary. Writes into `out`.
 */
export function biomeWeights(
  world: World,
  tileX: number,
  tileY: number,
  out: Float32Array,
): Float32Array {
  out.fill(0);
  const x = Math.max(0, Math.min(world.width - 1, Math.round(tileX)));
  const depth = tileY - world.groundRow(x);
  const surface = 1 - smooth((depth - BIOME_BLEND.surfaceDepth) / BIOME_BLEND.surfaceFade);

  if (surface > 0) {
    const r = BIOME_BLEND.columnRadius;
    let total = 0;
    for (let dx = -r; dx <= r; dx += BIOME_BLEND.columnStep) {
      const cx = x + dx;
      if (cx < 0 || cx >= world.width) continue;
      const w = 1 - Math.abs(dx) / (r + 1);
      out[world.surfaceBiome[cx] ?? 0]! += w;
      total += w;
    }
    for (let i = 0; i < SURFACE_COUNT; i++) out[i] = ((out[i] ?? 0) / total) * surface;
  }

  if (surface < 1) {
    const under = 1 - surface;
    const tops = world.layerTops;
    let layer = 0;
    for (let i = 1; i < tops.length; i++) if (tileY >= (tops[i] ?? Infinity)) layer = i;
    // Within layerFade rows of the next layer's top, blend towards it (and symmetric above).
    const fade = BIOME_BLEND.layerFade;
    const nextTop = tops[layer + 1];
    const ownTop = tops[layer] ?? 0;
    let mix = 0;
    let other = layer;
    if (nextTop !== undefined && nextTop - tileY < fade) {
      other = layer + 1;
      mix = 0.5 * (1 - (nextTop - tileY) / fade);
    } else if (layer > 0 && tileY - ownTop < fade) {
      other = layer - 1;
      mix = 0.5 * (1 - (tileY - ownTop) / fade);
    }
    out[SURFACE_COUNT + layer]! += under * (1 - mix);
    out[SURFACE_COUNT + other]! += under * mix;
  }
  return out;
}

/** Moves `current` towards `target` with a time constant, so a crossing fades over seconds. */
export function approachWeights(
  current: Float32Array,
  target: Float32Array,
  dt: number,
  seconds = BIOME_BLEND.transitionSeconds,
): void {
  const k = 1 - Math.exp(-dt / (seconds / 3)); // ~95% of the way after `seconds`
  for (let i = 0; i < current.length; i++) {
    const c = current[i] ?? 0;
    current[i] = c + ((target[i] ?? 0) - c) * k;
  }
}

/** Weighted average of a number picked from each visual. */
export function blendNumber(weights: Float32Array, pick: (v: BiomeVisual) => number): number {
  let sum = 0;
  let total = 0;
  for (let i = 0; i < VISUALS.length; i++) {
    const w = weights[i] ?? 0;
    if (w <= 0) continue;
    sum += pick(VISUALS[i]!) * w;
    total += w;
  }
  return total > 0 ? sum / total : 0;
}

/** Weighted average of a 0xRRGGBB colour picked from each visual. */
export function blendColor(weights: Float32Array, pick: (v: BiomeVisual) => number): number {
  const r = blendNumber(weights, (v) => (pick(v) >> 16) & 0xff);
  const g = blendNumber(weights, (v) => (pick(v) >> 8) & 0xff);
  const b = blendNumber(weights, (v) => pick(v) & 0xff);
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b);
}
