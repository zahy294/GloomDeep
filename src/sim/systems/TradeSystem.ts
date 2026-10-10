import { TRADE } from '../../config';
import { ITEMS, itemId } from '../../data/items';
import { SELL_VALUE, shopFor, type ShopOffer } from '../../data/shops';
import type { Inventory } from '../inventory/Inventory';

const GLIMMER = itemId('glimmer');

/**
 * Trade (plan 3.4 TradeSystem; plan 1.7 "a town's light level is its health: it decides ... how
 * good its trades are", "once you light a road ... trade prices improve"). Prices are SHOPS base
 * prices times a factor: up to TRADE.darkMarkup more in a dark town, TRADE.roadDiscount less per
 * lit road into it, never below TRADE.minFactor. Paid in glimmer.
 */
export function priceFactor(townLight: number, litRoads: number): number {
  const light = Math.min(1, Math.max(0, townLight));
  const f = 1 + TRADE.darkMarkup * (1 - light) - TRADE.roadDiscount * litRoads;
  return Math.max(TRADE.minFactor, f);
}

export function buyPrice(offer: ShopOffer, factor: number): number {
  return Math.max(1, Math.round(offer.price * factor));
}

/** Glimmer a trader pays for `count` of an item (0 if they don't want it). */
export function sellPrice(item: number, count: number, factor: number): number {
  const value = SELL_VALUE[ITEMS[item]?.key ?? ''] ?? 0;
  return Math.floor((value * count * TRADE.sellShare) / factor);
}

/** The offers on sale now, with their index in the shop's list. */
export function openOffers(npc: string, festival: boolean): { offer: ShopOffer; index: number }[] {
  const shop = shopFor(npc);
  if (!shop) return [];
  return shop.offers
    .map((offer, index) => ({ offer, index }))
    .filter(({ offer }) => !offer.festival || festival);
}

/** Buys one lot of an offer. False if it isn't on sale or the player can't pay. */
export function buy(
  npc: string,
  index: number,
  festival: boolean,
  factor: number,
  inventory: Inventory,
  drop: (item: number, count: number) => void,
): boolean {
  const open = openOffers(npc, festival).find((o) => o.index === index);
  if (!open) return false;
  const price = buyPrice(open.offer, factor);
  if (inventory.count(GLIMMER) < price) return false;
  inventory.remove(GLIMMER, price);
  const id = itemId(open.offer.item);
  const left = inventory.add(id, open.offer.count);
  if (left > 0) drop(id, left);
  return true;
}

/** Sells up to `count` of an item the player carries; returns the glimmer received. */
export function sell(
  npc: string,
  item: number,
  count: number,
  factor: number,
  inventory: Inventory,
  drop: (item: number, count: number) => void,
): number {
  if (!shopFor(npc)?.buys || item === GLIMMER) return 0;
  const n = Math.min(count, inventory.count(item));
  const paid = sellPrice(item, n, factor);
  if (n <= 0 || paid <= 0) return 0;
  inventory.remove(item, n);
  const left = inventory.add(GLIMMER, paid);
  if (left > 0) drop(GLIMMER, left);
  return paid;
}
