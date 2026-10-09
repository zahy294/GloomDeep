import { AUTOTILE } from '../../config';
import { TILES } from '../../data/tiles';
import type { TileLayer } from '../events';
import { hash2 } from '../random';
import type { World } from './World';

export const N = 1;
export const NE = 2;
export const E = 4;
export const SE = 8;
export const S = 16;
export const SW = 32;
export const W = 64;
export const NW = 128;

const TILE_COUNT = TILES.length;

/** Symmetric "these two tiles draw without an outline between them" table, indexed a * n + b. */
const CONNECT = new Uint8Array(TILE_COUNT * TILE_COUNT);
for (const a of TILES) {
  if (a.id === 0) continue;
  CONNECT[a.id * TILE_COUNT + a.id] = 1;
  for (const key of a.mergesWith) {
    const b = TILES.find((t) => t.key === key);
    if (!b || b.id === 0) continue;
    CONNECT[a.id * TILE_COUNT + b.id] = 1;
    CONNECT[b.id * TILE_COUNT + a.id] = 1;
  }
}

/** True when tiles `a` and `b` join visually. Air never connects (not even to air). */
export function connects(a: number, b: number): boolean {
  if (a <= 0 || b <= 0 || a >= TILE_COUNT || b >= TILE_COUNT) return false;
  return CONNECT[a * TILE_COUNT + b] === 1;
}

/** Drops a corner bit unless both of its adjacent edge bits are set. */
export function reduceMask(raw: number): number {
  let m = raw & (N | E | S | W);
  if ((raw & NE) !== 0 && (raw & N) !== 0 && (raw & E) !== 0) m |= NE;
  if ((raw & SE) !== 0 && (raw & E) !== 0 && (raw & S) !== 0) m |= SE;
  if ((raw & SW) !== 0 && (raw & S) !== 0 && (raw & W) !== 0) m |= SW;
  if ((raw & NW) !== 0 && (raw & W) !== 0 && (raw & N) !== 0) m |= NW;
  return m;
}

const masks: number[] = [];
for (let m = 0; m < 256; m++) if (reduceMask(m) === m) masks.push(m);

/** The valid reduced masks, ascending. */
export const BLOB_MASKS: readonly number[] = masks;

if (BLOB_MASKS.length !== AUTOTILE.blobShapes) {
  throw new Error(`Expected ${AUTOTILE.blobShapes} blob masks, found ${BLOB_MASKS.length}.`);
}

/** Any raw 8-bit mask (reduced on the way in) → shape index 0..46. */
export const BLOB_INDEX = new Uint8Array(256);
for (let raw = 0; raw < 256; raw++) {
  BLOB_INDEX[raw] = BLOB_MASKS.indexOf(reduceMask(raw));
}

/** Mask with the neighbours of (x, y) that join the tile there; outside the world counts as joined. */
export function blobMask(world: World, layer: TileLayer, x: number, y: number): number {
  const id = world.getLayer(layer, x, y);
  const w = world.width;
  const h = world.height;
  let raw = 0;
  // Unrolled: this runs for every tile of a chunk, so no loops over offset tables or allocations.
  if (y <= 0 || connects(id, world.getLayer(layer, x, y - 1))) raw |= N;
  if (y <= 0 || x >= w - 1 || connects(id, world.getLayer(layer, x + 1, y - 1))) raw |= NE;
  if (x >= w - 1 || connects(id, world.getLayer(layer, x + 1, y))) raw |= E;
  if (x >= w - 1 || y >= h - 1 || connects(id, world.getLayer(layer, x + 1, y + 1))) raw |= SE;
  if (y >= h - 1 || connects(id, world.getLayer(layer, x, y + 1))) raw |= S;
  if (y >= h - 1 || x <= 0 || connects(id, world.getLayer(layer, x - 1, y + 1))) raw |= SW;
  if (x <= 0 || connects(id, world.getLayer(layer, x - 1, y))) raw |= W;
  if (x <= 0 || y <= 0 || connects(id, world.getLayer(layer, x - 1, y - 1))) raw |= NW;
  return reduceMask(raw);
}

const VARIATION_SALT = 0x51ed270b;

/** Stable variation 0..variations-1 for a tile position. */
export function variationAt(x: number, y: number): number {
  return Math.floor(hash2(x, y, VARIATION_SALT) * AUTOTILE.variations);
}

export const FRAMES_PER_TILE = AUTOTILE.blobShapes * AUTOTILE.variations;

/**
 * Frame 0 of every tile atlas is left fully transparent. Phaser 4.2.1's TilemapGPULayer shader
 * doesn't discard empty tiles: it samples atlas texel (0, 0) for them. A transparent first frame
 * makes empty cells draw nothing. Air has no frames of its own, so tile id 1 starts at frame 1.
 */
export const RESERVED_FRAMES = 1;
export const FRAME_COUNT = RESERVED_FRAMES + (TILE_COUNT - 1) * FRAMES_PER_TILE;

export function frameBase(id: number): number {
  return RESERVED_FRAMES + (id - 1) * FRAMES_PER_TILE;
}

/** Tiles drawn with one fixed frame instead of blob shapes (objects like torches). */
/** Per-id: decoration (flora) or waterfall, not drawn in the tilemap. */
const DECOR = Uint8Array.from(TILES, (t) => (t.decor || t.waterfall ? 1 : 0));
const FIXED_LOOK = Uint8Array.from(TILES, (t) => (t.autotile === false ? 1 : 0));
/** Per id: the tile whose frames it borrows (veiled ores look like stone), else itself. */
const LOOK = Uint16Array.from(TILES, (t) =>
  t.looksLike ? (TILES.find((o) => o.key === t.looksLike)?.id ?? t.id) : t.id,
);
const INVISIBLE = Uint8Array.from(TILES, (t) => (t.intangible ? 1 : 0));

/** Atlas frame for the tile at (x, y) in a layer, or -1 for air. */
export function tileFrame(world: World, layer: TileLayer, x: number, y: number): number {
  const id = world.getLayer(layer, x, y);
  // Decorations are drawn by the foliage renderer; veiled spirit platforms not at all.
  if (id <= 0 || DECOR[id] === 1 || INVISIBLE[id] === 1) return -1;
  if (FIXED_LOOK[id] === 1) return iconFrame(id);
  const shape = BLOB_INDEX[blobMask(world, layer, x, y)] ?? 0;
  return frameBase(LOOK[id] ?? id) + shape * AUTOTILE.variations + variationAt(x, y);
}

/** Frame of the isolated shape (no neighbours), variation 0; used for item icons. */
export function iconFrame(id: number): number {
  return frameBase(id) + (BLOB_INDEX[0] ?? 0) * AUTOTILE.variations;
}
