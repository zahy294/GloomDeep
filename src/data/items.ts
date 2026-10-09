/** Item registry. Ids are array indices (like tiles); keys are what other data refers to. */

/** Inventory sorting groups, in sort order. */
export const ITEM_CATEGORIES = [
  'tool',
  'weapon',
  'lens',
  'station',
  'light',
  'material',
  'block',
] as const;
export type ItemCategory = (typeof ITEM_CATEGORIES)[number];

/** A pickaxe: mines tiles up to `tier` (src/data/tiles.ts), `power` × faster than power 1. */
export interface ToolDef {
  readonly kind: 'pickaxe';
  readonly tier: number;
  readonly power: number;
}

/**
 * A weapon (M8). Melee swings hit everything in an arc within `reach`; ranged fires `ammo` (each
 * arrow adds its `ammoDamage`); magic spends `lumenCost` Lumen per shot. `useTime` is seconds
 * between uses (and a swing's length); knockback multiplies COMBAT.knockbackSpeed.
 */
export interface WeaponDef {
  readonly kind: 'melee' | 'ranged' | 'magic';
  readonly damage: number;
  readonly knockback: number;
  readonly useTime: number;
  readonly reach?: number;
  readonly ammo?: string;
  readonly projectileSpeed?: number;
  readonly lumenCost?: number;
  /** Enemies one shot can hit (beams pierce). */
  readonly pierce?: number;
}

export interface ItemDef {
  readonly id: number;
  readonly key: string;
  readonly name: string;
  readonly maxStack: number;
  /** Tile key this item places (as a block, or as a background wall), or null. */
  readonly placesTile: string | null;
  readonly category: ItemCategory;
  /** Tooltip flavour line. */
  readonly description?: string;
  /** Frame in the `items` sprite sheet; items without one show their tile's icon. */
  readonly icon?: number;
  readonly tool?: ToolDef;
  /** A lantern lens (src/data/lenses.ts key): carrying it lets you switch to that lens. */
  readonly lens?: string;
  /** Thrown with the right mouse button instead of placed (flares: FLARE in config). */
  readonly throws?: 'flare';
  readonly weapon?: WeaponDef;
  /**
   * A bucket (M9): `empty` scoops up a full cell of liquid, the others pour one out (right mouse).
   */
  readonly bucket?: 'empty' | 'water' | 'lava';
  /** Damage this item adds when shot as ammo. */
  readonly ammoDamage?: number;
}

const BLOCK_STACK = 999;
const MATERIAL_STACK = 999;
const STATION_STACK = 99;

