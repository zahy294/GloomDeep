import { PALETTE, type RampName } from '../../src/data/palette';
import type { TileDef } from '../../src/data/tiles';

export interface AtlasOptions {
  tileSize: number;
  columns: number;
  seed: number;
  /** Out of 256. */
  speckleChance: number;
}

export interface Atlas {
  width: number;
  height: number;
  /** RGBA, row-major. */
  data: Uint8Array;
  tileSize: number;
  columns: number;
  /** Tile key → frame index (frame index === tile id, so the world array maps straight to frames). */
  frames: Record<string, number>;
}

/** Integer hash of a pixel position; gives a stable speckle pattern without a stateful RNG. */
export function hash3(x: number, y: number, z: number, seed: number): number {
  let h = seed ^ Math.imul(x, 0x27d4eb2d) ^ Math.imul(y, 0x165667b1) ^ Math.imul(z, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

/** Picks the palette colour for one pixel of a placeholder tile: outline, top-left bevel, speckles. */
function placeholderPixel(
  ramp: RampName,
  px: number,
  py: number,
  tileId: number,
  opts: AtlasOptions,
): number {
  const [dark, base, light, highlight] = PALETTE[ramp];
  const last = opts.tileSize - 1;
  if (px === 0 || py === 0 || px === last || py === last) return dark;
  if (py === 1 || px === 1) return light;

  const h = hash3(px, py, tileId, opts.seed);
  const roll = h & 0xff;
  if (roll < opts.speckleChance) return (h >>> 8) & 1 ? highlight : dark;
  return base;
}

/** Builds the placeholder tile atlas. Air (and any tile without a ramp) stays transparent. */
export function buildPlaceholderAtlas(tiles: readonly TileDef[], opts: AtlasOptions): Atlas {
  const { tileSize, columns } = opts;
  const rows = Math.max(1, Math.ceil(tiles.length / columns));
  const width = columns * tileSize;
  const height = rows * tileSize;
  const data = new Uint8Array(width * height * 4);
  const frames: Record<string, number> = {};

  tiles.forEach((tile, index) => {
    if (tile.id !== index) {
      throw new Error(`Tile "${tile.key}" has id ${tile.id} but is at index ${index}.`);
    }
    frames[tile.key] = tile.id;
    if (!tile.placeholderRamp) return;

    const ox = (tile.id % columns) * tileSize;
    const oy = Math.floor(tile.id / columns) * tileSize;
    for (let py = 0; py < tileSize; py++) {
      for (let px = 0; px < tileSize; px++) {
        const color = placeholderPixel(tile.placeholderRamp, px, py, tile.id, opts);
        const i = ((oy + py) * width + (ox + px)) * 4;
        data[i] = (color >> 16) & 0xff;
        data[i + 1] = (color >> 8) & 0xff;
        data[i + 2] = color & 0xff;
        data[i + 3] = 0xff;
      }
    }
  });

  return { width, height, data, tileSize, columns, frames };
}
