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

/** Depth layer index for a row (layers are horizontal; their tops already include wiggle). */
export function layerAt(ctx: GenContext, y: number): number {
  let layer = 0;
  for (let i = 1; i < ctx.layerTops.length; i++) if (y >= (ctx.layerTops[i] ?? Infinity)) layer = i;
  return layer;
}
