import { MINING, TILE_SIZE } from '../../config';
import { ITEMS, itemId } from '../../data/items';
import { TILES } from '../../data/tiles';
import type { Player } from '../entities/Player';
import type { EventBus, SimEvents, TileLayer } from '../events';
import type { ActionState } from '../input';
import type { Inventory } from '../inventory/Inventory';
import { AIR, type World } from '../world/World';
import { inReach, tileAt } from './tileTargeting';

const NO_TARGET = Number.MIN_SAFE_INTEGER;

/** The tile currently being mined, if any. Progress itself lives in `world.damage`. */
export interface MiningState {
  active: boolean;
  x: number;
  y: number;
  layer: TileLayer;
  stage: number;
  /** The best pickaxe carried (item id, or -1 for bare hands), its tier and power. */
  toolItem: number;
  toolTier: number;
  toolPower: number;
  /** Inventory version the tool was picked at (re-picked when the inventory changes). */
  toolVersion: number;
  /** The target that last reported `miningBlocked`, so it is reported once per attempt. */
  blockedKey: number;
}

export function createMiningState(): MiningState {
  return {
    active: false,
    x: 0,
    y: 0,
    layer: 'fg',
    stage: 0,
    toolItem: -1,
    toolTier: MINING.handTier,
    toolPower: MINING.handPower,
    toolVersion: -1,
    blockedKey: NO_TARGET,
  };
}

/**
 * Mining uses the best pickaxe anywhere in the inventory (highest tier, then power), so left click
 * always mines and the hotbar stays free for blocks; bare hands when there is none.
 */
export function pickTool(state: MiningState, inventory: Inventory): void {
  if (state.toolVersion === inventory.version) return;
  state.toolVersion = inventory.version;
  state.toolItem = -1;
  state.toolTier = MINING.handTier;
  state.toolPower = MINING.handPower;
  for (let i = 0; i < inventory.slots.length; i++) {
    const s = inventory.slots[i];
    const tool = s ? ITEMS[s.itemId]?.tool : undefined;
    if (!s || tool?.kind !== 'pickaxe') continue;
    const better =
      state.toolItem < 0 ||
      tool.tier > state.toolTier ||
      (tool.tier === state.toolTier && tool.power > state.toolPower);
    if (!better) continue;
    state.toolItem = s.itemId;
    state.toolTier = tool.tier;
    state.toolPower = tool.power;
  }
}

/** Spawns an item drop centred on a pixel position (provided by the Simulation). */
export type SpawnDrop = (itemId: number, count: number, x: number, y: number) => void;

/** Item id dropped by each tile id, or -1. Resolved once so typos in tile data fail at startup. */
const DROP_ITEM = TILES.map((t) => (t.drop ? itemId(t.drop) : -1));
const TIER = TILES.map((t) => t.tier ?? 0);
/** Tiles that stand on the block below them (stations): that block can't be mined from under them. */
const NEEDS_GROUND = Uint8Array.from(TILES, (t) => (t.needsGround ? 1 : 0));
const CHOPPABLE = Uint8Array.from(TILES, (t) => (t.choppable ? 1 : 0));

/** Damage-map key: background walls live in the same map under negative keys. */
function damageKey(world: World, layer: TileLayer, x: number, y: number): number {
  const i = world.index(x, y);
  return layer === 'fg' ? i : -(i + 1);
}

/** Summing dt/hardness every step drifts just below 1 (e.g. 54 × (1/60)/0.9); absorb that. */
const PROGRESS_EPSILON = 1e-9;

const damagedPayload = { x: 0, y: 0, layer: 'fg' as TileLayer, stage: 0 };
const blockedPayload = { x: 0, y: 0, layer: 'fg' as TileLayer, tier: 0, reason: 'tier' as const };
const supportingPayload = {
  x: 0,
  y: 0,
  layer: 'fg' as TileLayer,
  tier: 0,
  reason: 'support' as const,
};
const brokenPayload = { x: 0, y: 0, id: 0, layer: 'fg' as TileLayer };

