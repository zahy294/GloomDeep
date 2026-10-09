import { decorSupported, isDecor } from '../world/decor';
import { BUILDING } from '../../config';
import { ITEMS } from '../../data/items';
import { TILES, tileId } from '../../data/tiles';
import type { Player } from '../entities/Player';
import type { EventBus, SimEvents, TileLayer } from '../events';
import type { ActionState } from '../input';
import type { Inventory } from '../inventory/Inventory';
import { AIR, type World } from '../world/World';
import { inReach, overlapsBody, tileAt } from './tileTargeting';

export interface BuildingState {
  /** Seconds until the next placement is allowed while the button stays held. */
  cooldown: number;
}

export function createBuildingState(): BuildingState {
  return { cooldown: 0 };
}

/** Tile id each item places, or -1. Resolved once so data typos fail at startup. */
const PLACES_TILE = ITEMS.map((i) => (i.placesTile ? tileId(i.placesTile) : -1));
/** Only solid blocks make background walls (no torch walls). */
const WALLABLE = Uint8Array.from(TILES, (t) => (t.solid ? 1 : 0));

const NEIGHBOURS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

/** Tiles that must stand on a block or platform (stations), and the tiles that count as ground. */
const NEEDS_GROUND = Uint8Array.from(TILES, (t) => (t.needsGround ? 1 : 0));
const GROUND = Uint8Array.from(TILES, (t) => (t.solid || t.platform ? 1 : 0));

/** Per id: foreground tiles a new block can be built against (not flowers, vines or waterfalls). */
const HOLDS = Uint8Array.from(TILES, (t) => (t.id !== AIR && !t.decor && !t.waterfall ? 1 : 0));

/**
 * Placement rule: a tile must touch something — a neighbouring block or wall, or (for a block)
 * a wall behind it. Nothing floats in mid-air.
 */
export function hasSupport(world: World, layer: TileLayer, x: number, y: number, id = -1): boolean {
  // Decorations need their own anchor (ground under a flower, a ceiling over a vine).
  if (layer === 'fg' && isDecor(id)) return decorSupported(world, x, y, id);
  if (layer === 'fg' && NEEDS_GROUND[id] === 1) return GROUND[world.get(x, y + 1)] === 1;
  if (layer === 'fg' && world.getBg(x, y) !== AIR) return true;
  for (const [dx, dy] of NEIGHBOURS) {
    if (HOLDS[world.get(x + dx, y + dy)] === 1 || world.getBg(x + dx, y + dy) !== AIR) return true;
  }
  return false;
}

const INTANGIBLE = Uint8Array.from(TILES, (t) => (t.intangible ? 1 : 0));

/**
 * Empty cells, decorations in the foreground (a block placed on grass replaces the tuft) and
 * veiled spirit platforms (unseen, so the cell looks empty).
 */
function replaceable(existing: number, layer: TileLayer): boolean {
  return existing === AIR || (layer === 'fg' && (isDecor(existing) || INTANGIBLE[existing] === 1));
}

const placedPayload = { x: 0, y: 0, id: 0, layer: 'fg' as TileLayer };
const NO_PAYLOAD: Record<string, never> = {};

/** Holding `useAlt` places the selected block (or, with `wallMode`, a background wall). */
export function updateBuilding(
  state: BuildingState,
  player: Player,
  input: ActionState,
  inventory: Inventory,
  world: World,
  events: EventBus<SimEvents>,
  dt: number,
): void {
  state.cooldown = Math.max(0, state.cooldown - dt);
  if (!input.isHeld('useAlt') || state.cooldown > 0) return;

  const stack = inventory.selectedStack;
  const id = stack ? (PLACES_TILE[stack.itemId] ?? -1) : -1;
  if (id < 0) return;

  const tx = tileAt(input.aimX);
  const ty = tileAt(input.aimY);
  const layer: TileLayer = input.isHeld('wallMode') ? 'bg' : 'fg';
  if (
    !world.inBounds(tx, ty) ||
    !replaceable(world.getLayer(layer, tx, ty), layer) ||
    (layer === 'bg' && WALLABLE[id] !== 1) ||
    !inReach(player.body, tx, ty, BUILDING.reachTiles) ||
    (layer === 'fg' && overlapsBody(player.body, tx, ty)) ||
    !hasSupport(world, layer, tx, ty, id)
  ) {
    return;
  }

  world.setLayer(layer, tx, ty, id);
  inventory.removeFromSlot(inventory.selected, 1);
  state.cooldown = BUILDING.placeInterval;
  placedPayload.x = tx;
  placedPayload.y = ty;
  placedPayload.id = id;
  placedPayload.layer = layer;
  events.emit('tilePlaced', placedPayload);
  events.emit('inventoryChanged', NO_PAYLOAD);
}
