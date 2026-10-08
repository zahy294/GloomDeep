/**
 * Deterministic generator of synthetic "Nano Banana style" images for import-tool tests: takes a
 * true pixel-art image and produces what an image model typically hands back (uneven upscale,
 * magenta background, blurred block seams, magenta fringe, noise and slight colour drift).
 */
import { createImage, getAlpha, getRgb, setPixel, type RgbaImage } from './image';

export interface FakeAiOptions {
  /** Block size in px: a number (fractional, e.g. 6.5) or widths cycled per block (e.g. [6, 7]). */
  pitch?: number | readonly number[];
  seed?: number;
  /** Per-pixel, per-channel noise amplitude in levels. */
  noise?: number;
  /** Per-colour fixed shift amplitude in levels (moves colours slightly off-palette). */
  drift?: number;
  /** Blend the first/last pixel of every block with its neighbouring block (anti-aliased seams). */
  blur?: boolean;
  background?: number;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Start offsets of `count` blocks plus the end (length count + 1). */
function boundaries(count: number, pitch: number | readonly number[]): number[] {
  const out = [0];
  for (let i = 1; i <= count; i++) {
    if (typeof pitch === 'number') out.push(Math.floor(i * pitch));
    else out.push((out[i - 1] ?? 0) + (pitch[(i - 1) % pitch.length] ?? 1));
  }
  return out;
}

const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));

function mix(a: number, b: number, t: number): number {
  const ch = (s: number) => clamp(((a >> s) & 0xff) * (1 - t) + ((b >> s) & 0xff) * t);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

export function fakeAiImage(source: RgbaImage, opts: FakeAiOptions = {}): RgbaImage {
  const pitch = opts.pitch ?? [6, 7];
  const noise = opts.noise ?? 2;
  const drift = opts.drift ?? 2;
  const blur = opts.blur ?? true;
  const bg = opts.background ?? 0xff00ff;
  const rand = mulberry32(opts.seed ?? 1);

  const xs = boundaries(source.width, pitch);
  const ys = boundaries(source.height, pitch);
  const out = createImage(xs[source.width] ?? 0, ys[source.height] ?? 0);

  const driftOf = (rgb: number): number => {
    let h = Math.imul(rgb ^ ((opts.seed ?? 1) * 0x9e3779b1), 0x85ebca6b);
    h ^= h >>> 13;
    const ch = (shift: number) => ((h >>> shift) % (2 * drift + 1)) - drift;
    const r = clamp(((rgb >> 16) & 0xff) + ch(0));
    const g = clamp(((rgb >> 8) & 0xff) + ch(8));
    const b = clamp((rgb & 0xff) + ch(16));
    return (r << 16) | (g << 8) | b;
  };

  // Colour of source pixel (sx, sy): the (drifted) sprite colour, or the background.
  const sourceColor = (sx: number, sy: number): number => {
    if (sx < 0 || sy < 0 || sx >= source.width || sy >= source.height) return bg;
    if (getAlpha(source, sx, sy) < 128) return bg;
    const rgb = getRgb(source, sx, sy);
    return drift ? driftOf(rgb) : rgb;
  };

  for (let sy = 0; sy < source.height; sy++) {
    for (let sx = 0; sx < source.width; sx++) {
      const x0 = xs[sx] ?? 0;
      const x1 = xs[sx + 1] ?? 0;
      const y0 = ys[sy] ?? 0;
      const y1 = ys[sy + 1] ?? 0;
      const own = sourceColor(sx, sy);
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          let c = own;
          if (blur) {
            if (x === x0 && sx > 0) c = mix(c, sourceColor(sx - 1, sy), 0.5);
            else if (x === x1 - 1 && sx < source.width - 1)
              c = mix(c, sourceColor(sx + 1, sy), 0.5);
            if (y === y0 && sy > 0) c = mix(c, sourceColor(sx, sy - 1), 0.5);
            else if (y === y1 - 1 && sy < source.height - 1)
              c = mix(c, sourceColor(sx, sy + 1), 0.5);
          }
          if (noise) {
            const n = () => Math.round((rand() * 2 - 1) * noise);
            c =
              (clamp(((c >> 16) & 0xff) + n()) << 16) |
              (clamp(((c >> 8) & 0xff) + n()) << 8) |
              clamp((c & 0xff) + n());
          }
          setPixel(out, x, y, c);
        }
      }
    }
  }
  return out;
}
