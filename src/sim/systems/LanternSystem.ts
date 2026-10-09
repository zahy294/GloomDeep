import { FLORA_FX, LUMEN } from '../../config';
import { ITEMS } from '../../data/items';
import { lensByKey } from '../../data/lenses';
import type { Player } from '../entities/Player';
import type { EventBus, SimEvents } from '../events';
import type { ActionState } from '../input';
import type { Inventory } from '../inventory/Inventory';

/** Fuel items (ids and Lumen each), smallest first, so petals are burned before crystals. */
const FUELS = ITEMS.filter((i) => (i.fuel ?? 0) > 0)
  .map((i) => ({ id: i.id, lumen: i.fuel ?? 0 }))
  .sort((a, b) => a.lumen - b.lumen);
const NO_PAYLOAD: Record<string, never> = {};

/**
 * The lantern burns Lumen while lit (plan 1.4). `toggleLantern` switches it; at zero it goes out.
 * When there's room for a whole fuel item's worth of Lumen (`fuel` in src/data/items.ts: petals,
 * crystals), one is burned from the inventory to refill it, smallest first.
 */
export function updateLantern(
  player: Player,
  input: ActionState,
  inventory: Inventory,
  events: EventBus<SimEvents>,
  dt: number,
): void {
  if (input.consumePressed('toggleLantern')) player.lanternOn = !player.lanternOn;

  for (const fuel of FUELS) {
    if (LUMEN.max - player.lumen < fuel.lumen) break;
    if (inventory.remove(fuel.id, 1) !== 1) continue;
    player.lumen = Math.min(LUMEN.max, player.lumen + fuel.lumen);
    events.emit('inventoryChanged', NO_PAYLOAD);
    break;
  }

  if (!player.lanternOn) return;
  const fae = player.fae > 0 ? FLORA_FX.faeLanternDrain : 1;
  const drain = LUMEN.drainPerSecond * lensByKey(player.lens).drainMultiplier * fae * dt;
  player.lumen = Math.max(0, player.lumen - drain);
  if (player.lumen === 0) player.lanternOn = false;
}

/** The lantern actually gives light (lit and fuelled). */
export function lanternLit(player: Player): boolean {
  return player.lanternOn && player.lumen > 0 && !player.dead;
}
