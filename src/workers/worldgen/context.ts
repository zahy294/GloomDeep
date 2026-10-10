import { WORLDGEN } from '../../config';
import { tileId, TILES } from '../../data/tiles';
import { mulberry32 } from '../../sim/random';

/**
 * Shared state for the world-generation steps (plan 3.2: each step is `(ctx) => void`, run in
 * order). Plain typed arrays only — this runs in a Web Worker.
 */
export interface GenContext {
  readonly width: number;
  readonly height: number;
  readonly seed: number;
  readonly fg: Uint16Array;
  readonly bg: Uint16Array;
  readonly liquid: Uint8Array;
  readonly liquidType: Uint8Array;
  readonly gloam: Uint8Array;
  /** Surface biome index per column. */
  readonly surfaceBiome: Uint8Array;
  /** First solid row per column (the grass row). */
  readonly surface: Int32Array;
  /** Soil thickness per column (rows below the grass that are soil/subsoil). */
  readonly soilDepth: Int32Array;
  /** First row of each depth layer. */
  readonly layerTops: Int32Array;
  /** Protected rectangle around the spawn: no caves, liquids or features (tiles, inclusive). */
  spawnArea: { x0: number; x1: number; y0: number; y1: number };
  spawnX: number;
  spawnY: number;
  /** Columns where a cave entrance opens at the surface (giant trees keep clear of them). */
  caveMouths: number[];
  /** Towns placed by step 2 and stamped by step 7 (M11): prefab rectangles, inclusive. */
  towns: PlacedTown[];
}

/** A town prefab's place in the world (tiles; x0/y0 is the prefab's top-left cell). */
export interface PlacedTown {
  readonly key: string;
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

export function createContext(
  width: number,
  height: number,
  seed: number,
  layers: number,
): GenContext {
  const n = width * height;
  return {
    width,
    height,
    seed: seed >>> 0,
    fg: new Uint16Array(n),
    bg: new Uint16Array(n),
    liquid: new Uint8Array(n),
    liquidType: new Uint8Array(n),
    gloam: new Uint8Array(n),
    surfaceBiome: new Uint8Array(width),
    surface: new Int32Array(width),
    soilDepth: new Int32Array(width),
    layerTops: new Int32Array(layers),
    spawnArea: { x0: 0, x1: -1, y0: 0, y1: -1 },
    spawnX: 0,
    spawnY: 0,
    caveMouths: [],
    towns: [],
  };
}

/** A random stream for one step, independent of the others (adding a step can't reshuffle them). */
export function stepRandom(ctx: GenContext, salt: number): () => number {
  return mulberry32((ctx.seed ^ Math.imul(salt, 0x9e3779b1)) >>> 0);
}

/** Noise seed for a named purpose, derived from the world seed. */
export function noiseSeed(ctx: GenContext, salt: number): number {
  return (ctx.seed ^ Math.imul(salt + 1, 0x85ebca6b)) | 0;
}

/** Tile ids resolved once (worldgen refers to tiles by key, rule 4). */
const SOLID = Uint8Array.from(TILES, (t) => (t.solid ? 1 : 0));
export const AIR = 0;
export const T = {
  stone: tileId('stone'),
  basalt: tileId('basalt'),
  ash: tileId('ash'),
  gravel: tileId('gravel'),
  silt: tileId('silt'),
} as const;

export const isSolidId = (id: number) => SOLID[id] === 1;

export function inSpawnArea(ctx: GenContext, x: number, y: number): boolean {
  const a = ctx.spawnArea;
  return x >= a.x0 && x <= a.x1 && y >= a.y0 && y <= a.y1;
}

/** Inside a town's prefab rectangle, widened by `margin` tiles. */
export function inTown(ctx: GenContext, x: number, y: number, margin = 0): boolean {
  for (const t of ctx.towns) {
    if (x >= t.x0 - margin && x <= t.x1 + margin && y >= t.y0 - margin && y <= t.y1 + margin) {
      return true;
    }
  }
  return false;
}

/** A town's columns (widened by `margin`) — surface features keep out of them. */
export function inTownColumns(ctx: GenContext, x: number, margin = 0): boolean {
  return ctx.towns.some((t) => x >= t.x0 - margin && x <= t.x1 + margin);
}

/**
 * Protected from caves, pools and features: the spawn glade, and every town with a margin
 * (plan 1.7: "marks their area as protected").
 */
export function inProtected(ctx: GenContext, x: number, y: number): boolean {
  return inSpawnArea(ctx, x, y) || inTown(ctx, x, y, WORLDGEN.townMargin);
}

/** Depth layer index for a row (layers are horizontal; their tops already include wiggle). */
export function layerAt(ctx: GenContext, y: number): number {
  let layer = 0;
  for (let i = 1; i < ctx.layerTops.length; i++) if (y >= (ctx.layerTops[i] ?? Infinity)) layer = i;
  return layer;
}
