/**
 * Prefabs drawn in Tiled (plan 1.7): towns, small structures. Each map is a JSON file next to this
 * one, using the shared tileset gloamdeep.tileset.json (its tiles carry the game's tile keys).
 * Edit them in Tiled; `npm run prefabs` refreshes the tileset when tiles are added.
 */
import {
  parseTiledPrefab,
  type Prefab,
  type TiledMap,
  type TiledTileset,
} from '../../sim/world/tiled';
import canopyholdMap from './canopyhold.json';
import citadelMap from './citadel.json';
import cottageMap from './cottage.json';
import tileset from './gloamdeep.tileset.json';

const TILESETS: Record<string, TiledTileset> = { 'gloamdeep.tileset.json': tileset };

// JSON imports are typed from their contents; they have the Tiled map shape.
const MAPS: Record<string, TiledMap> = {
  canopyhold: canopyholdMap as TiledMap,
  citadel: citadelMap as TiledMap,
  cottage: cottageMap as TiledMap,
};

export const PREFABS: Readonly<Record<string, Prefab>> = Object.fromEntries(
  Object.entries(MAPS).map(([key, map]) => [key, parseTiledPrefab(key, map, TILESETS)]),
);

export function prefabByKey(key: string): Prefab {
  const prefab = PREFABS[key];
  if (!prefab) throw new Error(`Unknown prefab "${key}"`);
  return prefab;
}
