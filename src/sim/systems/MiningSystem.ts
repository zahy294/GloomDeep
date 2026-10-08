import { MINING, TILE_SIZE } from '../../config';
import { itemId } from '../../data/items';
import { TILES } from '../../data/tiles';
import type { Player } from '../entities/Player';
import type { EventBus, SimEvents, TileLayer } from '../events';
import type { ActionState } from '../input';
import { AIR, type World } from '../world/World';
import { inReach, tileAt } from './tileTargeting';

/** The tile currently being mined, if any. Progress itself lives in `world.damage`. */
export interface MiningState {
  active: boolean;
  x: number;
  y: number;
  layer: TileLayer;
  stage: number;
}

export function createMiningState(): MiningState {
  return { active: false, x: 0, y: 0, layer: 'fg', stage: 0 };
}

/** Spawns an item drop centred on a pixel position (provided by the Simulation). */
export type SpawnDrop = (itemId: number, count: number, x: number, y: number) => void;

/** Item id dropped by each tile id, or -1. Resolved once so typos in tile data fail at startup. */
const DROP_ITEM = TILES.map((t) => (t.drop ? itemId(t.drop) : -1));

/** Damage-map key: background walls live in the same map under negative keys. */
function damageKey(world: World, layer: TileLayer, x: number, y: number): number {
  const i = world.index(x, y);
  return layer === 'fg' ? i : -(i + 1);
}

/** Summing dt/hardness every step drifts just below 1 (e.g. 54 × (1/60)/0.9); absorb that. */
const PROGRESS_EPSILON = 1e-9;

const damagedPayload = { x: 0, y: 0, layer: 'fg' as TileLayer, stage: 0 };
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
 * only where no block covers it). Progress = basePower × time / hardness; at 1 the tile breaks
 * and drops its item.
 */
export function updateMining(
  state: MiningState,
  player: Player,
  input: ActionState,
  world: World,
  events: EventBus<SimEvents>,
  spawnDrop: SpawnDrop,
  dt: number,
): void {
  if (!input.isHeld('useItem')) {
    stopMining(state, world, events);
    return;
  }

  const tx = tileAt(input.aimX);
  const ty = tileAt(input.aimY);
  const layer: TileLayer = input.isHeld('wallMode') ? 'bg' : 'fg';
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
  const hardness = tile && tile.hardness > 0 ? tile.hardness : 0;
  const progress =
    hardness === 0 ? 1 : (world.damage.get(key) ?? 0) + (MINING.basePower * dt) / hardness;

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
