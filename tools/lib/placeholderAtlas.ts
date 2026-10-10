import { AUTOTILE } from '../../src/config';
import { PALETTE, type Ramp } from '../../src/data/palette';
import type { TileDef } from '../../src/data/tiles';
import {
  BLOB_MASKS,
  E,
  FRAMES_PER_TILE,
  N,
  RESERVED_FRAMES,
  NE,
  NW,
  S,
  SE,
  SW,
  W,
  frameBase,
} from '../../src/sim/world/autotile';
import { drawStation } from './placeholderItems';

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
  frameCount: number;
}

export type AtlasKind = 'tiles' | 'walls';

export const CRACK_STAGES = 4;

/** Integer hash of a pixel position; gives a stable speckle pattern without a stateful RNG. */
export function hash3(x: number, y: number, z: number, seed: number): number {
  let h = seed ^ Math.imul(x, 0x27d4eb2d) ^ Math.imul(y, 0x165667b1) ^ Math.imul(z, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

interface Colors {
  outline: number;
  dark: number;
  base: number;
  light: number;
  highlight: number;
}

function colorsFor(tile: TileDef, kind: AtlasKind): Colors | null {
  if (!tile.placeholderRamp) return null;
  const [dark, base, light, highlight] = PALETTE[tile.placeholderRamp];
  if (kind === 'tiles') return { outline: dark, dark, base, light, highlight };
  // Walls: one step down the ramp, outlined in the darkest teal, so they recede behind the foreground.
  return { outline: PALETTE.tealShadow[0], dark, base: dark, light: base, highlight: base };
}

function put(data: Uint8Array, width: number, x: number, y: number, color: number): void {
  const i = (y * width + x) * 4;
  data[i] = (color >> 16) & 0xff;
  data[i + 1] = (color >> 8) & 0xff;
  data[i + 2] = color & 0xff;
  data[i + 3] = 0xff;
}

/**
 * One shape pixel. Outline only where the edge neighbour is missing (outer corners follow from
 * that); an inner corner (both edges joined, diagonal missing) gets a 2x2 dark notch; a light bevel
 * runs just inside an exposed top or left edge (light from the top-left).
 */
/** Out of 256: chance a 2×2 block of an ore tile is ore rather than host rock. */
const ORE_CLUSTER_CHANCE = 70;

function framePixel(
  c: Colors,
  mask: number,
  px: number,
  py: number,
  tileId: number,
  variation: number,
  opts: AtlasOptions,
  ore: readonly [number, number, number, number] | null = null,
): number {
  const last = opts.tileSize - 1;
  const exN = (mask & N) === 0;
  const exE = (mask & E) === 0;
  const exS = (mask & S) === 0;
  const exW = (mask & W) === 0;

  if ((exN && py === 0) || (exS && py === last) || (exW && px === 0) || (exE && px === last)) {
    return c.outline;
  }
  if ((mask & (N | E)) === (N | E) && (mask & NE) === 0 && px >= last - 1 && py <= 1)
    return c.outline;
  if ((mask & (S | E)) === (S | E) && (mask & SE) === 0 && px >= last - 1 && py >= last - 1) {
    return c.outline;
  }
  if ((mask & (S | W)) === (S | W) && (mask & SW) === 0 && px <= 1 && py >= last - 1) {
    return c.outline;
  }
  if ((mask & (N | W)) === (N | W) && (mask & NW) === 0 && px <= 1 && py <= 1) return c.outline;

  if ((exN && py === 1) || (exW && px === 1)) return c.light;

  if (ore) {
    // Ore: 2×2 nuggets of the ore's colours scattered through the host rock.
    const cluster = hash3(px >> 1, py >> 1, tileId * 16 + variation + 7, opts.seed);
    if ((cluster & 0xff) < ORE_CLUSTER_CHANCE) return (px + py) % 3 === 0 ? ore[3] : ore[2];
  }
  const h = hash3(px, py, tileId * 16 + variation, opts.seed);
  if ((h & 0xff) < opts.speckleChance) return (h >>> 8) & 1 ? c.highlight : c.dark;
  return c.base;
}

/** A wall torch: wooden stick with a flame, on a transparent background (same in every frame). */
function drawTorch(data: Uint8Array, width: number, ox: number, oy: number): void {
  const stick = PALETTE.bark;
  const flame = PALETTE.ember;
  const core = PALETTE.honey;
  for (let y = 8; y < 15; y++) {
    put(data, width, ox + 7, oy + y, stick[1]);
    put(data, width, ox + 8, oy + y, stick[y === 8 ? 3 : 2]);
  }
  for (const [x, y, c] of [
    [7, 2, flame[2]],
    [8, 3, flame[2]],
    [6, 4, flame[1]],
    [7, 4, flame[3]],
    [8, 4, flame[3]],
    [9, 4, flame[1]],
    [6, 5, flame[2]],
    [7, 5, core[3]],
    [8, 5, core[3]],
    [9, 5, flame[2]],
    [6, 6, flame[1]],
    [7, 6, core[2]],
    [8, 6, core[3]],
    [9, 6, flame[1]],
    [7, 7, flame[2]],
    [8, 7, flame[2]],
  ] as const) {
    put(data, width, ox + x, oy + y, c);
  }
}

/** Rows of a branch tile (from the top) and where its knots sit; the rest is transparent. */
const BRANCH_ROWS = 6;
const BRANCH_KNOTS: readonly (readonly [number, number])[] = [
  [4, 2],
  [11, 3],
];

/**
 * A horizontal branch across the top of the tile in the tile's ramp (bark for branches, cyan for
 * spirit platforms): dark outline, a couple of knots.
 */
function drawBranch(data: Uint8Array, width: number, ox: number, oy: number, bark: Ramp): void {
  for (let y = 0; y < BRANCH_ROWS; y++) {
    for (let x = 0; x < 16; x++) {
      const edge = y === 0 || y === BRANCH_ROWS - 1;
      // Light from the top-left: lit upper band, mid body, shaded lower band.
      const colour = edge ? bark[0] : y === 1 ? bark[3] : y >= BRANCH_ROWS - 2 ? bark[1] : bark[2];
      put(data, width, ox + x, oy + y, colour);
    }
  }
  // Bark grain: short dark dashes so it reads as wood rather than a flat bar.
  for (const x of [1, 7, 13]) put(data, width, ox + x, oy + 3, bark[1]);
  for (const [x, y] of BRANCH_KNOTS) {
    put(data, width, ox + x, oy + y, bark[0]);
    put(data, width, ox + x + 1, oy + y, bark[1]);
  }
}

/** Out of 256: chance an exposed leaf edge pixel is missing, and an inner pixel is a bright leaf. */
const LEAF_EDGE_GAP = 90;
const LEAF_SPARKLE = 40;

/**
 * Leaves are not solid ground: outline pixels drop out at random (ragged edge) and the body is
 * speckled with light and dark leaf pixels. Returns null for a gap.
 */
function leafPixel(
  c: Colors,
  color: number,
  px: number,
  py: number,
  tileId: number,
  variation: number,
  opts: AtlasOptions,
): number | null {
  const h = hash3(px, py, tileId * 16 + variation + 99, opts.seed);
  if (color === c.outline) return (h & 0xff) < LEAF_EDGE_GAP ? null : c.outline;
  const roll = (h >>> 8) & 0xff;
  if (roll < LEAF_SPARKLE) return c.highlight;
  if (roll > 255 - LEAF_SPARKLE) return c.dark;
  return color;
}

function atlasSize(frames: number, opts: AtlasOptions) {
  const rows = Math.max(1, Math.ceil(frames / opts.columns));
  return { width: opts.columns * opts.tileSize, height: rows * opts.tileSize };
}

/**
 * Builds a blob atlas: for each tile with a ramp, 47 shapes x 3 variations, laid out row-major with
 * the frame numbering of `autotile.ts`. Frame 0 stays transparent (see RESERVED_FRAMES there), so
 * tile id 1 starts at frame 1.
 */
export function buildPlaceholderAtlas(
  tiles: readonly TileDef[],
  opts: AtlasOptions,
  kind: AtlasKind = 'tiles',
): Atlas {
  const { tileSize, columns } = opts;
  const frameCount = RESERVED_FRAMES + (tiles.length - 1) * FRAMES_PER_TILE;
  const { width, height } = atlasSize(frameCount, opts);
  const data = new Uint8Array(width * height * 4);

  tiles.forEach((tile, index) => {
    if (tile.id !== index) {
      throw new Error(`Tile "${tile.key}" has id ${tile.id} but is at index ${index}.`);
    }
  });

  for (const tile of tiles) {
    if (tile.id === 0) continue;
    const colors = colorsFor(tile, kind);
    // Walls keep plain rock: ore nuggets only show on the foreground block.
    const ore = tile.placeholderOre && kind === 'tiles' ? PALETTE[tile.placeholderOre] : null;
    if (!colors) continue;
    for (let shape = 0; shape < BLOB_MASKS.length; shape++) {
      const mask = BLOB_MASKS[shape] ?? 0;
      for (let variation = 0; variation < AUTOTILE.variations; variation++) {
        const frame = frameBase(tile.id) + shape * AUTOTILE.variations + variation;
        const ox = (frame % columns) * tileSize;
        const oy = Math.floor(frame / columns) * tileSize;
        if (tile.placeholderShape === 'torch') {
          if (kind === 'tiles') drawTorch(data, width, ox, oy);
          continue;
        }
        if (tile.placeholderShape === 'platform') {
          if (kind === 'tiles') {
            drawBranch(data, width, ox, oy, PALETTE[tile.placeholderRamp ?? 'bark']);
          }
          continue;
        }
        if (
          tile.placeholderShape === 'workbench' ||
          tile.placeholderShape === 'furnace' ||
          tile.placeholderShape === 'anvil' ||
          tile.placeholderShape === 'door' ||
          tile.placeholderShape === 'jar' ||
          tile.placeholderShape === 'beacon' ||
          tile.placeholderShape === 'beacon_dormant' ||
          tile.placeholderShape === 'lamp' ||
          tile.placeholderShape === 'lift' ||
          tile.placeholderShape === 'hanging_lantern' ||
          tile.placeholderShape === 'lure' ||
          tile.placeholderShape === 'lever' ||
          tile.placeholderShape === 'lever_open' ||
          tile.placeholderShape === 'brazier' ||
          tile.placeholderShape === 'prism_left' ||
          tile.placeholderShape === 'prism_right' ||
          tile.placeholderShape === 'node'
        ) {
          if (kind === 'tiles') {
            // The dimmed street lamp keeps only the lower half of its glass lit.
            const shape =
              tile.placeholderShape === 'lamp' && tile.key.endsWith('_dim')
                ? 'lamp_dim'
                : tile.placeholderShape === 'brazier' && tile.key.endsWith('_out')
                  ? 'brazier_out'
                  : tile.placeholderShape;
            // Lamp glass, brazier flames, the heart node's orb and the lure take the tile's own ramp.
            const glass =
              tile.placeholderShape === 'lamp' ||
              tile.placeholderShape === 'brazier' ||
              tile.placeholderShape === 'node' ||
              tile.placeholderShape === 'lure'
                ? (tile.placeholderRamp ?? undefined)
                : undefined;
            drawStation(shape, (x, y, c) => put(data, width, ox + x, oy + y, c), glass);
          }
          continue;
        }
        for (let py = 0; py < tileSize; py++) {
          for (let px = 0; px < tileSize; px++) {
            const color = framePixel(colors, mask, px, py, tile.id, variation, opts, ore);
            if (tile.sunTransmit !== undefined && kind === 'tiles') {
              const leaf = leafPixel(colors, color, px, py, tile.id, variation, opts);
              if (leaf !== null) put(data, width, ox + px, oy + py, leaf);
              continue;
            }
            put(data, width, ox + px, oy + py, color);
          }
        }
      }
    }
  }

  return { width, height, data, tileSize, columns, frameCount };
}

/** Crack polylines per stage; each stage draws its own and every earlier one, so cracks grow. */
const CRACK_LINES: readonly (readonly (readonly [number, number])[])[][] = [
  [
    [
      [8, 2],
      [6, 6],
      [8, 9],
    ],
  ],
  [
    [
      [8, 9],
      [5, 12],
      [6, 15],
    ],
    [
      [6, 6],
      [2, 7],
    ],
  ],
  [
    [
      [8, 9],
      [12, 11],
      [11, 15],
    ],
    [
      [8, 2],
      [11, 0],
    ],
    [
      [2, 7],
      [0, 9],
    ],
  ],
  [
    [
      [6, 6],
      [4, 3],
      [3, 0],
    ],
    [
      [12, 11],
      [15, 10],
    ],
    [
      [8, 9],
      [9, 13],
    ],
    [
      [11, 3],
      [8, 5],
    ],
    [
      [5, 12],
      [1, 14],
    ],
  ],
];

function line(
  data: Uint8Array,
  width: number,
  ox: number,
  size: number,
  from: readonly [number, number],
  to: readonly [number, number],
  color: number,
): void {
  let [x, y] = from;
  const dx = Math.abs(to[0] - x);
  const dy = -Math.abs(to[1] - y);
  const sx = x < to[0] ? 1 : -1;
  const sy = y < to[1] ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    if (x >= 0 && y >= 0 && x < size && y < size) put(data, width, ox + x, y, color);
    if (x === to[0] && y === to[1]) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
  }
}

/** Four crack-overlay frames in one row, transparent except for the crack lines. */
export function buildCracksAtlas(opts: Pick<AtlasOptions, 'tileSize'>): Atlas {
  const size = opts.tileSize;
  const width = size * CRACK_STAGES;
  const data = new Uint8Array(width * size * 4);
  const color = PALETTE.tealShadow[0];
  for (let stage = 0; stage < CRACK_STAGES; stage++) {
    for (let s = 0; s <= stage; s++) {
      for (const path of CRACK_LINES[s] ?? []) {
        for (let i = 0; i + 1 < path.length; i++) {
          line(data, width, stage * size, size, path[i]!, path[i + 1]!, color);
        }
      }
    }
  }
  return {
    width,
    height: size,
    data,
    tileSize: size,
    columns: CRACK_STAGES,
    frameCount: CRACK_STAGES,
  };
}
