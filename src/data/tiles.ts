import type { RampName } from './palette';

export interface TileDef {
  /** Numeric id stored in the world's Uint16Array. 0 is always air. */
  readonly id: number;
  readonly key: string;
  readonly name: string;
  readonly solid: boolean;
  /** Ramp used by the placeholder art generator until real art is approved. */
  readonly placeholderRamp: RampName | null;
}

/** First-pass tile registry. Add tiles here; no engine code should need to change. */
export const TILES: readonly TileDef[] = [
  { id: 0, key: 'air', name: 'Air', solid: false, placeholderRamp: null },
  { id: 1, key: 'forest_soil', name: 'Forest Soil', solid: true, placeholderRamp: 'soil' },
  {
    id: 2,
    key: 'elderglade_grass',
    name: 'Elderglade Grass',
    solid: true,
    placeholderRamp: 'leaf',
  },
  { id: 3, key: 'moss', name: 'Moss', solid: true, placeholderRamp: 'moss' },
  { id: 4, key: 'stone', name: 'Stone', solid: true, placeholderRamp: 'stone' },
  { id: 5, key: 'mud', name: 'Mud', solid: true, placeholderRamp: 'mud' },
  {
    id: 6,
    key: 'elderwood_planks',
    name: 'Elderwood Planks',
    solid: true,
    placeholderRamp: 'bark',
  },
  { id: 7, key: 'lumen_crystal', name: 'Lumen Crystal', solid: true, placeholderRamp: 'cyan' },
  {
    id: 8,
    key: 'moonstone_crystal',
    name: 'Moonstone Crystal',
    solid: true,
    placeholderRamp: 'moonSilver',
  },
  {
    id: 9,
    key: 'gloam_veined_stone',
    name: 'Gloam-veined Stone',
    solid: true,
    placeholderRamp: 'gloam',
  },
];

export function tileById(id: number): TileDef | undefined {
  return TILES[id];
}
