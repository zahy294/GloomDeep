import { BOSSES, bossFlag } from '../data/bosses';
import { ITEMS } from '../data/items';
import { TILES } from '../data/tiles';
import { RESOLVED_RECIPES, type ResolvedRecipe } from '../sim/systems/CraftingSystem';
import type { StackView } from './bridge';

/** Display name per station key (from the station's tile). */
const STATION_NAMES = new Map(
  TILES.flatMap((t) => (t.station ? [[t.station, t.name] as const] : [])),
);

export function stationName(key: string): string {
  return STATION_NAMES.get(key) ?? key;
}

export interface RecipeRow {
  recipe: ResolvedRecipe;
  name: string;
  /** Per input: how many the bag holds. */
  have: readonly number[];
  /** How many times it can be crafted from the bag (0 = missing materials). */
  craftable: number;
  /** The station it needs is in reach (or it needs none). */
  stationOk: boolean;
}

/** Item counts by id from an inventory snapshot. */
export function countItems(slots: readonly (StackView | null)[]): Map<number, number> {
  const counts = new Map<number, number>();
  for (const s of slots) if (s) counts.set(s.itemId, (counts.get(s.itemId) ?? 0) + s.count);
  return counts;
}

/**
 * Recipes for the crafting screen (plan 5: "recipes filtered by nearby stations, with a search
 * box"). Only recipes whose station is in reach, unless `showAll`; filtered by `query` against the
 * output's name; craftable ones first, then data order.
 */
export function recipeRows(
  slots: readonly (StackView | null)[],
  stations: readonly string[],
  query: string,
  showAll: boolean,
  lockedRecipes: readonly string[] = [],
): RecipeRow[] {
  const locked = new Set(lockedRecipes);
  const counts = countItems(slots);
  const near = new Set(stations);
  const q = query.trim().toLowerCase();
  const rows: RecipeRow[] = [];
  for (const recipe of RESOLVED_RECIPES) {
    // Recipes folk haven't taught yet stay hidden, even under "All".
    if (locked.has(recipe.key)) continue;
    const stationOk = recipe.station === null || near.has(recipe.station);
    if (!stationOk && !showAll) continue;
    const name = ITEMS[recipe.output.itemId]?.name ?? '?';
    if (q && !name.toLowerCase().includes(q)) continue;
    const have = recipe.inputs.map((i) => counts.get(i.itemId) ?? 0);
    let craftable = Infinity;
    recipe.inputs.forEach((input, k) => {
      craftable = Math.min(craftable, Math.floor((have[k] ?? 0) / input.count));
    });
    rows.push({
      recipe,
      name,
      have,
      craftable: stationOk && craftable !== Infinity ? craftable : 0,
      stationOk,
    });
  }
  // Stable: Array.prototype.sort keeps data order within each group.
  return rows.sort((a, b) => Number(b.craftable > 0) - Number(a.craftable > 0));
}

/** Tooltip lines for an item (plan 5: "tooltips with stats"). */
export function itemTooltip(itemId: number): string[] {
  const item = ITEMS[itemId];
  if (!item) return ['Unknown item'];
  const lines = [item.name];
  if (item.tool) {
    lines.push(`Pickaxe · tier ${item.tool.tier} · power ${item.tool.power}`);
  }
  if (item.placesTile) {
    const tile = TILES.find((t) => t.key === item.placesTile);
    if (tile?.station) lines.push('Crafting station · right-click to place');
    else if (tile?.light) lines.push('Light source · right-click to place');
    else lines.push('Block · right-click to place (Shift: wall)');
  } else if (item.category === 'material') {
    lines.push('Material');
  }
  if (item.description) lines.push(item.description);
  return lines;
}

/** "a Copper Pickaxe" / "an Elderwood Pickaxe". */
export function withArticle(name: string): string {
  return `${/^[aeiou]/i.test(name) ? 'an' : 'a'} ${name}`;
}

/** Why a ward won't break (M12): the boss whose fall opens it. */
export function sealedText(flag: string): string {
  const boss = BOSSES.find((b) => bossFlag(b.key) === flag);
  return boss ? `The ward holds while ${boss.name} lives` : 'Something holds this fast';
}

/** Name of the weakest pickaxe that mines a tier (for "Needs a ..." notices). */
export function pickaxeForTier(tier: number): string | null {
  let best: (typeof ITEMS)[number] | null = null;
  for (const item of ITEMS) {
    const tool = item.tool;
    if (!tool || tool.tier < tier) continue;
    if (!best?.tool || tool.tier < best.tool.tier) best = item;
  }
  return best?.name ?? null;
}
