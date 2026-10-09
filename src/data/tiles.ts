import type { RampName } from './palette';

export interface TileDef {
  /** Numeric id stored in the world's Uint16Array. 0 is always air. */
  readonly id: number;
  readonly key: string;
  readonly name: string;
  readonly solid: boolean;
  /** Seconds to mine at base mining power (tool tiers scale this in M6). */
  readonly hardness: number;
  /** Item key dropped when mined, or null for nothing. */
  readonly drop: string | null;
  /**
   * Tile keys this tile visually joins with (no outline between them), e.g. grass into soil.
   * Merging is symmetric: listing it on either tile is enough.
   */
  readonly mergesWith: readonly string[];
  /** Ramp used by the placeholder art generator and for mining particles. */
  readonly placeholderRamp: RampName | null;
  /** Light this tile emits (key in src/data/lights.ts). Emissive tiles also get a glow (plan 2.3). */
  readonly light?: string;
  /** false for objects like torches: one fixed look instead of blob autotiling. Default true. */
  readonly autotile?: boolean;
  /** Placeholder art shape for non-terrain tiles. */
  readonly placeholderShape?: 'torch';
}

/** First-pass tile registry. Add tiles here; no engine code should need to change. */
export const TILES: readonly TileDef[] = [
  {
    id: 0,
    key: 'air',
    name: 'Air',
    solid: false,
    hardness: 0,
    drop: null,
    mergesWith: [],
    placeholderRamp: null,
  },
  {
    id: 1,
    key: 'forest_soil',
    name: 'Forest Soil',
    solid: true,
    hardness: 0.35,
    drop: 'forest_soil',
    mergesWith: ['mud'],
    placeholderRamp: 'soil',
  },
  {
    id: 2,
    key: 'elderglade_grass',
    name: 'Elderglade Grass',
    solid: true,
    hardness: 0.4,
    drop: 'forest_soil',
    mergesWith: ['forest_soil'],
    placeholderRamp: 'leaf',
  },
  {
    id: 3,
    key: 'moss',
    name: 'Moss',
    solid: true,
    hardness: 0.4,
    drop: 'moss',
    mergesWith: ['stone'],
    placeholderRamp: 'moss',
  },
  {
    id: 4,
    key: 'stone',
    name: 'Stone',
    solid: true,
    hardness: 0.9,
    drop: 'stone',
    mergesWith: ['forest_soil'],
    placeholderRamp: 'stone',
  },
  {
    id: 5,
    key: 'mud',
    name: 'Mud',
    solid: true,
    hardness: 0.35,
    drop: 'mud',
    mergesWith: [],
    placeholderRamp: 'mud',
  },
  {
    id: 6,
    key: 'elderwood_planks',
    name: 'Elderwood Planks',
    solid: true,
    hardness: 0.5,
    drop: 'elderwood_planks',
    mergesWith: [],
    placeholderRamp: 'bark',
  },
  {
    id: 7,
    key: 'lumen_crystal',
    name: 'Lumen Crystal',
    solid: true,
    hardness: 1.4,
    drop: 'lumen_crystal',
    mergesWith: [],
    placeholderRamp: 'cyan',
    light: 'lumen_crystal',
  },
  {
    id: 8,
    key: 'moonstone_crystal',
    name: 'Moonstone Crystal',
    solid: true,
    hardness: 1.6,
    drop: 'moonstone_crystal',
    mergesWith: [],
    placeholderRamp: 'moonSilver',
    light: 'moonstone_crystal',
  },
  {
    id: 9,
    key: 'gloam_veined_stone',
    name: 'Gloam-veined Stone',
    solid: true,
    hardness: 1.2,
    drop: 'stone',
    mergesWith: ['stone'],
    placeholderRamp: 'gloam',
  },
  {
    id: 10,
    key: 'torch',
    name: 'Torch',
    solid: false,
    hardness: 0.05,
    drop: 'torch',
    mergesWith: [],
    placeholderRamp: 'ember',
    light: 'torch',
    autotile: false,
    placeholderShape: 'torch',
  },
];

export function tileById(id: number): TileDef | undefined {
  return TILES[id];
}

/** Id for a tile key. Throws on unknown keys so typos fail loudly at startup, not as air. */
export function tileId(key: string): number {
  const tile = TILES.find((t) => t.key === key);
  if (!tile) throw new Error(`Unknown tile key "${key}"`);
  return tile.id;
}