export const ITEMS: readonly ItemDef[] = [
  {
    id: 0,
    key: 'forest_soil',
    name: 'Forest Soil',
    maxStack: BLOCK_STACK,
    placesTile: 'forest_soil',
    category: 'block',
  },
  {
    id: 1,
    key: 'moss',
    name: 'Moss',
    maxStack: BLOCK_STACK,
    placesTile: 'moss',
    category: 'block',
  },
  {
    id: 2,
    key: 'stone',
    name: 'Stone',
    maxStack: BLOCK_STACK,
    placesTile: 'stone',
    category: 'block',
  },
  { id: 3, key: 'mud', name: 'Mud', maxStack: BLOCK_STACK, placesTile: 'mud', category: 'block' },
  {
    id: 4,
    key: 'elderwood_planks',
    name: 'Elderwood Planks',
    maxStack: BLOCK_STACK,
    placesTile: 'elderwood_planks',
    category: 'block',
  },
  {
    id: 5,
    key: 'lumen_crystal',
    name: 'Lumen Crystal',
    maxStack: BLOCK_STACK,
    placesTile: 'lumen_crystal',
    category: 'material',
  },
  {
    id: 6,
    key: 'moonstone_crystal',
    name: 'Moonstone Crystal',
    maxStack: BLOCK_STACK,
    placesTile: 'moonstone_crystal',
    category: 'material',
  },
  {
    id: 7,
    key: 'torch',
    name: 'Torch',
    maxStack: BLOCK_STACK,
    placesTile: 'torch',
    category: 'light',
  },
  {
    id: 8,
    key: 'peat',
    name: 'Peat',
    maxStack: BLOCK_STACK,
    placesTile: 'peat',
    category: 'block',
  },
  {
    id: 9,
    key: 'silt',
    name: 'Silt',
    maxStack: BLOCK_STACK,
    placesTile: 'silt',
    category: 'block',
  },
  {
    id: 10,
    key: 'gravel',
    name: 'Gravel',
    maxStack: BLOCK_STACK,
    placesTile: 'gravel',
    category: 'block',
  },
  {
    id: 11,
    key: 'runestone',
    name: 'Runestone',
    maxStack: BLOCK_STACK,
    placesTile: 'runestone',
    category: 'block',
  },
  {
    id: 12,
    key: 'glowcap_flesh',
    name: 'Glowcap Flesh',
    maxStack: BLOCK_STACK,
    placesTile: 'glowcap_flesh',
    category: 'block',
  },
  {
    id: 13,
    key: 'rootwood',
    name: 'Rootwood',
    maxStack: BLOCK_STACK,
    placesTile: 'rootwood',
    category: 'block',
  },
  { id: 14, key: 'ash', name: 'Ash', maxStack: BLOCK_STACK, placesTile: 'ash', category: 'block' },
  {
    id: 15,
    key: 'basalt',
    name: 'Basalt',
    maxStack: BLOCK_STACK,
    placesTile: 'basalt',
    category: 'block',
  },
  {
    id: 16,
    key: 'obsidian',
    name: 'Obsidian',
    maxStack: BLOCK_STACK,
    placesTile: 'obsidian',
    category: 'block',
  },
  {
    id: 17,
    key: 'copper_ore',
    name: 'Copper Ore',
    maxStack: BLOCK_STACK,
    placesTile: 'copper_ore',
    category: 'material',
  },
  {
    id: 18,
    key: 'iron_ore',
    name: 'Iron Ore',
    maxStack: BLOCK_STACK,
    placesTile: 'iron_ore',
    category: 'material',
  },
  {
    id: 19,
    key: 'moonsilver_ore',
    name: 'Moonsilver Ore',
    maxStack: BLOCK_STACK,
    placesTile: 'moonsilver_ore',
    category: 'material',
  },
  {
    id: 20,
    key: 'gold_ore',
    name: 'Gold Ore',
    maxStack: BLOCK_STACK,
    placesTile: 'gold_ore',
    category: 'material',
  },
  {
    id: 21,
    key: 'emberite_ore',
    name: 'Emberite Ore',
    maxStack: BLOCK_STACK,
    placesTile: 'emberite_ore',
    category: 'material',
  },
  {
    id: 22,
    key: 'living_wood',
    name: 'Living Wood',
    maxStack: BLOCK_STACK,
    placesTile: 'living_wood',
    category: 'block',
  },
  // Tools (M6). Power 1 = an elderwood pickaxe; hands are MINING.handPower.
  {
    id: 23,
    key: 'elderwood_pickaxe',
    name: 'Elderwood Pickaxe',
    maxStack: 1,
    placesTile: null,
    category: 'tool',
    description: 'Breaks stone and copper.',
    icon: 0,
    tool: { kind: 'pickaxe', tier: 1, power: 1 },
  },
  {
    id: 24,
    key: 'copper_pickaxe',
    name: 'Copper Pickaxe',
    maxStack: 1,
    placesTile: null,
    category: 'tool',
    description: 'Strong enough for iron.',
    icon: 1,
    tool: { kind: 'pickaxe', tier: 2, power: 1.35 },
  },
  {
    id: 25,
    key: 'iron_pickaxe',
    name: 'Iron Pickaxe',
    maxStack: 1,
    placesTile: null,
    category: 'tool',
    description: 'Cuts through basalt and moonsilver.',
    icon: 2,
    tool: { kind: 'pickaxe', tier: 3, power: 1.75 },
  },
  {
    id: 26,
    key: 'moonsilver_pickaxe',
    name: 'Moonsilver Pickaxe',
    maxStack: 1,
    placesTile: null,
    category: 'tool',
    description: 'Cold and bright. Breaks obsidian and emberite.',
    icon: 3,
    tool: { kind: 'pickaxe', tier: 4, power: 2.2 },
  },
  {
    id: 27,
    key: 'copper_bar',
    name: 'Copper Bar',
    maxStack: MATERIAL_STACK,
    placesTile: null,
    category: 'material',
    icon: 4,
  },
  {
    id: 28,
    key: 'iron_bar',
    name: 'Iron Bar',
    maxStack: MATERIAL_STACK,
    placesTile: null,
    category: 'material',
    icon: 5,
  },
  {
    id: 29,
    key: 'moonsilver_bar',
    name: 'Moonsilver Bar',
    maxStack: MATERIAL_STACK,
    placesTile: null,
    category: 'material',
    icon: 6,
  },
  {
    id: 30,
    key: 'workbench',
    name: 'Workbench',
    maxStack: STATION_STACK,
    placesTile: 'workbench',
    category: 'station',
    description: 'Crafting station for wooden tools and furniture.',
  },
  {
    id: 31,
    key: 'furnace',
    name: 'Furnace',
    maxStack: STATION_STACK,
    placesTile: 'furnace',
    category: 'station',
    description: 'Smelts ore into bars.',
  },
  {
    id: 32,
    key: 'anvil',
    name: 'Anvil',
    maxStack: STATION_STACK,
    placesTile: 'anvil',
    category: 'station',
    description: 'Forges metal tools.',
  },
  // M7: the lenses, gold and flares.
  {
    id: 33,
    key: 'gold_bar',
    name: 'Gold Bar',
    maxStack: MATERIAL_STACK,
    placesTile: null,
    category: 'material',
    icon: 7,
  },
  {
    id: 34,
    key: 'azure_lens',
    name: 'Azure Lens',
    maxStack: 1,
    placesTile: null,
    category: 'lens',
    description: 'True sight: hidden ore and spirit platforms show in its light. Q to switch.',
    icon: 8,
    lens: 'azure',
  },
  {
    id: 35,
    key: 'crimson_lens',
    name: 'Crimson Lens',
    maxStack: 1,
    placesTile: null,
    category: 'lens',
    description: 'Its light burns the Gloam away. Q to switch.',
    icon: 9,
    lens: 'crimson',
  },
  {
    id: 36,
    key: 'verdant_lens',
    name: 'Verdant Lens',
    maxStack: 1,
    placesTile: null,
    category: 'lens',
    description: 'Grass, flowers and glowmoss grow in its light. Q to switch.',
    icon: 10,
    lens: 'verdant',
  },
  {
    id: 37,
    key: 'flare',
    name: 'Flare',
    maxStack: MATERIAL_STACK,
    placesTile: null,
    category: 'light',
    description: 'Right-click to throw. Burns bright for a while.',
    icon: 11,
    throws: 'flare',
  },
  // M8 weapons. Selecting one makes the left button attack instead of mine.
  {
    id: 38,
    key: 'elderwood_sword',
    name: 'Elderwood Sword',
    maxStack: 1,
    placesTile: null,
    category: 'weapon',
    description: 'A sturdy wooden blade.',
    icon: 12,
    weapon: { kind: 'melee', damage: 9, knockback: 4, useTime: 0.38, reach: 30 },
  },
  {
    id: 39,
    key: 'copper_sword',
    name: 'Copper Sword',
    maxStack: 1,
    placesTile: null,
    category: 'weapon',
    icon: 13,
    weapon: { kind: 'melee', damage: 13, knockback: 4.5, useTime: 0.36, reach: 32 },
  },
  {
    id: 40,
    key: 'iron_sword',
    name: 'Iron Sword',
    maxStack: 1,
    placesTile: null,
    category: 'weapon',
    icon: 14,
    weapon: { kind: 'melee', damage: 18, knockback: 5, useTime: 0.34, reach: 34 },
  },
  {
    id: 41,
    key: 'elderwood_bow',
    name: 'Elderwood Bow',
    maxStack: 1,
    placesTile: null,
    category: 'weapon',
    description: 'Shoots arrows from your bag.',
    icon: 15,
    weapon: { kind: 'ranged', damage: 6, knockback: 2, useTime: 0.5, ammo: 'wooden_arrow' },
  },
  {
    id: 42,
    key: 'wooden_arrow',
    name: 'Wooden Arrow',
    maxStack: MATERIAL_STACK,
    placesTile: null,
    category: 'weapon',
    icon: 16,
    ammoDamage: 4,
  },
  {
    id: 43,
    key: 'lumen_staff',
    name: 'Lumen Staff',
    maxStack: 1,
    placesTile: null,
    category: 'weapon',
    description: 'Fires a beam of stored light. Costs Lumen; shades fear it.',
    icon: 17,
    weapon: {
      kind: 'magic',
      damage: 14,
      knockback: 2,
      useTime: 0.45,
      lumenCost: 1.5,
      pierce: 3,
    },
  },
  // M9: buckets. Right-click scoops liquid into an empty bucket or pours a full one out.
  {
    id: 44,
    key: 'bucket',
    name: 'Bucket',
    maxStack: STATION_STACK,
    placesTile: null,
    category: 'tool',
    description: 'Right-click a pool to scoop up water or lava.',
    icon: 18,
    bucket: 'empty',
  },
  {
    id: 45,
    key: 'water_bucket',
    name: 'Water Bucket',
    maxStack: 1,
    placesTile: null,
    category: 'tool',
    description: 'Right-click to pour.',
    icon: 19,
    bucket: 'water',
  },
  {
    id: 46,
    key: 'lava_bucket',
    name: 'Lava Bucket',
    maxStack: 1,
    placesTile: null,
    category: 'tool',
    description: 'Right-click to pour. Careful.',
    icon: 20,
    bucket: 'lava',
  },
];

