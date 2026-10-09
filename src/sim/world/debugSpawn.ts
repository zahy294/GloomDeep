import { DEPTH_LAYERS, SURFACE_BIOMES } from '../../data/biomes';
import { tileId } from '../../data/tiles';
import type { World } from './World';

export interface DebugSpawnTarget {
  /** A surface biome or depth layer key from src/data/biomes.ts, or null for the world centre. */
  biome: string | null;
  /** 'cave': an open pocket underground; 'waterfall': dry ground beside the fall nearest the centre. */
  spot: 'cave' | 'waterfall' | null;
}

/** How far below the surface a cave pocket must be (rows), so it is not just a surface dip. */
const MIN_CAVE_DEPTH = 24;
/** Open rows needed above a cave floor (the player is 3 tiles tall, plus headroom). */
const CAVE_HEADROOM = 4;

/**
 * A feet position (tiles: x, and the row the feet rest on top of) for debug starts and screenshots
 * (`?biome=weeping_mire`, `?spot=cave`, `?biome=ember_roots`). Deterministic for a given world.
 * Returns null if nothing suitable exists.
 */
export function findDebugSpawn(
  world: World,
  target: DebugSpawnTarget,
): { x: number; y: number } | null {
  if (target.spot === 'waterfall') return findWaterfallSpawn(world);
  let x0 = 0;
  let x1 = world.width;
  let rowMin = 0;
  let rowMax = world.height;
  let underground = target.spot === 'cave';

  const surface = SURFACE_BIOMES.findIndex((b) => b.key === target.biome);
  const layer = DEPTH_LAYERS.findIndex((l) => l.key === target.biome);
  if (surface >= 0) {
    const run = longestRun(world.surfaceBiome, surface);
    if (!run) return null;
    [x0, x1] = run;
  } else if (layer >= 0) {
    underground = true;
    rowMin = world.layerTops[layer] ?? 0;
    rowMax = world.layerTops[layer + 1] ?? world.height;
  }

  const centre = Math.floor((x0 + x1) / 2);
  if (!underground) return { x: centre, y: world.groundRow(centre) };

  // Search columns outward from the centre so the result stays near the middle of the range.
  for (let d = 0; d <= (x1 - x0) / 2; d++) {
    for (const x of d === 0 ? [centre] : [centre - d, centre + d]) {
      if (x < x0 || x >= x1) continue;
      const top = Math.max(rowMin, world.groundRow(x) + MIN_CAVE_DEPTH);
      for (let y = top + CAVE_HEADROOM; y < rowMax; y++) {
        if (isCaveFloor(world, x, y)) return { x, y };
      }
    }
  }
  return null;
}

/** Solid ground at `y`, dry open space for CAVE_HEADROOM rows above it. */
function isCaveFloor(world: World, x: number, y: number): boolean {
  if (!world.isSolid(x, y)) return false;
  for (let dy = 1; dy <= CAVE_HEADROOM; dy++) {
    const i = (y - dy) * world.width + x;
    if (world.isSolid(x, y - dy) || world.liquidType[i] !== 0) return false;
  }
  return true;
}

/** [start, end) of the longest run of `value` in `values`, or null if absent. */
function longestRun(values: Uint8Array, value: number): [number, number] | null {
  let best: [number, number] | null = null;
  let start = -1;
  for (let i = 0; i <= values.length; i++) {
    if (i < values.length && values[i] === value) {
      if (start < 0) start = i;
    } else if (start >= 0) {
      if (!best || i - start > best[1] - best[0]) best = [start, i];
      start = -1;
    }
  }
  return best;
}

const WATERFALL = tileId('waterfall');
/** Column offsets tried from the fall, nearest first, for somewhere to stand. */
const WATERFALL_STAND_OFFSETS = [3, -3, 2, -2, 4, -4, 1, -1, 0] as const;
/** Open rows needed above the feet (the player is 3 tiles tall). */
const STAND_HEADROOM = 3;

/**
 * Dry ground beside the waterfall nearest the world centre, feet on the landing floor. Searches
 * columns outward from the centre, so the result is deterministic for a given world.
 */
function findWaterfallSpawn(world: World): { x: number; y: number } | null {
  const centre = Math.floor(world.width / 2);
  for (let d = 0; d < world.width / 2; d++) {
    for (const x of d === 0 ? [centre] : [centre - d, centre + d]) {
      if (x < 0 || x >= world.width) continue;
      // The fall hangs in open air, so it is always above the column's first solid tile.
      for (let y = 1; y < world.groundRow(x); y++) {
        if (world.get(x, y) !== WATERFALL || world.get(x, y + 1) === WATERFALL) continue;
        const stand = standNear(world, x, y + 1);
        if (stand) return stand;
      }
    }
  }
  return null;
}

/** A column near the fall with solid ground at `floor` and headroom above it. */
function standNear(world: World, fall: number, floor: number): { x: number; y: number } | null {
  for (const dx of WATERFALL_STAND_OFFSETS) {
    const x = fall + dx;
    if (!world.isSolid(x, floor)) continue;
    let open = true;
    for (let dy = 1; dy <= STAND_HEADROOM && open; dy++) {
      open = !world.isSolid(x, floor - dy) && world.get(x, floor - dy) !== WATERFALL;
    }
    if (open) return { x, y: floor };
  }
  return null;
}
