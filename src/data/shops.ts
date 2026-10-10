/**
 * Shops (plan 3.4 TradeSystem): what each trader sells, for how much glimmer, and what goods are
 * worth when you sell them. Prices move with the town's light and its lit roads (TRADE in config).
 */

export interface ShopOffer {
  readonly item: string;
  /** Items per purchase. */
  readonly count: number;
  /** Base price in glimmer. */
  readonly price: number;
  /** Only on sale during the town's festival. */
  readonly festival?: true;
}

export interface ShopDef {
  /** Folk key of the trader. */
  readonly npc: string;
  readonly offers: readonly ShopOffer[];
  /** They buy anything with a value in SELL_VALUE. */
  readonly buys: boolean;
}

export const SHOPS: readonly ShopDef[] = [
  // Your village.
  {
    npc: 'tinker',
    buys: true,
    offers: [
      { item: 'copper_pickaxe', count: 1, price: 60 },
      { item: 'iron_pickaxe', count: 1, price: 150 },
      { item: 'wooden_arrow', count: 25, price: 10 },
      { item: 'bucket', count: 1, price: 30 },
    ],
  },
  {
    npc: 'herbalist',
    buys: true,
    offers: [
      { item: 'lumen_petal', count: 3, price: 12 },
      { item: 'flare', count: 3, price: 15 },
    ],
  },
  {
    npc: 'glassblower',
    buys: true,
    offers: [
      { item: 'glass_jar', count: 2, price: 8 },
      { item: 'firefly_jar', count: 1, price: 15 },
      { item: 'azure_lens', count: 1, price: 220 },
    ],
  },
  // Canopyhold.
  {
    npc: 'merchant',
    buys: true,
    offers: [
      { item: 'torch', count: 10, price: 8 },
      { item: 'elderwood_planks', count: 20, price: 10 },
      { item: 'glass_jar', count: 2, price: 10 },
      { item: 'wooden_arrow', count: 25, price: 12 },
      { item: 'flare', count: 3, price: 18 },
      { item: 'lumen_crystal', count: 1, price: 25 },
      { item: 'firefly_jar', count: 3, price: 20, festival: true },
      { item: 'hanging_lantern', count: 4, price: 20, festival: true },
    ],
  },
  {
    npc: 'lampwright',
    buys: true,
    offers: [
      { item: 'torch', count: 10, price: 8 },
      { item: 'firefly_jar', count: 1, price: 18 },
      { item: 'hanging_lantern', count: 1, price: 16 },
      { item: 'lumen_petal', count: 4, price: 15 },
    ],
  },
  // The Rootdeep Citadel.
  {
    npc: 'smith',
    buys: true,
    offers: [
      { item: 'carved_brick', count: 20, price: 12 },
      { item: 'iron_sword', count: 1, price: 120 },
      { item: 'moonsilver_pickaxe', count: 1, price: 400 },
      { item: 'crimson_lens', count: 1, price: 260 },
    ],
  },
];

/** Glimmer per item when sold to a trader (before the town's price factor). */
export const SELL_VALUE: Readonly<Record<string, number>> = {
  living_wood: 1,
  rootwood: 1,
  elderwood_planks: 0.5,
  stone: 0.25,
  peat: 1,
  glowcap_flesh: 2,
  moss: 1,
  copper_ore: 2,
  iron_ore: 3,
  gold_ore: 6,
  moonsilver_ore: 8,
  emberite_ore: 10,
  copper_bar: 6,
  iron_bar: 9,
  gold_bar: 20,
  moonsilver_bar: 24,
  lumen_crystal: 10,
  moonstone_crystal: 8,
  lumen_petal: 3,
  obsidian: 4,
  firefly_jar: 6,
  torch: 0.5,
};

export function shopFor(npc: string): ShopDef | undefined {
  return SHOPS.find((s) => s.npc === npc);
}
