/**
 * Palette suggestion from a style reference (plan 2.9.4). Opaque pixels are clustered in OKLab with
 * weighted k-means (deterministic farthest-point seeding), the cluster centres are grouped into
 * ramps by chromaticity, and each ramp is ordered dark → light.
 */
import { createImage, setPixel, type RgbaImage } from './image';
import { oklabToRgb, rgbToOklab, toHex, type Lab } from './color';

export interface ExtractOptions {
  ramps: number;
  shades: number;
  /** Alpha at or below this is ignored. */
  alphaThreshold: number;
  iterations: number;
}

export const DEFAULT_EXTRACT: ExtractOptions = {
  ramps: 16,
  shades: 4,
  alphaThreshold: 127,
  iterations: 24,
};

/** Chroma below this counts as grey; grey ramps are listed last. */
const GREY_CHROMA = 0.02;
/** Lightness weight when grouping colours into ramps (hue and chroma matter more). */
const GROUP_LIGHTNESS_WEIGHT = 0.35;

/** Chromaticity is divided by (L + this) so dark shades keep a usable hue direction. */
const GROUP_DARK_BIAS = 0.15;

interface Point {
  lab: Lab;
  weight: number;
}

const dist2 = (p: Lab, q: Lab) => (p.L - q.L) ** 2 + (p.a - q.a) ** 2 + (p.b - q.b) ** 2;

/** Weighted k-means with deterministic farthest-point seeding. Returns the k centres. */
function kmeans(points: Point[], k: number, iterations: number, seedByWeight: boolean): Lab[] {
  if (points.length <= k) return points.map((p) => p.lab);
  const first = points.reduce((best, p) => (p.weight > best.weight ? p : best));
  const centres: Lab[] = [first.lab];
  const nearest = points.map((p) => dist2(p.lab, first.lab));
  while (centres.length < k) {
    let bestIndex = 0;
    let bestScore = -1;
    points.forEach((p, i) => {
      // sqrt(weight) keeps tiny outlier colours from winning the seeding.
      const score = (nearest[i] ?? 0) * (seedByWeight ? Math.sqrt(p.weight) : 1);
      if (score > bestScore) {
        bestScore = score;
        bestIndex = i;
      }
    });
    const chosen = points[bestIndex]!.lab;
    centres.push(chosen);
    points.forEach((p, i) => {
      nearest[i] = Math.min(nearest[i] ?? Infinity, dist2(p.lab, chosen));
    });
  }
  const assign = new Int32Array(points.length).fill(-1);
  for (let iter = 0; iter < iterations; iter++) {
    let changed = false;
    points.forEach((p, i) => {
      let best = 0;
      let bestD = Infinity;
      centres.forEach((c, ci) => {
        const d = dist2(p.lab, c);
        if (d < bestD) {
          bestD = d;
          best = ci;
        }
      });
      if (assign[i] !== best) {
        assign[i] = best;
        changed = true;
      }
    });
    if (!changed) break;
    const sums = centres.map(() => ({ L: 0, a: 0, b: 0, w: 0 }));
    points.forEach((p, i) => {
      const s = sums[assign[i] ?? 0]!;
      s.L += p.lab.L * p.weight;
      s.a += p.lab.a * p.weight;
      s.b += p.lab.b * p.weight;
      s.w += p.weight;
    });
    sums.forEach((s, ci) => {
      if (s.w > 0) centres[ci] = { L: s.L / s.w, a: s.a / s.w, b: s.b / s.w };
    });
  }
  return centres;
}

/** Returns ramps as 0xRRGGBB arrays, each dark → light; ramps ordered by hue, greys last. */
export function extractPalette(img: RgbaImage, options: Partial<ExtractOptions> = {}): number[][] {
  const opts = { ...DEFAULT_EXTRACT, ...options };
  const counts = new Map<number, number>();
  for (let i = 0; i < img.data.length; i += 4) {
    if ((img.data[i + 3] ?? 0) <= opts.alphaThreshold) continue;
    const rgb = ((img.data[i] ?? 0) << 16) | ((img.data[i + 1] ?? 0) << 8) | (img.data[i + 2] ?? 0);
    counts.set(rgb, (counts.get(rgb) ?? 0) + 1);
  }
  // Sorted so pixel order can never change the result.
  const points: Point[] = [...counts.entries()]
    .sort((x, y) => x[0] - y[0])
    .map(([rgb, weight]) => ({ lab: rgbToOklab(rgb), weight }));
  if (points.length === 0) return [];

  const colourCount = Math.min(opts.ramps * opts.shades, points.length);
  const colours = kmeans(points, colourCount, opts.iterations, true);
  const rampCount = Math.min(opts.ramps, Math.ceil(colours.length / opts.shades));

  // Group by chromaticity so a ramp's dark and light shades land together despite hue shifts.
  const features = colours.map((c) => ({
    L: c.L * GROUP_LIGHTNESS_WEIGHT,
    a: c.a / (c.L + GROUP_DARK_BIAS),
    b: c.b / (c.L + GROUP_DARK_BIAS),
  }));
  const centres = kmeans(
    features.map((lab) => ({ lab, weight: 1 })),
    rampCount,
    opts.iterations,
    false,
  );
  const groups: number[][] = centres.map(() => []);
  features.forEach((f, i) => {
    let best = 0;
    let bestD = Infinity;
    centres.forEach((g, gi) => {
      const d = dist2(f, g);
      if (d < bestD) {
        bestD = d;
        best = gi;
      }
    });
    groups[best]!.push(i);
  });

  const ramps = groups
    .filter((g) => g.length > 0)
    .map((g) => {
      const sorted = g.map((i) => colours[i]!).sort((p, q) => p.L - q.L || p.a - q.a);
      const mean = sorted.reduce((s, c) => ({ a: s.a + c.a, b: s.b + c.b }), { a: 0, b: 0 });
      return {
        colours: sorted.map(oklabToRgb),
        chroma: Math.hypot(mean.a, mean.b) / sorted.length,
        hue: Math.atan2(mean.b, mean.a),
      };
    });
  ramps.sort((p, q) => {
    const pg = p.chroma < GREY_CHROMA;
    const qg = q.chroma < GREY_CHROMA;
    if (pg !== qg) return pg ? 1 : -1;
    return p.hue - q.hue;
  });
  return ramps.map((r) => r.colours);
}

export const SWATCH_SIZE = 8;

/** Swatch image: one row per ramp, 8×8 swatches. */
export function paletteSwatches(ramps: readonly (readonly number[])[]): RgbaImage {
  const columns = Math.max(1, ...ramps.map((r) => r.length));
  const img = createImage(columns * SWATCH_SIZE, Math.max(1, ramps.length) * SWATCH_SIZE);
  ramps.forEach((ramp, row) => {
    ramp.forEach((rgb, col) => {
      for (let y = 0; y < SWATCH_SIZE; y++) {
        for (let x = 0; x < SWATCH_SIZE; x++) {
          setPixel(img, col * SWATCH_SIZE + x, row * SWATCH_SIZE + y, rgb);
        }
      }
    });
  });
  return img;
}

export function rampsToJson(ramps: readonly (readonly number[])[]): { ramps: string[][] } {
  return { ramps: ramps.map((r) => r.map(toHex)) };
}
