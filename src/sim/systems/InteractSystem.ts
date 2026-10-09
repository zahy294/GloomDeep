import { BUILDING, SETTLEMENT } from '../../config';
import { DRYAD, VILLAGERS, dryadLines } from '../../data/npcs';
import type { Npc } from '../entities/Npc';
import type { Player } from '../entities/Player';
import type { EventBus, SimEvents } from '../events';
import type { ActionState } from '../input';
import type { Body } from '../physics/tileCollision';
import { doorColumn, toggleDoor } from '../world/doors';
import type { World } from '../world/World';
import type { BeaconSystem } from './BeaconSystem';
import { inReach, tileAt } from './tileTargeting';

export interface InteractState {
  /** The right button is busy with an interaction until released (no placing on that press). */
  holding: boolean;
}

export function createInteractState(): InteractState {
  return { holding: false };
}

export interface InteractContext {
  player: Player;
  input: ActionState;
  world: World;
  npcs: readonly Npc[];
  beacons: BeaconSystem;
  events: EventBus<SimEvents>;
  /** Bodies a door must not close on. */
  bodies: () => readonly Body[];
  /** Share of the forest's Gloam cleansed, 0..1 (the Dryad's lines). */
  cleansed: () => number;
  /** Tries to catch a critter at the cursor with the selected item (fireflies in jars). */
  tryCatch: (x: number, y: number) => boolean;
}

const talkPayload = { npcId: 0, key: '', name: '', role: '', text: '' };
const beaconPayload = { x: 0, y: 0, beacons: [] as { x: number; y: number }[] };

/**
 * The right button's "use" on things (plan 5 interaction): talk to whoever is under the cursor,
 * catch a firefly with a jar, open or close a door, open a beacon's travel list. An interaction
 * claims the press: nothing is placed until the button is released.
 * Returns true while the press is claimed.
 */
export function updateInteract(state: InteractState, ctx: InteractContext): boolean {
  const { input } = ctx;
  if (state.holding) {
    if (!input.isHeld('useAlt')) state.holding = false;
    return state.holding;
  }
  if (!input.consumePressed('useAlt')) return false;
  if (interact(ctx)) {
    state.holding = input.isHeld('useAlt');
    return true;
  }
  return false;
}

function interact(ctx: InteractContext): boolean {
  const { input, player, world } = ctx;
  const ax = input.aimX;
  const ay = input.aimY;
  const tx = tileAt(ax);
  const ty = tileAt(ay);
  if (!inReach(player.body, tx, ty, BUILDING.reachTiles)) return false;

  const slop = SETTLEMENT.talkSlop;
  for (const npc of ctx.npcs) {
    const b = npc.body;
    if (ax < b.x - slop || ax > b.x + b.width + slop || ay < b.y - slop || ay > b.y + b.height) {
      continue;
    }
    talk(ctx, npc);
    return true;
  }
  if (ctx.tryCatch(ax, ay)) return true;
  if (doorColumn(world, tx, ty)) {
    toggleDoor(world, tx, ty, ctx.bodies());
    return true;
  }
  const beacon = ctx.beacons.at(tx, ty);
  if (beacon) {
    beaconPayload.x = beacon.x;
    beaconPayload.y = beacon.y;
    beaconPayload.beacons = ctx.beacons.beacons.map((b) => ({ x: b.x, y: b.y }));
    ctx.events.emit('beaconMenu', beaconPayload);
    return true;
  }
  return false;
}

function talk(ctx: InteractContext, npc: Npc): void {
  const villager = VILLAGERS.find((v) => v.key === npc.key);
  const def = villager ?? DRYAD;
  const lines = villager ? villager.lines : dryadLines(ctx.cleansed());
  if (lines.length === 0) return;
  const text = lines[npc.line % lines.length] ?? '';
  npc.line++;
  const b = ctx.player.body;
  npc.facing = b.x + b.width / 2 >= npc.body.x + npc.body.width / 2 ? 1 : -1;
  talkPayload.npcId = npc.id;
  talkPayload.key = npc.key;
  talkPayload.name = def.name;
  talkPayload.role = def.role;
  talkPayload.text = text;
  ctx.events.emit('talk', talkPayload);
}
