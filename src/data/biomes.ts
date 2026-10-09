/**
 * Biomes (plan 1.6). Surface biomes are horizontal bands across the top of the world; depth
 * layers are stacked underneath, the same across the whole width. Tile choices are keys into
 * src/data/tiles.ts so adding a biome needs no engine code.
 */

export interface SurfaceBiomeDef {
  readonly key: string;
  readonly name: string;
  readonly grass: string;
  readonly soil: string;
  /** Extra layer between soil and stone (e.g. peat in the Mire), or null. */
  readonly subsoil: string | null;
  /** Hills: amplitude multiplier for this biome's terrain (1 = default). */
  readonly hilliness: number;
  /** Chance per surface dip of a water pool. */
  readonly poolChance: number;
}

/** Index order matters: World.surfaceBiome stores these indices. */
export const SURFACE_BIOMES: readonly SurfaceBiomeDef[] = [
  {
    key: 'elderglade',
    name: 'Elderglade',
    grass: 'elderglade_grass',
    soil: 'forest_soil',
    subsoil: null,
    hilliness: 1,
    poolChance: 0.15,
  },
  {
    key: 'moonpetal_vale',
    name: 'Moonpetal Vale',
    grass: 'moonpetal_grass',
    soil: 'forest_soil',
    subsoil: 'silt',
    hilliness: 0.6,
    poolChance: 0.1,
  },
  {
    key: 'weeping_mire',
    name: 'Weeping Mire',
    grass: 'mire_grass',
    soil: 'mud',
    subsoil: 'peat',
    hilliness: 0.35,
    poolChance: 0.7,
  },
];

export interface OreDef {
  readonly tile: string;
  /** Vein density 0..1 (fraction of host rock cells that become this ore, roughly). */
  readonly density: number;
  /** Vein size in tiles (noise wavelength). */
  readonly size: number;
}

export interface DepthLayerDef {
  readonly key: string;
  readonly name: string;
  /** Top of the layer as a fraction of world height (the first layer starts below the soil). */
  readonly top: number;
  /** Main rock and a secondary rock blended in by noise. */
  readonly rock: string;
  readonly altRock: string | null;
  readonly altRockAmount: number;
  /** Cave threshold override (lower = more open). */
  readonly caveThreshold: number;
  readonly ores: readonly OreDef[];
  /** Liquid that fills some low caves here. */
  readonly liquid: 'water' | 'lava' | null;
  /** Signature feature tile scattered in clumps (glowcaps, roots, crystals...), or null. */
  readonly feature: string | null;
  readonly featureAmount: number;
  /** Initial Gloam strength 0..1 (plan 1.4: strongest near the bottom). */
  readonly gloam: number;
}

/** From the surface down (plan 1.6). `top` values must increase. */
export const DEPTH_LAYERS: readonly DepthLayerDef[] = [
  {
    key: 'glowcap_grottos',
    name: 'Glowcap Grottos',
    top: 0.0,
    rock: 'stone',
    altRock: 'gravel',
    altRockAmount: 0.12,
    caveThreshold: 0.67,
    ores: [
      { tile: 'copper_ore', density: 0.05, size: 5 },
      // A little shallow iron so the copper → iron step doesn't need a dig to Rootdeep.
      { tile: 'iron_ore', density: 0.012, size: 4 },
      { tile: 'lumen_crystal', density: 0.015, size: 3 },
    ],
    liquid: 'water',
    feature: 'glowcap_flesh',
    featureAmount: 0.05,
    // A trace of Gloam even here, so dark tunnels near the surface can turn (plan 1.4).
    gloam: 0.06,
  },
  {
    key: 'rootdeep',
    name: 'Rootdeep',
    top: 0.48,
    rock: 'stone',
    altRock: 'runestone',
    altRockAmount: 0.04,
    caveThreshold: 0.68,
    ores: [
      { tile: 'copper_ore', density: 0.03, size: 5 },
      { tile: 'iron_ore', density: 0.05, size: 5 },
      { tile: 'lumen_crystal', density: 0.02, size: 3 },
    ],
    liquid: 'water',
    feature: 'rootwood',
    featureAmount: 0.08,
    gloam: 0.25,
  },
  {
    key: 'moonstone_hollows',
    name: 'Moonstone Hollows',
    top: 0.62,
    rock: 'stone',
    altRock: 'moonstone_crystal',
    altRockAmount: 0.05,
    caveThreshold: 0.66,
    ores: [
      { tile: 'iron_ore', density: 0.03, size: 5 },
      { tile: 'moonsilver_ore', density: 0.04, size: 4 },
      { tile: 'gold_ore', density: 0.02, size: 4 },
      { tile: 'lumen_crystal', density: 0.04, size: 3 },
    ],
    liquid: 'water',
    feature: 'moonstone_crystal',
    featureAmount: 0.06,
    gloam: 0.15,
  },
  {
    key: 'ember_roots',
    name: 'Ember Roots',
    top: 0.77,
    rock: 'basalt',
    altRock: 'ash',
    altRockAmount: 0.2,
    caveThreshold: 0.67,
    ores: [
      { tile: 'gold_ore', density: 0.02, size: 4 },
      { tile: 'emberite_ore', density: 0.04, size: 4 },
      { tile: 'obsidian', density: 0.03, size: 5 },
    ],
    liquid: 'lava',
    feature: 'rootwood',
    featureAmount: 0.04,
    gloam: 0.35,
  },
  {
    key: 'gloam_heart',
    name: 'The Gloam Heart',
    top: 0.91,
    rock: 'gloam_veined_stone',
    altRock: 'obsidian',
    altRockAmount: 0.1,
    caveThreshold: 0.66,
    ores: [],
    liquid: null,
    feature: null,
    featureAmount: 0,
    gloam: 1,
  },
];

/** Liquid types stored in World.liquidType. 0 = none. */
export const LIQUID = { none: 0, water: 1, lava: 2 } as const;
