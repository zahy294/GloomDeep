/**
 * Wards (M12, plan 1.3 "bosses unlock depths"): bands of warded stone laid across the whole width
 * of the world at the top of a depth layer. No pickaxe breaks a ward until the boss named by its
 * tile's `sealedUntil` flag (src/data/tiles.ts) has fallen.
 */
export interface WardDef {
  readonly key: string;
  readonly tile: string;
  /** The depth layer (src/data/biomes.ts) whose top it seals. */
  readonly layer: string;
  /** Rows thick. */
  readonly thickness: number;
}

export const WARDS: readonly WardDef[] = [
  { key: 'hollows', tile: 'ward_stone_hollows', layer: 'moonstone_hollows', thickness: 3 },
  { key: 'heart', tile: 'ward_stone_heart', layer: 'gloam_heart', thickness: 3 },
];
