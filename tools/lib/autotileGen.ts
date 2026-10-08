/**
 * Blob-autotile generator (plan 2.9.7): turns one seamless base texture into the 47 shapes x 3
 * variations of a material, laid out like one tile's block of the game atlas (frame k =
 * blobIndex * variations + variation, row-major in `columns` columns).
 */
import { AUTOTILE, PLACEHOLDER_ATLAS, TILE_SIZE } from '../../src/config';
import { PALETTE, RAMP_NAMES, type Ramp } from '../../src/data/palette';
import { BLOB_MASKS, E, N, NE, NW, S, SE, SW, W } from '../../src/sim/world/autotile';
import { nearestColor, rgbToOklab } from './color';
import { createImage, getAlpha, getRgb, setPixel, type RgbaImage } from './image';

/** Where the cut for each variation starts, as a fraction of the base texture (wraps around). */
const CUT_ORIGINS: readonly (readonly [number, number])[] = [
  [0, 0],
  [0.5, 0.25],
  [0.25, 0.625],
];
/** Width of the notch carved at inner corners, in pixels. */
const NOTCH = 2;

export interface AutotileOptions {
  tileSize: number;
  columns: number;
  variations: number;
  /** Ramps to pick the outline colour from (defaults to the master palette). */
  ramps: readonly Ramp[];
}

export const DEFAULT_AUTOTILE_OPTIONS: AutotileOptions = {
  tileSize: TILE_SIZE,
  columns: PLACEHOLDER_ATLAS.columns,
  variations: AUTOTILE.variations,
  ramps: RAMP_NAMES.map((name) => PALETTE[name]),
};

/** The palette ramp closest to the texture's average colour. */
export function dominantRamp(base: RgbaImage, ramps: readonly Ramp[]): Ramp {
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (let i = 0; i < base.data.length; i += 4) {
    if ((base.data[i + 3] ?? 0) === 0) continue;
    r += base.data[i] ?? 0;
    g += base.data[i + 1] ?? 0;
    b += base.data[i + 2] ?? 0;
    n++;
  }
  if (n === 0) throw new Error('Base texture is fully transparent.');
  const average = (Math.round(r / n) << 16) | (Math.round(g / n) << 8) | Math.round(b / n);
  const flat = ramps.flat();
  const { color } = nearestColor(average, flat, flat.map(rgbToOklab));
  return ramps.find((ramp) => ramp.includes(color)) ?? ramps[0]!;
}

/** True where the shape is cut away: an exposed side's outline row or an inner-corner notch. */
function outlineAt(mask: number, x: number, y: number, last: number): boolean {
  if (((mask & N) === 0 && y === 0) || ((mask & S) === 0 && y === last)) return true;
  if (((mask & W) === 0 && x === 0) || ((mask & E) === 0 && x === last)) return true;
  const hi = last - NOTCH + 1;
  if ((mask & (N | E)) === (N | E) && (mask & NE) === 0 && x >= hi && y < NOTCH) return true;
  if ((mask & (S | E)) === (S | E) && (mask & SE) === 0 && x >= hi && y >= hi) return true;
  if ((mask & (S | W)) === (S | W) && (mask & SW) === 0 && x < NOTCH && y >= hi) return true;
  return (mask & (N | W)) === (N | W) && (mask & NW) === 0 && x < NOTCH && y < NOTCH;
}

/** Atlas dimensions of one generated set. */
export function autotileSetSize(opts: AutotileOptions = DEFAULT_AUTOTILE_OPTIONS) {
  const frames = BLOB_MASKS.length * opts.variations;
  return {
    frames,
    width: opts.columns * opts.tileSize,
    height: Math.ceil(frames / opts.columns) * opts.tileSize,
  };
}

export function generateAutotiles(
  base: RgbaImage,
  options: Partial<AutotileOptions> = {},
): RgbaImage {
  const opts = { ...DEFAULT_AUTOTILE_OPTIONS, ...options };
  const size = opts.tileSize;
  const last = size - 1;
  const ramp = dominantRamp(base, opts.ramps);
  const outline = ramp[0];
  const highlight = ramp[2] ?? ramp[ramp.length - 1] ?? outline;
  const { width, height } = autotileSetSize(opts);
  const out = createImage(width, height);

  for (let shape = 0; shape < BLOB_MASKS.length; shape++) {
    const mask = BLOB_MASKS[shape] ?? 0;
    for (let v = 0; v < opts.variations; v++) {
      const frame = shape * opts.variations + v;
      const ox = (frame % opts.columns) * size;
      const oy = Math.floor(frame / opts.columns) * size;
      const [fx, fy] = CUT_ORIGINS[v % CUT_ORIGINS.length] ?? [0, 0];
      const cutX = Math.floor(base.width * fx);
      const cutY = Math.floor(base.height * fy);
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          if (outlineAt(mask, x, y, last)) {
            setPixel(out, ox + x, oy + y, outline);
            continue;
          }
          // Light from the top-left: a 1px highlight just inside an exposed top edge.
          if ((mask & N) === 0 && y === 1) {
            setPixel(out, ox + x, oy + y, highlight);
            continue;
          }
          // TODO(plan 2.9.7): top decoration (grass / moss overhang) for tiles that define one.
          const sx = (cutX + x) % base.width;
          const sy = (cutY + y) % base.height;
          setPixel(out, ox + x, oy + y, getRgb(base, sx, sy), getAlpha(base, sx, sy));
        }
      }
    }
  }
  return out;
}
