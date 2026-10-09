import { HEALTH, LENS_FX } from '../../config';
import { VERDANT_GROWTH } from '../../data/flora';
import { itemId } from '../../data/items';
import { LENSES, lensByKey, type LensDef } from '../../data/lenses';
import { TILES, tileId } from '../../data/tiles';
import type { Player } from '../entities/Player';
import type { EventBus, SimEvents } from '../events';
import type { ActionState } from '../input';
import type { Inventory } from '../inventory/Inventory';
import { decorSupported } from '../world/decor';
import { AIR, type World } from '../world/World';
import { lanternLit } from './LanternSystem';
import { createCone, inCone, lanternCone, type Cone } from './lanternCone';

/** Per tile id: the tile it turns into under Azure light, or -1. */
const REVEALS = Int32Array.from(TILES, (t) => (t.veiled ? tileId(t.veiled) : -1));
/** Per tile id: the Verdant rule that applies to it, resolved to ids. */
const GROWTH = TILES.map((t) => {
  const rule = VERDANT_GROWTH.find((r) => r.on === t.key);
  if (!rule) return null;
  return {
    becomes: rule.becomes ? tileId(rule.becomes) : -1,
    sprouts: (rule.sprouts ?? []).map(tileId),
  };
});
/** Item id that unlocks each lens (-1: always owned). */
const LENS_ITEM = new Map(LENSES.map((l) => [l.key, l.item ? itemId(l.item) : -1]));

export interface LensState {
  /** Fractional Verdant picks carried over between steps. */
  picks: number;
  readonly cone: Cone;
}

export function createLensState(): LensState {
  return { picks: 0, cone: createCone() };
}

/** The lenses the player can use: Amber, plus every lens whose item is in the inventory. */
export function ownedLenses(inventory: Inventory): LensDef[] {
  if (ownedCache.version === inventory.version && ownedCache.inventory === inventory) {
    return ownedCache.lenses;
  }
  ownedCache.inventory = inventory;
  ownedCache.version = inventory.version;
  ownedCache.lenses = LENSES.filter((l) => {
    const item = LENS_ITEM.get(l.key) ?? -1;
    return item < 0 || inventory.count(item) > 0;
  });
  return ownedCache.lenses;
}

/** Re-filtered only when the inventory changes (the lens system asks every step). */
const ownedCache: { inventory: Inventory | null; version: number; lenses: LensDef[] } = {
  inventory: null,
  version: -1,
  lenses: [],
};

const revealedPayload = { x: 0, y: 0, id: 0 };

/**
 * Lens switching (Q) and what each lens's light does (plan 1.4): Amber heals, Azure reveals
 * veiled tiles, Verdant grows plants. Crimson's burn works through the GloamSystem (and against
 * shades in M8). Effects need a lit lantern and act only where the cone's light actually lands.
 */
export function updateLens(
  state: LensState,
  player: Player,
  input: ActionState,
  inventory: Inventory,
  world: World,
  events: EventBus<SimEvents>,
  random: () => number,
  dt: number,
): void {
  const owned = ownedLenses(inventory);
  let ownsActive = false;
  for (const l of owned) if (l.key === player.lens) ownsActive = true;
  if (!ownsActive) player.lens = 'amber';
  if (input.consumePressed('cycleLens') && owned.length > 1) {
    const at = owned.findIndex((l) => l.key === player.lens);
    player.lens = owned[(at + 1) % owned.length]?.key ?? 'amber';
  }
  if (!lanternLit(player)) return;
  const lens = lensByKey(player.lens);
  switch (lens.effect) {
    case 'heal':
      player.health = Math.min(HEALTH.max, player.health + LENS_FX.amberHealPerSecond * dt);
      break;
    case 'reveal':
      reveal(lanternCone(player, input, lens, state.cone), world, events);
      break;
    case 'grow':
      grow(state, lanternCone(player, input, lens, state.cone), world, random, dt);
      break;
    case 'burn':
      break;
  }
}

function brightness(world: World, i: number): number {
  return Math.max(world.lightR[i] ?? 0, world.lightG[i] ?? 0, world.lightB[i] ?? 0);
}

/** Azure true sight: veiled tiles the cone's light reaches (a few tiles into rock) show. */
function reveal(cone: Cone, world: World, events: EventBus<SimEvents>): void {
  const x0 = Math.floor(cone.x - cone.range);
  const y0 = Math.floor(cone.y - cone.range);
  const x1 = Math.floor(cone.x + cone.range);
  const y1 = Math.floor(cone.y + cone.range);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (!world.inBounds(x, y)) continue;
      const i = y * world.width + x;
      const to = REVEALS[world.fg[i] ?? AIR] ?? -1;
      if (to < 0 || brightness(world, i) < LENS_FX.revealMinLight || !inCone(cone, x, y)) {
        continue;
      }
      world.set(x, y, to);
      revealedPayload.x = x;
      revealedPayload.y = y;
      revealedPayload.id = to;
      events.emit('tileRevealed', revealedPayload);
    }
  }
}

/** Verdant: random cells of the lit cone grow one stage (grass on soil, flowers on grass...). */
function grow(state: LensState, cone: Cone, world: World, random: () => number, dt: number): void {
  state.picks += LENS_FX.conePicksPerSecond * dt;
  const halfAngle = Math.acos(cone.cosHalf);
  const baseAngle = Math.atan2(cone.dirY, cone.dirX);
  while (state.picks >= 1) {
    state.picks--;
    const dist = Math.sqrt(random()) * cone.range;
    const angle = baseAngle + (random() * 2 - 1) * halfAngle;
    const x = Math.floor(cone.x + Math.cos(angle) * dist);
    const y = Math.floor(cone.y + Math.sin(angle) * dist);
    if (random() >= LENS_FX.verdantGrowChance || !world.inBounds(x, y - 1)) continue;
    const i = y * world.width + x;
    const rule = GROWTH[world.fg[i] ?? AIR];
    if (!rule || brightness(world, i) < LENS_FX.coneMinLight) continue;
    // Growth needs open air above (and no water).
    if (world.get(x, y - 1) !== AIR || (world.liquid[i - world.width] ?? 0) > 0) continue;
    if (rule.becomes >= 0) {
      world.set(x, y, rule.becomes);
    } else if (rule.sprouts.length > 0) {
      const sprout = rule.sprouts[Math.floor(random() * rule.sprouts.length)] ?? -1;
      if (sprout >= 0 && decorSupported(world, x, y - 1, sprout)) world.set(x, y - 1, sprout);
    }
  }
}
