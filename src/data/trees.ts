/**
 * Giant ancient trees (plan 2.0 signature visual, 3.2 step 7). World generation builds them as
 * structures: the trunk as background walls (you walk in front of it), branches as one-way
 * platforms with leaf clumps, a leaf canopy with gaps for light shafts, and roots in the ground.
 * Distances in tiles; [min, max] ranges are inclusive.
 */
export interface TreeSpecies {
  readonly key: string;
  /** Surface biome key (src/data/biomes.ts) where this species grows. */
  readonly biome: string;
  /** Columns between neighbouring giant trees, and the chance a site gets one. */
  readonly spacing: readonly [number, number];
  readonly chance: number;
  /** Tile keys. */
  readonly trunk: string;
  readonly leaves: string;
  readonly branch: string;
  readonly root: string;
  /** Hanging decoration under the canopy and branch clumps, or null. */
  readonly hanging: string | null;
  /** Trunk width at the base and height of the trunk above the ground. */
  readonly trunkWidth: readonly [number, number];
  readonly height: readonly [number, number];
  /** The trunk narrows to this fraction of its base width at the top. */
  readonly taper: number;
  readonly canopy: {
    /** Half-width and half-height of the canopy's main ellipse. */
    readonly radiusX: readonly [number, number];
    readonly radiusY: readonly [number, number];
    /** Extra ellipses scattered around the main one, for a lumpy outline. */
    readonly lumps: number;
    /** Fraction of the canopy left open as gaps (where light shafts fall). */
    readonly gaps: number;
    /** Noise wavelength of the gaps (bigger = larger holes). */
    readonly gapSize: number;
    /**
     * Fraction of the canopy's columns left open top to bottom: the sun falls straight through
     * them to the forest floor, which is where the light shafts are drawn.
     */
    readonly shafts: number;
    /** Leaf curtains hanging below the canopy (willows), rows; 0 = none. */
    readonly droop: number;
  };
  readonly branches: {
    readonly count: readonly [number, number];
    readonly length: readonly [number, number];
    /** Branches grow between these fractions of the trunk height. */
    readonly from: number;
    readonly to: number;
    /** Leaf clump radius at the branch tip. */
    readonly clump: number;
  };
  readonly roots: {
    /** Roots per side, and how far each reaches into the ground. */
    readonly perSide: readonly [number, number];
    readonly length: readonly [number, number];
  };
}

export const TREE_SPECIES: readonly TreeSpecies[] = [
  {
    key: 'elder',
    biome: 'elderglade',
    spacing: [70, 120],
    chance: 0.8,
    trunk: 'living_wood',
    leaves: 'elder_leaves',
    branch: 'branch',
    root: 'rootwood',
    hanging: 'hanging_vine',
    trunkWidth: [7, 10],
    height: [70, 105],
    taper: 0.55,
    canopy: {
      radiusX: [26, 34],
      radiusY: [12, 16],
      lumps: 6,
      gaps: 0.28,
      gapSize: 5,
      shafts: 0.14,
      droop: 0,
    },
    branches: { count: [3, 5], length: [9, 16], from: 0.35, to: 0.85, clump: 4 },
    roots: { perSide: [2, 3], length: [8, 16] },
  },
  {
    key: 'moonbirch',
    biome: 'moonpetal_vale',
    spacing: [55, 95],
    chance: 0.75,
    trunk: 'living_wood',
    leaves: 'moonbirch_leaves',
    branch: 'branch',
    root: 'rootwood',
    hanging: null,
    trunkWidth: [4, 6],
    height: [60, 90],
    taper: 0.6,
    canopy: {
      radiusX: [13, 18],
      radiusY: [18, 24],
      lumps: 5,
      gaps: 0.32,
      gapSize: 4,
      shafts: 0.16,
      droop: 0,
    },
    branches: { count: [2, 4], length: [6, 11], from: 0.45, to: 0.85, clump: 3 },
    roots: { perSide: [1, 2], length: [6, 10] },
  },
  {
    key: 'willow',
    biome: 'weeping_mire',
    spacing: [60, 100],
    chance: 0.7,
    trunk: 'living_wood',
    leaves: 'willow_leaves',
    branch: 'branch',
    root: 'rootwood',
    hanging: 'hanging_moss',
    trunkWidth: [5, 8],
    height: [40, 60],
    taper: 0.65,
    canopy: {
      radiusX: [22, 28],
      radiusY: [9, 13],
      lumps: 5,
      gaps: 0.22,
      gapSize: 4,
      shafts: 0.1,
      droop: 18,
    },
    branches: { count: [2, 3], length: [8, 13], from: 0.5, to: 0.85, clump: 3 },
    roots: { perSide: [2, 3], length: [8, 14] },
  },
];

/**
 * One giant tree stands at the edge of the starting glade, so the first view of the game is under
 * its canopy (plan M5: "standing still in the Elderglade at sunrise...").
 */
export const SPAWN_TREE = { species: 'elder', offset: 26 } as const;

export function treeSpecies(key: string): TreeSpecies {
  const species = TREE_SPECIES.find((s) => s.key === key);
  if (!species) throw new Error(`Unknown tree species "${key}"`);
  return species;
}
