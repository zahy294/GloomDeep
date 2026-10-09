import { BUILDING, LIQUID } from '../../config';
import { LIQUID as KIND } from '../../data/biomes';
import { ITEMS, itemId } from '../../data/items';
import type { Player } from '../entities/Player';
import type { EventBus, SimEvents } from '../events';
import type { ActionState } from '../input';
import type { Inventory } from '../inventory/Inventory';
import type { LiquidSystem } from './LiquidSystem';
import { inReach, tileAt } from './tileTargeting';

const EMPTY = itemId('bucket');
const FULL = { [KIND.water]: itemId('water_bucket'), [KIND.lava]: itemId('lava_bucket') } as Record<
  number,
  number
>;
const BUCKET = ITEMS.map((i) => i.bucket ?? null);
const POURS = { water: KIND.water, lava: KIND.lava } as const;
const NO_PAYLOAD: Record<string, never> = {};

export interface BucketState {
  cooldown: number;
}

export function createBucketState(): BucketState {
  return { cooldown: 0 };
}

/**
 * Buckets (M9): with a bucket selected, the right button scoops a cell's liquid into an empty
 * bucket (it needs at least LIQUID.wetAmount), or pours a full bucket into an open cell in reach.
 * The bucket in the selected slot is swapped for its filled or empty form; `spill` drops what
 * doesn't fit.
 */
export function updateBuckets(
  state: BucketState,
  player: Player,
  input: ActionState,
  inventory: Inventory,
  liquids: LiquidSystem,
  events: EventBus<SimEvents>,
  spill: (item: number) => void,
  dt: number,
): void {
  state.cooldown = Math.max(0, state.cooldown - dt);
  const stack = inventory.selectedStack;
  const kind = stack ? (BUCKET[stack.itemId] ?? null) : null;
  if (!kind || !input.isHeld('useAlt') || state.cooldown > 0) return;
  const tx = tileAt(input.aimX);
  const ty = tileAt(input.aimY);
  if (!inReach(player.body, tx, ty, BUILDING.reachTiles)) return;

  let gives: number;
  if (kind === 'empty') {
    const world = liquids.world;
    if (!world.inBounds(tx, ty)) return;
    const i = world.index(tx, ty);
    // A bucket holds exactly one full cell: scoop only full cells (pouring gives back the same).
    if ((world.liquid[i] ?? 0) < LIQUID.max) return;
    const { type } = liquids.take(tx, ty);
    gives = FULL[type] ?? -1;
    if (gives < 0) return;
  } else {
    if (!liquids.pour(tx, ty, POURS[kind], LIQUID.max)) return;
    gives = EMPTY;
  }
  inventory.removeFromSlot(inventory.selected, 1);
  const left = inventory.add(gives, 1);
  if (left > 0) spill(gives);
  state.cooldown = BUILDING.bucketInterval;
  events.emit('inventoryChanged', NO_PAYLOAD);
}
