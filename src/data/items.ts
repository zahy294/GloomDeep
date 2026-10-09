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
