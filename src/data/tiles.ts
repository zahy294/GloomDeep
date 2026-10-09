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
  /** Placeholder ore: the base ramp with clusters of this ramp's colours. */
  readonly placeholderOre?: RampName;
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
  {
    id: 11,
    key: 'moonpetal_grass',
    name: 'Moonpetal Grass',
    solid: true,
    hardness: 0.4,
    drop: 'forest_soil',
    mergesWith: ['forest_soil'],
    placeholderRamp: 'moonSilver',
  },
  {
    id: 12,
    key: 'mire_grass',
    name: 'Mire Grass',
    solid: true,
    hardness: 0.4,
    drop: 'mud',
    mergesWith: ['mud'],
    placeholderRamp: 'tealShadow',
  },
  {
    id: 13,
    key: 'peat',
    name: 'Peat',
    solid: true,
    hardness: 0.35,
    drop: 'peat',
    mergesWith: ['mud'],
    placeholderRamp: 'bark',
  },
  {
    id: 14,
    key: 'silt',
    name: 'Silt',
    solid: true,
    hardness: 0.3,
    drop: 'silt',
    mergesWith: ['forest_soil'],
    placeholderRamp: 'honey',
  },
  {
    id: 15,
    key: 'gravel',
    name: 'Gravel',
    solid: true,
    hardness: 0.45,
    drop: 'gravel',
    mergesWith: ['stone'],
    placeholderRamp: 'stone',
  },
  {
    id: 16,
    key: 'runestone',
    name: 'Runestone',
    solid: true,
    hardness: 1.3,
    drop: 'runestone',
    mergesWith: [],
    placeholderRamp: 'moonSilver',
  },
  {
    id: 17,
    key: 'glowcap_flesh',
    name: 'Glowcap Flesh',
    solid: true,
    hardness: 0.3,
    drop: 'glowcap_flesh',
    mergesWith: [],
    placeholderRamp: 'rose',
    light: 'glowcap',
  },
  {
    id: 18,
    key: 'rootwood',
    name: 'Rootwood',
    solid: true,
    hardness: 0.8,
    drop: 'rootwood',
    mergesWith: [],
    placeholderRamp: 'bark',
  },
  {
    id: 19,
    key: 'ash',
    name: 'Ash',
    solid: true,
    hardness: 0.3,
    drop: 'ash',
    mergesWith: ['basalt'],
    placeholderRamp: 'mud',
  },
  {
    id: 20,
    key: 'basalt',
    name: 'Basalt',
    solid: true,
    hardness: 1.1,
    drop: 'basalt',
    mergesWith: [],
    placeholderRamp: 'tealShadow',
  },
  {
    id: 21,
    key: 'obsidian',
    name: 'Obsidian',
    solid: true,
    hardness: 2.2,
    drop: 'obsidian',
    mergesWith: [],
    placeholderRamp: 'tealShadow',
  },
  {
    id: 22,
    key: 'copper_ore',
    name: 'Copper Ore',
    solid: true,
    hardness: 1,
    drop: 'copper_ore',
    mergesWith: ['stone'],
    placeholderRamp: 'stone',
    placeholderOre: 'ember',
  },
  {
    id: 23,
    key: 'iron_ore',
    name: 'Iron Ore',
    solid: true,
    hardness: 1.2,
    drop: 'iron_ore',
    mergesWith: ['stone'],
    placeholderRamp: 'stone',
    placeholderOre: 'moonSilver',
  },
  {
    id: 24,
    key: 'moonsilver_ore',
    name: 'Moonsilver Ore',
    solid: true,
    hardness: 1.6,
    drop: 'moonsilver_ore',
    mergesWith: ['stone'],
    placeholderRamp: 'stone',
    placeholderOre: 'cyan',
  },
  {
    id: 25,
    key: 'gold_ore',
    name: 'Gold Ore',
    solid: true,
    hardness: 1.4,
    drop: 'gold_ore',
    mergesWith: ['stone'],
    placeholderRamp: 'stone',
    placeholderOre: 'gold',
  },
  {
    id: 26,
    key: 'emberite_ore',
    name: 'Emberite Ore',
    solid: true,
    hardness: 1.8,
    drop: 'emberite_ore',
    mergesWith: ['basalt'],
    placeholderRamp: 'tealShadow',
    light: 'emberite',
    placeholderOre: 'ember',
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
