import { LUMEN } from '../../config';
import { itemId } from '../../data/items';
import { lensByKey } from '../../data/lenses';
import type { Player } from '../entities/Player';
import type { EventBus, SimEvents } from '../events';
import type { ActionState } from '../input';
import type { Inventory } from '../inventory/Inventory';

const LUMEN_CRYSTAL = itemId('lumen_crystal');
const NO_PAYLOAD: Record<string, never> = {};

/**
 * The lantern burns Lumen while lit (plan 1.4). `toggleLantern` switches it; at zero it goes out.
 * When there's room for a full crystal's worth, a Lumen Crystal from the inventory is burned to
 * refill it (simplest refuelling until crafting/recipes exist; logged in PROGRESS.md).
 */
export function updateLantern(
  player: Player,
  input: ActionState,
  inventory: Inventory,
  events: EventBus<SimEvents>,
  dt: number,
): void {
  if (input.consumePressed('toggleLantern')) player.lanternOn = !player.lanternOn;

  if (LUMEN.max - player.lumen >= LUMEN.perCrystal) {
    const slot = inventory.slots.findIndex((s) => s?.itemId === LUMEN_CRYSTAL);
    if (slot >= 0 && inventory.removeFromSlot(slot, 1) === 1) {
      player.lumen = Math.min(LUMEN.max, player.lumen + LUMEN.perCrystal);
      events.emit('inventoryChanged', NO_PAYLOAD);
    }
  }

  if (!player.lanternOn) return;
  const drain = LUMEN.drainPerSecond * lensByKey(player.lens).drainMultiplier * dt;
  player.lumen = Math.max(0, player.lumen - drain);
  if (player.lumen === 0) player.lanternOn = false;
}

/** The lantern actually gives light (lit and fuelled). */
export function lanternLit(player: Player): boolean {
  return player.lanternOn && player.lumen > 0;
}
