import type { RampName } from './palette';

export interface TileDef {
  /** Numeric id stored in the world's Uint16Array. 0 is always air. */
  readonly id: number;
  readonly key: string;
  readonly name: string;
  readonly solid: boolean;
  /** Seconds to mine at mining power 1 (an elderwood pickaxe); stronger tools divide it. */
  readonly hardness: number;
  /**
   * Lowest pickaxe tier that can mine it (src/data/items.ts `tool.tier`): 0 = bare hands,
   * 1 elderwood, 2 copper, 3 iron, 4 moonsilver. Default 0.
   */
  readonly tier?: number;
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
  readonly placeholderShape?:
    | 'torch'
    | 'platform'
    | 'workbench'
    | 'furnace'
    | 'anvil'
    | 'door'
    | 'jar'
    | 'beacon'
    | 'beacon_dormant'
    | 'lamp'
    | 'lift'
    | 'hanging_lantern'
    | 'lure'
    | 'lever'
    | 'lever_open'
    | 'brazier'
    | 'prism_left'
    | 'prism_right'
    | 'node';
  /**
   * M12 wards: no pickaxe breaks it until this story flag is set (a boss beaten); after that it
   * mines like any tile of its `tier`.
   */
  readonly sealedUntil?: string;
  /**
   * M12 prisms: a light beam entering the cell turns like off a mirror — `slash` is "/", `back`
   * is "\". Right-clicking it turns it into `flipsTo` (the other way round).
   */
  readonly mirror?: { readonly kind: 'slash' | 'back'; readonly flipsTo: string };
  /**
   * A town street lamp (M11): as its fuel runs low it becomes `next` (lit → dim → out); refuelling
   * turns it back into the first lamp tile. Lamps are tracked by the TownSystem.
   */
  readonly lamp?: { readonly next: string | null };
  /** A dormant beacon (Rootdeep Citadel): relighting it with Lumen turns it into this tile. */
  readonly relights?: string;
  /** A crafting station (src/data/recipes.ts): recipes that need it work within reach of it. */
  readonly station?: string;
  /** Must stand on a solid block or platform; the block under it can't be mined while it stands. */
  readonly needsGround?: true;
  /**
   * Tree trunks: as a background wall with nothing in front, a plain click mines it (no wall
   * mode), so wood is the first thing anyone can gather.
   */
  readonly choppable?: true;
  /**
   * Hidden by the Azure lens's "true sight": the tile this one becomes once Azure light falls on
   * it (veiled ores look like plain rock; veiled spirit platforms can't be seen or touched).
   */
  readonly veiled?: string;
  /** Can't be touched, mined or seen (a veiled spirit platform): treated as empty space. */
  readonly intangible?: true;
  /** Drawn exactly like this tile (veiled ores pass for plain stone, even with real art). */
  readonly looksLike?: string;
  /** Loose material (silt, gravel): falls when nothing solid is under it (FallingSystem). */
  readonly falls?: true;
  /**
   * Burns (FireSystem): seconds a fire on it lasts, and the tile it leaves (grass burns down to
   * soil; null = nothing left). Applies to the tile as a block and as a background wall.
   */
  readonly flammable?: { readonly seconds: number; readonly becomes: string | null };
  /**
   * A door (M10): placed as a column of `DOOR_HEIGHT` cells; right-click swaps the whole column
   * between this tile and `toggles` (closed doors are solid, open ones are not).
   */
  readonly door?: { readonly toggles: string };
  /** Landing on its top bounces you back up, keeping this share of the fall speed (glowcaps). */
  readonly bouncy?: number;
  /** A beacon (M10): no shades spawn within `radius` tiles, the Gloam there burns away, and
   * right-clicking it opens fast travel to the other beacons. */
  readonly beacon?: { readonly radius: number };
  /** Lumen blooms: the tile it turns into when the light rises above / falls below a threshold. */
  readonly opensTo?: string;
  readonly closesTo?: string;
  /** Placeholder ore: the base ramp with clusters of this ramp's colours. */
  readonly placeholderOre?: RampName;
  /** One-way platform (branches): stand on its top, jump up through it, drop through with Down. */
  readonly platform?: boolean;
  /**
   * Leaf canopies: the fraction of straight-down sunlight that passes through each tile of this
   * kind (dappled shade under trees). Solid tiles stop sunlight; other tiles let it all through.
   */
  readonly sunTransmit?: number;
  /** Light lost per tile passing through this tile (0–255 scale); default air or solid falloff. */
  readonly lightFalloff?: number;
  /** Flora/decoration: drawn by the foliage renderer instead of the tilemap. */
  readonly decor?: DecorDef;
  /**
   * A falling-water column placed by worldgen: not solid, not drawn in the tilemap (the waterfall
   * renderer animates it), mined away in one hit.
   */
  readonly waterfall?: true;
}

