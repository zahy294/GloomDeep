/**
 * Where world generation places decorations (plan 3.2 step 9; the decor tiles are in tiles.ts).
 * `in` lists surface biome keys (for `surface`) or depth layer keys (for cave placements); see
 * src/data/biomes.ts. Rules are tried in order per eligible cell; the first that rolls under its
 * chance places its decoration.
 */
export interface FloraRule {
  readonly decor: string;
  readonly where: 'surface' | 'caveFloor' | 'caveCeiling';
  readonly in: readonly string[];
  /** Chance per eligible cell. */
  readonly chance: number;
  /** Ceiling decorations hang in chains up to this long. */
  readonly chain?: number;
}

export const FLORA: readonly FloraRule[] = [
  // Elderglade: grass, ferns and flowers; the odd sapling.
  { decor: 'elder_sapling', where: 'surface', in: ['elderglade'], chance: 0.03 },
  { decor: 'fern', where: 'surface', in: ['elderglade'], chance: 0.12 },
  { decor: 'wildflower', where: 'surface', in: ['elderglade'], chance: 0.1 },
  { decor: 'grass_tuft', where: 'surface', in: ['elderglade'], chance: 0.45 },
  // Moonpetal Vale: silver grass and glowing moonpetals.
  { decor: 'moonbirch_sapling', where: 'surface', in: ['moonpetal_vale'], chance: 0.03 },
  { decor: 'moonpetal_bloom', where: 'surface', in: ['moonpetal_vale'], chance: 0.16 },
  { decor: 'silver_grass', where: 'surface', in: ['moonpetal_vale'], chance: 0.45 },
  // Weeping Mire: reeds and toadstools.
  { decor: 'willow_sapling', where: 'surface', in: ['weeping_mire'], chance: 0.03 },
  { decor: 'toadstool', where: 'surface', in: ['weeping_mire'], chance: 0.06 },
  { decor: 'mire_reed', where: 'surface', in: ['weeping_mire'], chance: 0.4 },
  // Underground.
  { decor: 'glowcap_sprout', where: 'caveFloor', in: ['glowcap_grottos'], chance: 0.35 },
  { decor: 'toadstool', where: 'caveFloor', in: ['glowcap_grottos', 'rootdeep'], chance: 0.05 },
  { decor: 'glowmoss_tuft', where: 'caveFloor', in: ['rootdeep'], chance: 0.35 },
  { decor: 'crystal_shard', where: 'caveFloor', in: ['moonstone_hollows'], chance: 0.25 },
  { decor: 'ember_bloom', where: 'caveFloor', in: ['ember_roots'], chance: 0.18 },
  {
    decor: 'hanging_moss',
    where: 'caveCeiling',
    in: ['glowcap_grottos', 'rootdeep'],
    chance: 0.1,
    chain: 5,
  },
  { decor: 'hanging_vine', where: 'caveCeiling', in: ['glowcap_grottos'], chance: 0.05, chain: 4 },
];

/**
 * Small overgrown ruins with carved runes that wake as the player approaches (plan 2.0). One
 * stands on the starting glade (right of the spawn; the giant tree is on the left).
 */
export const RUINS = {
  /** Surface biomes with ruins, and how many per 1000 columns. */
  biomes: ['elderglade', 'moonpetal_vale'],
  perThousandColumns: 1.5,
  /** Stone pillars per ruin, each this tall, this far apart. */
  pillars: [2, 4],
  pillarHeight: [2, 5],
  pillarSpacing: [3, 5],
  /** Chance a pillar block is carved with a rune. */
  runeChance: 0.35,
  /** Chance two neighbouring pillars are joined by a lintel on top. */
  lintelChance: 0.5,
  stone: 'runestone',
  rune: 'carved_runestone',
  spawnRuinOffset: 14,
} as const;