export function itemById(id: number): ItemDef | undefined {
  return ITEMS[id];
}

/** Id for an item key. Throws on unknown keys so data typos fail loudly. */
export function itemId(key: string): number {
  const item = ITEMS.find((i) => i.key === key);
  if (!item) throw new Error(`Unknown item key "${key}"`);
  return item.id;
}

/** One entry of a starting inventory or debug kit. */
export interface ItemCount {
  readonly item: string;
  readonly count: number;
}

/** What a new player starts with: everything else is mined and crafted (M6 "Done when"). */
export const STARTING_INVENTORY: readonly ItemCount[] = [{ item: 'torch', count: 10 }];

/**
 * Debug kits added on top of the starting inventory with `?kit=<key>` (screenshots and testing).
 * `build` is the M2–M5 building kit.
 */
export const DEBUG_KITS: Readonly<Record<string, readonly ItemCount[]>> = {
  build: [
    { item: 'copper_pickaxe', count: 1 },
    { item: 'elderwood_planks', count: 99 },
    { item: 'stone', count: 50 },
    { item: 'torch', count: 20 },
  ],
  lenses: [
    { item: 'azure_lens', count: 1 },
    { item: 'crimson_lens', count: 1 },
    { item: 'verdant_lens', count: 1 },
    { item: 'flare', count: 20 },
    { item: 'torch', count: 20 },
  ],
  combat: [
    { item: 'iron_sword', count: 1 },
    { item: 'elderwood_bow', count: 1 },
    { item: 'wooden_arrow', count: 99 },
    { item: 'lumen_staff', count: 1 },
    { item: 'crimson_lens', count: 1 },
    { item: 'torch', count: 20 },
    { item: 'flare', count: 10 },
  ],
  // Hotbar order matters for the M9 shots: torch, pickaxe, flare, gravel, 4 water, lava, bucket.
  materials: [
    { item: 'iron_pickaxe', count: 1 },
    { item: 'flare', count: 10 },
    { item: 'gravel', count: 40 },
    { item: 'water_bucket', count: 1 },
    { item: 'water_bucket', count: 1 },
    { item: 'water_bucket', count: 1 },
    { item: 'water_bucket', count: 1 },
    { item: 'lava_bucket', count: 1 },
    { item: 'bucket', count: 4 },
    { item: 'silt', count: 40 },
    { item: 'elderwood_planks', count: 60 },
  ],
  crafting: [
    { item: 'elderwood_pickaxe', count: 1 },
    { item: 'living_wood', count: 20 },
    { item: 'stone', count: 40 },
    { item: 'copper_ore', count: 30 },
    { item: 'iron_ore', count: 24 },
    { item: 'workbench', count: 1 },
    { item: 'furnace', count: 1 },
  ],
};