function emitDamaged(events: EventBus<SimEvents>, s: MiningState): void {
  damagedPayload.x = s.x;
  damagedPayload.y = s.y;
  damagedPayload.layer = s.layer;
  damagedPayload.stage = s.stage;
  events.emit('tileDamaged', damagedPayload);
}

/** Forgets progress on the current target (releasing the button or switching tiles resets it). */
function stopMining(state: MiningState, world: World, events: EventBus<SimEvents>): void {
  if (!state.active) return;
  world.damage.delete(damageKey(world, state.layer, state.x, state.y));
  state.active = false;
  if (state.stage !== 0) {
    state.stage = 0;
    emitDamaged(events, state);
  }
}

/**
 * Holding `useItem` mines the tile under the cursor (or, with `wallMode`, the background wall —
 * only where no block covers it). Progress = tool power × time / hardness; at 1 the tile breaks
 * and drops its item. Tiles above the tool's tier don't crack at all (`miningBlocked`).
 */
export function updateMining(
  state: MiningState,
  player: Player,
  input: ActionState,
  inventory: Inventory,
  world: World,
  events: EventBus<SimEvents>,
  spawnDrop: SpawnDrop,
  dt: number,
): void {
  if (!input.isHeld('useItem')) {
    stopMining(state, world, events);
    state.blockedKey = NO_TARGET;
    return;
  }
  pickTool(state, inventory);

  const tx = tileAt(input.aimX);
  const ty = tileAt(input.aimY);
  const chop = world.get(tx, ty) === AIR && CHOPPABLE[world.getBg(tx, ty)] === 1;
  const layer: TileLayer = input.isHeld('wallMode') || chop ? 'bg' : 'fg';
  const id = world.getLayer(layer, tx, ty);
  const blockedByForeground = layer === 'bg' && world.get(tx, ty) !== AIR;
  if (
    id === AIR ||
    blockedByForeground ||
    !world.inBounds(tx, ty) ||
    !inReach(player.body, tx, ty, MINING.reachTiles)
  ) {
    stopMining(state, world, events);
    return;
  }

  if (!state.active || state.x !== tx || state.y !== ty || state.layer !== layer) {
    stopMining(state, world, events);
    state.active = true;
    state.x = tx;
    state.y = ty;
    state.layer = layer;
  }

  const tile = TILES[id];
  const key = damageKey(world, layer, tx, ty);
  const holdsStation = layer === 'fg' && NEEDS_GROUND[world.get(tx, ty - 1)] === 1;
  if ((TIER[id] ?? 0) > state.toolTier || holdsStation) {
    if (state.blockedKey !== key) {
      state.blockedKey = key;
      const p = holdsStation ? supportingPayload : blockedPayload;
      p.x = tx;
      p.y = ty;
      p.layer = layer;
      p.tier = TIER[id] ?? 0;
      events.emit('miningBlocked', p);
    }
    stopMining(state, world, events);
    return;
  }
  const hardness = tile && tile.hardness > 0 ? tile.hardness : 0;
  const progress =
    hardness === 0 ? 1 : (world.damage.get(key) ?? 0) + (state.toolPower * dt) / hardness;

  if (progress >= 1 - PROGRESS_EPSILON) {
    world.damage.delete(key);
    state.active = false;
    state.stage = 0;
    emitDamaged(events, state); // clears the crack overlay
    world.setLayer(layer, tx, ty, AIR);
    brokenPayload.x = tx;
    brokenPayload.y = ty;
    brokenPayload.id = id;
    brokenPayload.layer = layer;
    events.emit('tileBroken', brokenPayload);
    const drop = DROP_ITEM[id] ?? -1;
    if (drop >= 0) spawnDrop(drop, 1, (tx + 0.5) * TILE_SIZE, (ty + 0.5) * TILE_SIZE);
    return;
  }

  world.damage.set(key, progress);
  const stage = Math.min(MINING.crackStages, 1 + Math.floor(progress * MINING.crackStages));
  if (stage !== state.stage) {
    state.stage = stage;
    emitDamaged(events, state);
  }
}
