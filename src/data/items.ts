/** Item registry. Ids are array indices (like tiles); keys are what other data refers to. */

export interface ItemDef {
  readonly id: number;
  readonly key: string;
  readonly name: string;
  readonly maxStack: number;
  /** Tile key this item places (as a block, or as a background wall), or null. */
  readonly placesTile: string | null;
}

const BLOCK_STACK = 999;

export const ITEMS: readonly ItemDef[] = [
  {
    id: 0,
    key: 'forest_soil',
    name: 'Forest Soil',
    maxStack: BLOCK_STACK,
    placesTile: 'forest_soil',
  },
  { id: 1, key: 'moss', name: 'Moss', maxStack: BLOCK_STACK, placesTile: 'moss' },
  { id: 2, key: 'stone', name: 'Stone', maxStack: BLOCK_STACK, placesTile: 'stone' },
  { id: 3, key: 'mud', name: 'Mud', maxStack: BLOCK_STACK, placesTile: 'mud' },
  {
    id: 4,
    key: 'elderwood_planks',
    name: 'Elderwood Planks',
    maxStack: BLOCK_STACK,
    placesTile: 'elderwood_planks',
  },
  {
    id: 5,
    key: 'lumen_crystal',
    name: 'Lumen Crystal',
    maxStack: BLOCK_STACK,
    placesTile: 'lumen_crystal',
  },
  {
    id: 6,
    key: 'moonstone_crystal',
    name: 'Moonstone Crystal',
    maxStack: BLOCK_STACK,
    placesTile: 'moonstone_crystal',
  },
  { id: 7, key: 'torch', name: 'Torch', maxStack: BLOCK_STACK, placesTile: 'torch' },
  { id: 8, key: 'peat', name: 'Peat', maxStack: BLOCK_STACK, placesTile: 'peat' },
  { id: 9, key: 'silt', name: 'Silt', maxStack: BLOCK_STACK, placesTile: 'silt' },
  { id: 10, key: 'gravel', name: 'Gravel', maxStack: BLOCK_STACK, placesTile: 'gravel' },
  { id: 11, key: 'runestone', name: 'Runestone', maxStack: BLOCK_STACK, placesTile: 'runestone' },
  {
    id: 12,
    key: 'glowcap_flesh',
    name: 'Glowcap Flesh',
    maxStack: BLOCK_STACK,
    placesTile: 'glowcap_flesh',
  },
  { id: 13, key: 'rootwood', name: 'Rootwood', maxStack: BLOCK_STACK, placesTile: 'rootwood' },
  { id: 14, key: 'ash', name: 'Ash', maxStack: BLOCK_STACK, placesTile: 'ash' },
  { id: 15, key: 'basalt', name: 'Basalt', maxStack: BLOCK_STACK, placesTile: 'basalt' },
  { id: 16, key: 'obsidian', name: 'Obsidian', maxStack: BLOCK_STACK, placesTile: 'obsidian' },
  {
    id: 17,
    key: 'copper_ore',
    name: 'Copper Ore',
    maxStack: BLOCK_STACK,
    placesTile: 'copper_ore',
  },
  { id: 18, key: 'iron_ore', name: 'Iron Ore', maxStack: BLOCK_STACK, placesTile: 'iron_ore' },
  {
    id: 19,
    key: 'moonsilver_ore',
    name: 'Moonsilver Ore',
    maxStack: BLOCK_STACK,
    placesTile: 'moonsilver_ore',
  },
  { id: 20, key: 'gold_ore', name: 'Gold Ore', maxStack: BLOCK_STACK, placesTile: 'gold_ore' },
  {
    id: 21,
    key: 'emberite_ore',
    name: 'Emberite Ore',
    maxStack: BLOCK_STACK,
    placesTile: 'emberite_ore',
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

/** What a new player starts with (until crafting exists in M6): enough to test building. */
export const STARTING_INVENTORY: readonly { item: string; count: number }[] = [
  { item: 'elderwood_planks', count: 99 },
  { item: 'stone', count: 50 },
  { item: 'torch', count: 30 },
];
