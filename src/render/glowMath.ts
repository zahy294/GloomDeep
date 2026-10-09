import { AMBIENT, SHAFTS } from '../config';
import type { ParticleRule } from '../data/biomeVisuals';
import { blendNumber, VISUALS } from './biomeBlend';
import type { VisualState } from './VisualState';

/** The world arrays shaft detection reads (a subset of World). */
export interface ShaftWorld {
  readonly width: number;
  readonly height: number;
  readonly skyline: Int32Array;
  readonly canopyTop: Int32Array;
  readonly canopyShade: Float32Array;
}

/** A gap in the leaf canopy with open ground below it. Coordinates in tiles. */
export interface Shaft {
  /** Horizontal centre of the gap. */
  readonly x: number;
  readonly widthTiles: number;
  /** First row of the beam and the ground row it ends on. */
  readonly topRow: number;
  readonly bottomRow: number;
}

const OPEN = 0.999;

/**
 * Finds canopy gaps in columns x0..x1: runs of columns with no leaves above the ground, bounded on
 * both sides by shaded columns (giant trees leave these between their leaf clumps). Open sky
 * beyond a tree edge has no shaded column on one side, so it never makes a shaft.
 */
export function findShafts(world: ShaftWorld, x0: number, x1: number): Shaft[] {
  const out: Shaft[] = [];
  const lo = Math.max(1, Math.floor(x0));
  const hi = Math.min(world.width - 2, Math.ceil(x1));
  const shaded = (x: number) =>
    (world.canopyShade[x] ?? 1) < SHAFTS.shadedBelow && (world.canopyTop[x] ?? 0) < world.height;
  let x = lo;
  while (x <= hi) {
    if ((world.canopyShade[x] ?? 1) < OPEN) {
      x++;
      continue;
    }
    const start = x;
    while (x < world.width && (world.canopyShade[x] ?? 1) >= OPEN) x++;
    const end = x - 1;
    const width = end - start + 1;
    if (width > SHAFTS.maxGapTiles || start - 1 < 0 || x >= world.width) continue;
    if (!shaded(start - 1) || !shaded(end + 1)) continue;
    const topRow =
      Math.max(world.canopyTop[start - 1] ?? 0, world.canopyTop[end + 1] ?? 0) +
      SHAFTS.topInsetTiles;
    const mid = Math.floor((start + end) / 2);
    const bottomRow = world.skyline[mid] ?? world.height;
    if (bottomRow - topRow < SHAFTS.minHeightTiles) continue;
    out.push({ x: (start + end + 1) / 2, widthTiles: width, topRow, bottomRow });
  }
  return out;
}

const clamp01 = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t);
const smooth = (t: number) => {
  const c = clamp01(t);
  return c * c * (3 - 2 * c);
};

/**
 * Beam slant in horizontal px per vertical px. The morning sun (east, left) slants light to the
 * right (positive), the evening sun to the left, noon is vertical.
 */
export function beamLean(dayFraction: number): number {
  const t = Math.max(-1, Math.min(1, (0.5 - dayFraction) / 0.25));
  return Math.sin((t * Math.PI) / 2) * SHAFTS.maxLean;
}

/** Beam opacity 0..peak: strongest at golden hours, gone at night, rain and indoors. */
export function beamAlpha(
  daylight: number,
  dayFraction: number,
  rain: number,
  outdoors: number,
): number {
  const golden = clamp01(Math.abs(dayFraction - 0.5) / 0.25);
  const hour = SHAFTS.noonAlphaFactor + (1 - SHAFTS.noonAlphaFactor) * smooth(golden * 1.4);
  const gate = smooth(
    (daylight - SHAFTS.daylightFadeFrom) / (SHAFTS.daylightFadeTo - SHAFTS.daylightFadeFrom),
  );
  return SHAFTS.peakAlpha * hour * gate * (1 - clamp01(rain)) * clamp01(outdoors);
}

/** How strongly a particle rule is active right now (0..1). */
export function whenFactor(
  when: ParticleRule['when'],
  daylight: number,
  night: number,
  dusk: number,
): number {
  switch (when) {
    case 'always':
      return 1;
    case 'day':
      return clamp01(daylight);
    case 'night':
      return clamp01(night);
    case 'dusk':
      return clamp01(Math.max(dusk * 1.5, night * AMBIENT.duskNightCarry));
  }
}

/** Where a beam's drifting motes sit: t 0..1 down the beam, u -1..1 across it. */
export function shaftPoint(
  topX: number,
  topY: number,
  lengthPx: number,
  lean: number,
  widthPx: number,
  t: number,
  u: number,
  out: { x: number; y: number },
): void {
  const width = widthPx * (1 + (SHAFTS.flare - 1) * t);
  out.x = topX + lean * lengthPx * t + (u * width) / 2;
  out.y = topY + lengthPx * t;
}

/** Small deterministic generator for particle placement (0..1). */
export function makeRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const ParticleSlot = {
  mote: 0,
  shaftMote: 1,
  firefly: 2,
  spore: 3,
  ember: 4,
} as const;

const SLOT_OF_KIND = {
  firefly: ParticleSlot.firefly,
  spore: ParticleSlot.spore,
  ember: ParticleSlot.ember,
} as const;

/** Counts per slot kind that the biome blend asks for this frame (before pool caps). */
export function wantedCounts(visual: VisualState, density: number, out: Float32Array): void {
  out.fill(0);
  out[ParticleSlot.mote] = blendNumber(visual.weights, (v) => v.motes.count) * density;
  for (let i = 0; i < VISUALS.length; i++) {
    const w = visual.weights[i] ?? 0;
    if (w <= 0) continue;
    for (const rule of VISUALS[i]?.particles ?? []) {
      if (rule.kind !== 'firefly' && rule.kind !== 'spore' && rule.kind !== 'ember') continue;
      const slot = SLOT_OF_KIND[rule.kind];
      const when = whenFactor(rule.when, visual.daylight, visual.night, visual.dusk);
      out[slot] = (out[slot] ?? 0) + rule.count * w * when * density;
    }
  }
}
