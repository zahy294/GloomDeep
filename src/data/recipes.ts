/**
 * Crafting recipes (plan 3.4 CraftingSystem). `station` is a tile's `station` key
 * (src/data/tiles.ts): the recipe works while the player stands within CRAFTING.stationReach of
 * one. null = crafted by hand anywhere. Order here is the order the crafting screen lists them.
 */
import type { ItemCount } from './items';

export interface RecipeDef {
  readonly key: string;
  readonly output: ItemCount;
  readonly inputs: readonly ItemCount[];
  readonly station: string | null;
}

export const RECIPES: readonly RecipeDef[] = [
  // By hand: wood and the first station.
  {
    key: 'planks_from_living_wood',
    output: { item: 'elderwood_planks', count: 4 },
    inputs: [{ item: 'living_wood', count: 1 }],
    station: null,
  },
  {
    key: 'planks_from_rootwood',
    output: { item: 'elderwood_planks', count: 2 },
    inputs: [{ item: 'rootwood', count: 1 }],
    station: null,
  },
  {
    key: 'torch',
    output: { item: 'torch', count: 3 },
    inputs: [{ item: 'elderwood_planks', count: 1 }],
    station: null,
  },
  {
    key: 'workbench',
    output: { item: 'workbench', count: 1 },
    inputs: [{ item: 'elderwood_planks', count: 10 }],
    station: null,
  },
  // Workbench.
  {
    key: 'elderwood_pickaxe',
    output: { item: 'elderwood_pickaxe', count: 1 },
    inputs: [{ item: 'elderwood_planks', count: 8 }],
    station: 'workbench',
  },
  {
    key: 'furnace',
    output: { item: 'furnace', count: 1 },
    inputs: [
      { item: 'stone', count: 20 },
      { item: 'elderwood_planks', count: 4 },
      { item: 'torch', count: 3 },
    ],
    station: 'workbench',
  },
  {
    key: 'anvil',
    output: { item: 'anvil', count: 1 },
    inputs: [{ item: 'copper_bar', count: 6 }],
    station: 'workbench',
  },
  // Furnace.
  {
    key: 'copper_bar',
    output: { item: 'copper_bar', count: 1 },
    inputs: [{ item: 'copper_ore', count: 2 }],
    station: 'furnace',
  },
  {
    key: 'iron_bar',
    output: { item: 'iron_bar', count: 1 },
    inputs: [{ item: 'iron_ore', count: 2 }],
    station: 'furnace',
  },
  {
    key: 'moonsilver_bar',
    output: { item: 'moonsilver_bar', count: 1 },
    inputs: [{ item: 'moonsilver_ore', count: 2 }],
    station: 'furnace',
  },
  {
    key: 'gold_bar',
    output: { item: 'gold_bar', count: 1 },
    inputs: [{ item: 'gold_ore', count: 2 }],
    station: 'furnace',
  },
  // Anvil.
  {
    key: 'copper_pickaxe',
    output: { item: 'copper_pickaxe', count: 1 },
    inputs: [
      { item: 'copper_bar', count: 8 },
      { item: 'elderwood_planks', count: 3 },
    ],
    station: 'anvil',
  },
  {
    key: 'iron_pickaxe',
    output: { item: 'iron_pickaxe', count: 1 },
    inputs: [
      { item: 'iron_bar', count: 10 },
      { item: 'elderwood_planks', count: 3 },
    ],
    station: 'anvil',
  },
  {
    key: 'moonsilver_pickaxe',
    output: { item: 'moonsilver_pickaxe', count: 1 },
    inputs: [
      { item: 'moonsilver_bar', count: 12 },
      { item: 'iron_bar', count: 4 },
    ],
    station: 'anvil',
  },
  // Weapons (M8).
  {
    key: 'elderwood_sword',
    output: { item: 'elderwood_sword', count: 1 },
    inputs: [{ item: 'elderwood_planks', count: 7 }],
    station: 'workbench',
  },
  {
    key: 'elderwood_bow',
    output: { item: 'elderwood_bow', count: 1 },
    inputs: [
      { item: 'elderwood_planks', count: 10 },
      { item: 'moss', count: 2 },
    ],
    station: 'workbench',
  },
  {
    key: 'wooden_arrow',
    output: { item: 'wooden_arrow', count: 10 },
    inputs: [
      { item: 'elderwood_planks', count: 1 },
      { item: 'stone', count: 1 },
    ],
    station: 'workbench',
  },
  {
    key: 'copper_sword',
    output: { item: 'copper_sword', count: 1 },
    inputs: [{ item: 'copper_bar', count: 7 }],
    station: 'anvil',
  },
  {
    key: 'iron_sword',
    output: { item: 'iron_sword', count: 1 },
    inputs: [{ item: 'iron_bar', count: 8 }],
    station: 'anvil',
  },
  {
    key: 'lumen_staff',
    output: { item: 'lumen_staff', count: 1 },
    inputs: [
      { item: 'lumen_crystal', count: 5 },
      { item: 'iron_bar', count: 4 },
    ],
    station: 'anvil',
  },
  {
    key: 'bucket',
    output: { item: 'bucket', count: 1 },
    inputs: [{ item: 'iron_bar', count: 3 }],
    station: 'anvil',
  },
  // Lenses (plan 1.4: each from a different place) and flares.
  {
    key: 'verdant_lens',
    output: { item: 'verdant_lens', count: 1 },
    inputs: [
      { item: 'glowcap_flesh', count: 10 },
      { item: 'moss', count: 10 },
      { item: 'copper_bar', count: 3 },
    ],
    station: 'anvil',
  },
  {
    key: 'azure_lens',
    output: { item: 'azure_lens', count: 1 },
    inputs: [
      { item: 'moonstone_crystal', count: 6 },
      { item: 'iron_bar', count: 3 },
    ],
    station: 'anvil',
  },
  {
    key: 'crimson_lens',
    output: { item: 'crimson_lens', count: 1 },
    inputs: [
      { item: 'gold_bar', count: 4 },
      { item: 'lumen_crystal', count: 2 },
    ],
    station: 'anvil',
  },
  {
    key: 'flare',
    output: { item: 'flare', count: 4 },
    inputs: [
      { item: 'torch', count: 2 },
      { item: 'lumen_crystal', count: 1 },
    ],
    station: 'workbench',
  },
];