/** What a decoration tile needs to stay in place, and how it is drawn. */
export interface DecorDef {
  /** The neighbour it hangs from or stands on; losing it removes the decoration. */
  readonly support: 'ground' | 'ceiling' | 'wall';
  /** Sprite asset id (src/data/spriteAssets.ts) and frame index in that sheet. */
  readonly sprite: string;
  readonly frame: number;
  /** Sway amplitude in radians at full wind (0 = rigid). */
  readonly sway: number;
  /** Shy vines (M10): curl up towards their support when the player comes close. */
  readonly shy?: true;
}

/**
 * Town fixtures (street lamps, lift posts) need a pickaxe beyond any made: they belong to the town.
 */
const TOWN_FIXTURE_TIER = 99;

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
    flammable: { seconds: 2, becomes: 'forest_soil' },
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
    tier: 1,
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
    flammable: { seconds: 7, becomes: null },
  },
  {
    id: 7,
    key: 'lumen_crystal',
    name: 'Lumen Crystal',
    solid: true,
    hardness: 1.4,
    tier: 1,
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
    tier: 2,
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
    tier: 3,
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
    flammable: { seconds: 2, becomes: 'forest_soil' },
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
    flammable: { seconds: 2, becomes: 'mud' },
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
    flammable: { seconds: 14, becomes: 'ash' },
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
    falls: true,
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
    falls: true,
  },
  {
    id: 16,
    key: 'runestone',
    name: 'Runestone',
    solid: true,
    hardness: 1.3,
    tier: 1,
    drop: 'runestone',
    mergesWith: [],
    placeholderRamp: 'moonSilver',
  },
  {
    id: 17,
    key: 'glowcap_flesh',
    bouncy: 0.8,
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
    flammable: { seconds: 9, becomes: null },
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
    tier: 3,
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
    tier: 4,
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
    tier: 1,
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
    tier: 2,
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
    tier: 3,
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
    tier: 2,
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
    tier: 4,
    drop: 'emberite_ore',
    mergesWith: ['basalt'],
    placeholderRamp: 'tealShadow',
    light: 'emberite',
    placeholderOre: 'ember',
  },
  {
    id: 27,
    key: 'living_wood',
    name: 'Living Wood',
    solid: true,
    hardness: 1.2,
    drop: 'living_wood',
    mergesWith: ['rootwood'],
    placeholderRamp: 'bark',
    choppable: true,
    flammable: { seconds: 8, becomes: null },
  },
  {
    id: 28,
    key: 'elder_leaves',
    name: 'Elder Leaves',
    solid: false,
    hardness: 0.15,
    drop: null,
    mergesWith: [],
    placeholderRamp: 'leaf',
    sunTransmit: 0.72,
    lightFalloff: 28,
    flammable: { seconds: 2.5, becomes: null },
  },
  {
    id: 29,
    key: 'moonbirch_leaves',
    name: 'Moonbirch Leaves',
    solid: false,
    hardness: 0.15,
    drop: null,
    mergesWith: [],
    placeholderRamp: 'mint',
    sunTransmit: 0.78,
    lightFalloff: 26,
    flammable: { seconds: 2.5, becomes: null },
  },
  {
    id: 30,
    key: 'willow_leaves',
    name: 'Willow Leaves',
    solid: false,
    hardness: 0.15,
    drop: null,
    mergesWith: [],
    placeholderRamp: 'moss',
    sunTransmit: 0.68,
    lightFalloff: 32,
    flammable: { seconds: 2.5, becomes: null },
  },
  {
    id: 31,
    key: 'branch',
    name: 'Branch',
    solid: false,
    hardness: 0.6,
    drop: 'living_wood',
    mergesWith: [],
    placeholderRamp: 'bark',
    platform: true,
    autotile: false,
    placeholderShape: 'platform',
    flammable: { seconds: 5, becomes: null },
  },
  {
    id: 32,
    key: 'carved_runestone',
    name: 'Carved Runestone',
    solid: true,
    hardness: 1.3,
    tier: 1,
    drop: 'runestone',
    mergesWith: ['runestone'],
    placeholderRamp: 'moonSilver',
    placeholderOre: 'cyan',
    light: 'rune',
  },
  // Decorations (flora): drawn by the foliage renderer, sprite frames in src/data/spriteAssets.ts.
  {
    id: 33,
    key: 'grass_tuft',
    name: 'Grass Tuft',
    solid: false,
    hardness: 0.05,
    drop: null,
    mergesWith: [],
    placeholderRamp: 'leaf',
    decor: { support: 'ground', sprite: 'flora', frame: 0, sway: 0.25 },
    flammable: { seconds: 1, becomes: null },
  },
  {
    id: 34,
    key: 'fern',
    name: 'Fern',
    solid: false,
    hardness: 0.05,
    drop: null,
    mergesWith: [],
    placeholderRamp: 'emerald',
    decor: { support: 'ground', sprite: 'flora', frame: 1, sway: 0.18 },
    flammable: { seconds: 1.2, becomes: null },
  },
  {
    id: 35,
    key: 'wildflower',
    name: 'Wildflower',
    solid: false,
    hardness: 0.05,
    drop: null,
    mergesWith: [],
    placeholderRamp: 'gold',
    decor: { support: 'ground', sprite: 'flora', frame: 2, sway: 0.22 },
    flammable: { seconds: 1, becomes: null },
  },
  {
    id: 36,
    key: 'moonpetal_bloom',
    name: 'Moonpetal Bloom',
    solid: false,
    hardness: 0.05,
    drop: null,
    mergesWith: [],
    placeholderRamp: 'moonSilver',
    light: 'moonpetal',
    decor: { support: 'ground', sprite: 'flora', frame: 3, sway: 0.18 },
    flammable: { seconds: 1, becomes: null },
  },
  {
    id: 37,
    key: 'silver_grass',
    name: 'Silver Grass',
    solid: false,
    hardness: 0.05,
    drop: null,
    mergesWith: [],
    placeholderRamp: 'moonSilver',
    decor: { support: 'ground', sprite: 'flora', frame: 4, sway: 0.3 },
    flammable: { seconds: 1, becomes: null },
  },
  {
    id: 38,
    key: 'mire_reed',
    name: 'Mire Reed',
    solid: false,
    hardness: 0.05,
    drop: null,
    mergesWith: [],
    placeholderRamp: 'moss',
    decor: { support: 'ground', sprite: 'flora', frame: 5, sway: 0.28 },
    flammable: { seconds: 1.5, becomes: null },
  },
  {
    id: 39,
    key: 'toadstool',
    name: 'Toadstool',
    solid: false,
    hardness: 0.05,
    drop: null,
    mergesWith: [],
    placeholderRamp: 'rose',
    decor: { support: 'ground', sprite: 'flora', frame: 6, sway: 0 },
  },
  {
    id: 40,
    key: 'glowcap_sprout',
    name: 'Glowcap Sprout',
    solid: false,
    hardness: 0.05,
    drop: null,
    mergesWith: [],
    placeholderRamp: 'rose',
    light: 'glowcap',
    decor: { support: 'ground', sprite: 'flora', frame: 7, sway: 0.04 },
  },
  {
    id: 41,
    key: 'hanging_moss',
    name: 'Hanging Moss',
    solid: false,
    hardness: 0.05,
    drop: null,
    mergesWith: [],
    placeholderRamp: 'moss',
    decor: { support: 'ceiling', sprite: 'flora', frame: 8, sway: 0.15 },
    flammable: { seconds: 1.5, becomes: null },
  },
  {
    id: 42,
    key: 'hanging_vine',
    name: 'Hanging Vine',
    solid: false,
    hardness: 0.05,
    drop: null,
    mergesWith: [],
    placeholderRamp: 'leaf',
    decor: { support: 'ceiling', sprite: 'flora', frame: 9, sway: 0.2, shy: true },
    flammable: { seconds: 1.5, becomes: null },
  },
  {
    id: 43,
    key: 'glowmoss_tuft',
    name: 'Glowmoss Tuft',
    solid: false,
    hardness: 0.05,
    drop: null,
    mergesWith: [],
    placeholderRamp: 'mint',
    light: 'glowmoss',
    decor: { support: 'ground', sprite: 'flora', frame: 10, sway: 0.06 },
  },
  {
    id: 44,
    key: 'crystal_shard',
    name: 'Crystal Shard',
    solid: false,
    hardness: 0.05,
    drop: null,
    mergesWith: [],
    placeholderRamp: 'cyan',
    light: 'moonstone_crystal',
    decor: { support: 'ground', sprite: 'flora', frame: 11, sway: 0 },
  },
  {
    id: 45,
    key: 'ember_bloom',
    name: 'Ember Bloom',
    solid: false,
    hardness: 0.05,
    drop: null,
    mergesWith: [],
    placeholderRamp: 'ember',
    light: 'ember_bloom',
    decor: { support: 'ground', sprite: 'flora', frame: 12, sway: 0.05 },
  },
  {
    id: 46,
    key: 'elder_sapling',
    name: 'Elder Sapling',
    solid: false,
    hardness: 0.05,
    drop: null,
    mergesWith: [],
    placeholderRamp: 'leaf',
    decor: { support: 'ground', sprite: 'saplings', frame: 0, sway: 0.04 },
    flammable: { seconds: 3, becomes: null },
  },
  {
    id: 47,
    key: 'moonbirch_sapling',
    name: 'Moonbirch Sapling',
    solid: false,
    hardness: 0.05,
    drop: null,
    mergesWith: [],
    placeholderRamp: 'mint',
    decor: { support: 'ground', sprite: 'saplings', frame: 1, sway: 0.05 },
    flammable: { seconds: 3, becomes: null },
  },
  {
    id: 48,
    key: 'willow_sapling',
    name: 'Willow Sapling',
    solid: false,
    hardness: 0.05,
    drop: null,
    mergesWith: [],
    placeholderRamp: 'moss',
    decor: { support: 'ground', sprite: 'saplings', frame: 2, sway: 0.06 },
    flammable: { seconds: 3, becomes: null },
  },
  {
    id: 49,
    key: 'waterfall',
    name: 'Waterfall',
    solid: false,
    hardness: 0.05,
    drop: null,
    mergesWith: [],
    placeholderRamp: 'cyan',
    waterfall: true,
  },
  // Crafting stations (src/data/recipes.ts). One tile each until furniture art arrives.
  {
    id: 50,
    key: 'workbench',
    name: 'Workbench',
    solid: false,
    hardness: 0.4,
    drop: 'workbench',
    mergesWith: [],
    placeholderRamp: 'bark',
    autotile: false,
    placeholderShape: 'workbench',
    station: 'workbench',
    needsGround: true,
    platform: true,
    flammable: { seconds: 6, becomes: null },
  },
  {
    id: 51,
    key: 'furnace',
    name: 'Furnace',
    solid: false,
    hardness: 0.8,
    drop: 'furnace',
    mergesWith: [],
    placeholderRamp: 'stone',
    light: 'furnace',
    autotile: false,
    placeholderShape: 'furnace',
    station: 'furnace',
    needsGround: true,
  },
  {
    id: 52,
    key: 'anvil',
    name: 'Anvil',
    solid: false,
    hardness: 0.8,
    drop: 'anvil',
    mergesWith: [],
    placeholderRamp: 'moonSilver',
    autotile: false,
    placeholderShape: 'anvil',
    station: 'anvil',
    needsGround: true,
  },
  // Azure lens secrets (M7): ore veins that look like stone, platforms that can't be seen.
  {
    id: 53,
    key: 'veiled_lumen',
    name: 'Stone',
    solid: true,
    hardness: 0.9,
    tier: 1,
    drop: 'stone',
    mergesWith: ['stone', 'forest_soil'],
    placeholderRamp: null,
    looksLike: 'stone',
    veiled: 'lumen_crystal',
  },
  {
    id: 54,
    key: 'veiled_moonsilver',
    name: 'Stone',
    solid: true,
    hardness: 0.9,
    tier: 1,
    drop: 'stone',
    mergesWith: ['stone', 'forest_soil'],
    placeholderRamp: null,
    looksLike: 'stone',
    veiled: 'moonsilver_ore',
  },
  {
    id: 55,
    key: 'veiled_spirit_platform',
    name: 'Nothing',
    solid: false,
    hardness: 0,
    drop: null,
    mergesWith: [],
    placeholderRamp: null,
    veiled: 'spirit_platform',
    intangible: true,
  },
  {
    id: 56,
    key: 'spirit_platform',
    name: 'Spirit Platform',
    solid: false,
    hardness: 0.3,
    drop: null,
    mergesWith: [],
    placeholderRamp: 'cyan',
    light: 'spirit',
    platform: true,
    autotile: false,
    placeholderShape: 'platform',
  },
  // M10: a living world.
  {
    id: 57,
    key: 'door_closed',
    name: 'Door',
    solid: true,
    hardness: 0.5,
    drop: 'door',
    mergesWith: [],
    placeholderRamp: 'bark',
    autotile: false,
    placeholderShape: 'door',
    door: { toggles: 'door_open' },
    flammable: { seconds: 6, becomes: null },
  },
  {
    id: 58,
    key: 'door_open',
    name: 'Door',
    solid: false,
    hardness: 0.5,
    drop: 'door',
    mergesWith: [],
    placeholderRamp: 'bark',
    autotile: false,
    placeholderShape: 'door',
    door: { toggles: 'door_closed' },
    flammable: { seconds: 6, becomes: null },
  },
  {
    id: 59,
    key: 'firefly_jar',
    name: 'Firefly Jar',
    solid: false,
    hardness: 0.1,
    drop: 'firefly_jar',
    mergesWith: [],
    placeholderRamp: 'moonSilver',
    light: 'firefly',
    autotile: false,
    placeholderShape: 'jar',
  },
  {
    id: 60,
    key: 'lumen_bloom',
    name: 'Lumen Bloom',
    solid: false,
    hardness: 0.05,
    drop: null,
    mergesWith: [],
    placeholderRamp: 'cyan',
    decor: { support: 'ground', sprite: 'flora', frame: 13, sway: 0.1 },
    opensTo: 'lumen_bloom_open',
  },
  {
    id: 61,
    key: 'lumen_bloom_open',
    name: 'Lumen Bloom',
    solid: false,
    hardness: 0.05,
    drop: 'lumen_petal',
    mergesWith: [],
    placeholderRamp: 'cyan',
    light: 'lumen_bloom',
    decor: { support: 'ground', sprite: 'flora', frame: 14, sway: 0.12 },
    closesTo: 'lumen_bloom',
  },
  {
    id: 62,
    key: 'fairy_mushroom',
    name: 'Fairy Mushroom',
    solid: false,
    hardness: 0.05,
    drop: null,
    mergesWith: [],
    placeholderRamp: 'rose',
    light: 'fae',
    decor: { support: 'ground', sprite: 'flora', frame: 15, sway: 0 },
  },
  {
    id: 63,
    key: 'beacon',
    name: 'Beacon',
    solid: false,
    hardness: 1.5,
    tier: 1,
    drop: 'beacon',
    mergesWith: [],
    placeholderRamp: 'cyan',
    light: 'beacon',
    autotile: false,
    placeholderShape: 'beacon',
    needsGround: true,
    beacon: { radius: 30 },
  },
  // M11: towns and folk. Street lamps burn fuel and step down lit → dim → out (TownSystem).
  {
    id: 64,
    key: 'street_lamp',
    name: 'Street Lamp',
    solid: false,
    hardness: 2,
    tier: TOWN_FIXTURE_TIER,
    drop: null,
    mergesWith: [],
    placeholderRamp: 'gold',
    light: 'street_lamp',
    autotile: false,
    placeholderShape: 'lamp',
    needsGround: true,
    lamp: { next: 'street_lamp_dim' },
  },
  {
    id: 65,
    key: 'street_lamp_dim',
    name: 'Street Lamp (dim)',
    solid: false,
    hardness: 2,
    tier: TOWN_FIXTURE_TIER,
    drop: null,
    mergesWith: [],
    placeholderRamp: 'gold',
    light: 'street_lamp_dim',
    autotile: false,
    placeholderShape: 'lamp',
    needsGround: true,
    lamp: { next: 'street_lamp_out' },
  },
  {
    id: 66,
    key: 'street_lamp_out',
    name: 'Street Lamp (out)',
    solid: false,
    hardness: 2,
    tier: TOWN_FIXTURE_TIER,
    drop: null,
    mergesWith: [],
    placeholderRamp: 'stone',
    autotile: false,
    placeholderShape: 'lamp',
    needsGround: true,
    lamp: { next: null },
  },
  {
    id: 67,
    key: 'rope_bridge',
    name: 'Rope Bridge',
    solid: false,
    hardness: 0.4,
    drop: 'elderwood_planks',
    mergesWith: [],
    placeholderRamp: 'honey',
    platform: true,
    autotile: false,
    placeholderShape: 'platform',
    flammable: { seconds: 5, becomes: null },
  },
  {
    id: 68,
    key: 'lift_post',
    name: 'Lift Basket',
    solid: false,
    hardness: 2,
    tier: TOWN_FIXTURE_TIER,
    drop: null,
    mergesWith: [],
    placeholderRamp: 'bark',
    autotile: false,
    placeholderShape: 'lift',
  },
  {
    id: 69,
    key: 'beacon_dormant',
    name: 'Dormant Beacon',
    solid: false,
    hardness: 4,
    tier: 5,
    drop: null,
    mergesWith: [],
    placeholderRamp: 'tealShadow',
    autotile: false,
    placeholderShape: 'beacon_dormant',
    needsGround: true,
    relights: 'great_beacon',
  },
  {
    id: 70,
    key: 'carved_brick',
    name: 'Carved Stone Bricks',
    solid: true,
    hardness: 1.4,
    tier: 1,
    drop: 'carved_brick',
    mergesWith: [],
    placeholderRamp: 'stone',
  },
  {
    id: 71,
    key: 'hanging_lantern',
    name: 'Hanging Lantern',
    solid: false,
    hardness: 0.2,
    drop: 'hanging_lantern',
    mergesWith: [],
    placeholderRamp: 'honey',
    light: 'hanging_lantern',
    autotile: false,
    placeholderShape: 'hanging_lantern',
  },
  {
    id: 72,
    key: 'great_beacon',
    name: 'Great Beacon',
    solid: false,
    hardness: 4,
    tier: 5,
    drop: null,
    mergesWith: [],
    placeholderRamp: 'cyan',
    light: 'beacon',
    autotile: false,
    placeholderShape: 'beacon',
    needsGround: true,
    beacon: { radius: 44 },
  },
  // M12 — wards across the way down (each breaks when its boss falls) and boss arenas.
  {
    id: 73,
    key: 'ward_stone_hollows',
    name: 'Warded Stone',
    solid: true,
    hardness: 3,
    tier: 3,
    drop: 'stone',
    mergesWith: ['ward_stone_heart'],
    placeholderRamp: 'gloam',
    light: 'ward',
    sealedUntil: 'boss:moth_matriarch',
  },
  {
    id: 74,
    key: 'ward_stone_heart',
    name: 'Deep-warded Stone',
    solid: true,
    hardness: 4,
    tier: 4,
    drop: 'obsidian',
    mergesWith: [],
    placeholderRamp: 'gloam',
    light: 'ward',
    sealedUntil: 'boss:hollow_warden',
  },
  {
    // Roots that close an arena's doorways while its boss fights (BossSystem).
    id: 75,
    key: 'arena_seal',
    name: 'Grasping Roots',
    solid: true,
    hardness: 9,
    tier: TOWN_FIXTURE_TIER,
    drop: null,
    mergesWith: [],
    placeholderRamp: 'bark',
  },
  {
    id: 76,
    key: 'moth_lure',
    name: 'Moth Lure',
    solid: false,
    hardness: 0.2,
    drop: 'moth_lure',
    mergesWith: [],
    placeholderRamp: 'rose',
    light: 'moth_lure',
    autotile: false,
    placeholderShape: 'lure',
    needsGround: true,
  },
  {
    id: 77,
    key: 'sluice_lever',
    name: 'Sluice Lever',
    solid: false,
    hardness: 2,
    tier: TOWN_FIXTURE_TIER,
    drop: null,
    mergesWith: [],
    placeholderRamp: 'bark',
    autotile: false,
    placeholderShape: 'lever',
  },
  {
    id: 78,
    key: 'sluice_lever_open',
    name: 'Sluice Lever (open)',
    solid: false,
    hardness: 2,
    tier: TOWN_FIXTURE_TIER,
    drop: null,
    mergesWith: [],
    placeholderRamp: 'bark',
    autotile: false,
    placeholderShape: 'lever_open',
  },
  {
    id: 79,
    key: 'mire_brazier',
    name: 'Mire Brazier',
    solid: false,
    hardness: 2,
    tier: TOWN_FIXTURE_TIER,
    drop: null,
    mergesWith: [],
    placeholderRamp: 'ember',
    light: 'brazier',
    autotile: false,
    placeholderShape: 'brazier',
  },
  {
    id: 80,
    key: 'mire_brazier_out',
    name: 'Drowned Brazier',
    solid: false,
    hardness: 2,
    tier: TOWN_FIXTURE_TIER,
    drop: null,
    mergesWith: [],
    placeholderRamp: 'stone',
    autotile: false,
    placeholderShape: 'brazier',
  },
  {
    id: 81,
    key: 'prism_slash',
    name: 'Prism',
    solid: false,
    hardness: 2,
    tier: TOWN_FIXTURE_TIER,
    drop: null,
    mergesWith: [],
    placeholderRamp: 'cyan',
    light: 'prism',
    autotile: false,
    placeholderShape: 'prism_left',
    mirror: { kind: 'slash', flipsTo: 'prism_back' },
  },
  {
    id: 82,
    key: 'prism_back',
    name: 'Prism',
    solid: false,
    hardness: 2,
    tier: TOWN_FIXTURE_TIER,
    drop: null,
    mergesWith: [],
    placeholderRamp: 'cyan',
    light: 'prism',
    autotile: false,
    placeholderShape: 'prism_right',
    mirror: { kind: 'back', flipsTo: 'prism_slash' },
  },
  {
    id: 83,
    key: 'heart_node',
    name: 'Choked Root-lamp',
    solid: false,
    hardness: 2,
    tier: TOWN_FIXTURE_TIER,
    drop: null,
    mergesWith: [],
    placeholderRamp: 'gloam',
    autotile: false,
    placeholderShape: 'node',
  },
  {
    id: 84,
    key: 'heart_node_lit',
    name: 'Root-lamp',
    solid: false,
    hardness: 2,
    tier: TOWN_FIXTURE_TIER,
    drop: null,
    mergesWith: [],
    placeholderRamp: 'gold',
    light: 'heart_node',
    autotile: false,
    placeholderShape: 'node',
  },
  {
    // Where the Gloam Heart was: the World Tree's light, burning again.
    id: 85,
    key: 'heartlight',
    name: 'The Heartlight',
    solid: false,
    hardness: 2,
    tier: TOWN_FIXTURE_TIER,
    drop: null,
    mergesWith: [],
    placeholderRamp: 'gold',
    light: 'heartlight',
    autotile: false,
    placeholderShape: 'beacon',
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
