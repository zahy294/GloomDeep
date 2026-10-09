import { DEPTH_LAYERS, SURFACE_BIOMES } from '../../data/biomes';
import type { World } from './World';

/** How far below the surface the surface biome still counts (rows). */
const SURFACE_BIOME_DEPTH = 40;

/**
 * Name of the biome at a tile: the column's surface biome near the surface, otherwise the depth
 * layer for that row (plan 1.6). Used by the debug overlay now; spawning and music later.
 */
export function biomeAt(world: World, x: number, y: number): string {
  const cx = Math.min(world.width - 1, Math.max(0, x));
  const surface = world.groundRow(cx);
  let layer = 0;
  for (let i = 1; i < world.layerTops.length; i++)
    if (y >= (world.layerTops[i] ?? Infinity)) layer = i;
  if (layer === 0 && y < surface + SURFACE_BIOME_DEPTH) {
    return SURFACE_BIOMES[world.surfaceBiome[cx] ?? 0]?.name ?? '?';
  }
  return DEPTH_LAYERS[layer]?.name ?? '?';
}

/** How far below the ground a spot still counts as the surface biome for spawning (rows). */
const SURFACE_SPAWN_DEPTH = 6;

/**
 * Key of the place at a tile for spawn rules (src/data/enemies.ts `places`): the surface biome on
 * or just under the surface, otherwise the depth layer.
 */
export function placeKeyAt(world: World, x: number, y: number): string {
  const cx = Math.min(world.width - 1, Math.max(0, x));
  if (y < world.groundRow(cx) + SURFACE_SPAWN_DEPTH) {
    return SURFACE_BIOMES[world.surfaceBiome[cx] ?? 0]?.key ?? '';
  }
  let layer = 0;
  for (let i = 1; i < world.layerTops.length; i++)
    if (y >= (world.layerTops[i] ?? Infinity)) layer = i;
  return DEPTH_LAYERS[layer]?.key ?? '';
}
