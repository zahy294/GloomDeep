import { CRAFTING, TILE_SIZE } from '../../config';
import { itemId } from '../../data/items';
import { RECIPES } from '../../data/recipes';
import { TILES } from '../../data/tiles';
import type { Body } from '../physics/tileCollision';
import type { Inventory } from '../inventory/Inventory';
import type { World } from '../world/World';

/** A recipe with its item keys resolved to ids (resolved once, so data typos fail at startup). */
export interface ResolvedRecipe {
  readonly key: string;
  readonly index: number;
  readonly output: { readonly itemId: number; readonly count: number };
  readonly inputs: readonly { readonly itemId: number; readonly count: number }[];
  readonly station: string | null;
  /** Story flag that teaches it, or null if everyone knows it. */
  readonly requires: string | null;
}

const NO_FLAGS: ReadonlySet<string> = new Set();

/** Station key per tile id, or null. */
const STATION_OF = TILES.map((t) => t.station ?? null);
const STATION_KEYS = new Set(STATION_OF.filter((s): s is string => s !== null));

export const RESOLVED_RECIPES: readonly ResolvedRecipe[] = RECIPES.map((r, index) => {
  if (r.station !== null && !STATION_KEYS.has(r.station)) {
    throw new Error(`Recipe "${r.key}" needs unknown station "${r.station}"`);
  }
  return {
    key: r.key,
    index,
    output: { itemId: itemId(r.output.item), count: r.output.count },
    inputs: r.inputs.map((i) => ({ itemId: itemId(i.item), count: i.count })),
    station: r.station,
    requires: r.requires ?? null,
  };
});

/** Is the recipe known (taught recipes need their story flag)? */
export function recipeKnown(recipe: ResolvedRecipe, flags: ReadonlySet<string>): boolean {
  return recipe.requires === null || flags.has(recipe.requires);
}

export function recipeByKey(key: string): ResolvedRecipe | undefined {
  return RESOLVED_RECIPES.find((r) => r.key === key);
}

/**
 * Collects the station keys within CRAFTING.stationReach tiles of the body's centre (tile centres
 * inside a circle). Clears and returns `out`.
 */
export function nearbyStations(world: World, body: Body, out: Set<string>): Set<string> {
  out.clear();
  const reach = CRAFTING.stationReach;
  const cx = (body.x + body.width / 2) / TILE_SIZE;
  const cy = (body.y + body.height / 2) / TILE_SIZE;
  const x0 = Math.floor(cx - reach);
  const x1 = Math.floor(cx + reach);
  const y0 = Math.floor(cy - reach);
  const y1 = Math.floor(cy + reach);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const station = STATION_OF[world.get(x, y)];
      if (!station) continue;
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      if (dx * dx + dy * dy <= reach * reach) out.add(station);
    }
  }
  return out;
}

/** How many times the recipe could be crafted from the inventory right now (ignores stations). */
export function maxCrafts(recipe: ResolvedRecipe, inventory: Inventory): number {
  let n = Infinity;
  for (const input of recipe.inputs) {
    n = Math.min(n, Math.floor(inventory.count(input.itemId) / input.count));
  }
  return n === Infinity ? 0 : n;
}

export function stationAvailable(recipe: ResolvedRecipe, stations: ReadonlySet<string>): boolean {
  return recipe.station === null || stations.has(recipe.station);
}

/**
 * Crafts the recipe up to `times` times (capped by materials and CRAFTING.maxBatch) and puts the
 * output into the inventory. Returns the output items that didn't fit (to drop at the player) and
 * how many crafts happened.
 */
export function craft(
  recipe: ResolvedRecipe,
  times: number,
  inventory: Inventory,
  stations: ReadonlySet<string>,
  flags: ReadonlySet<string> = NO_FLAGS,
): { crafted: number; overflow: number } {
  if (!stationAvailable(recipe, stations) || !recipeKnown(recipe, flags)) {
    return { crafted: 0, overflow: 0 };
  }
  const n = Math.min(Math.floor(times), CRAFTING.maxBatch, maxCrafts(recipe, inventory));
  if (!(n > 0)) return { crafted: 0, overflow: 0 };
  for (const input of recipe.inputs) inventory.remove(input.itemId, input.count * n);
  const overflow = inventory.add(recipe.output.itemId, recipe.output.count * n);
  return { crafted: n, overflow };
}
