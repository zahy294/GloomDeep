import { BUILDING, SETTLEMENT } from '../../config';
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
  /** Talks to someone: quests first, then their lines (the Simulation emits `talk`). */
  talk: (npc: Npc) => void;
  /** Uses a town fixture at a tile: a street lamp, a lift post, a dormant beacon (M11). */
  useTile: (x: number, y: number) => boolean;
  /** Tries to catch a critter at the cursor with the selected item (fireflies in jars). */
  tryCatch: (x: number, y: number) => boolean;
}

const beaconPayload = { x: 0, y: 0, beacons: [] as { x: number; y: number }[] };

/**
 * The right button's "use" on things (plan 5 interaction): talk to whoever is under the cursor,
 * catch a firefly with a jar, open or close a door, refuel a lamp, ride a lift, relight a dormant
 * beacon, open a beacon's travel list. An interaction
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
    const pb = player.body;
    npc.facing = pb.x + pb.width / 2 >= b.x + b.width / 2 ? 1 : -1;
    ctx.talk(npc);
    return true;
  }
  if (ctx.tryCatch(ax, ay)) return true;
  if (doorColumn(world, tx, ty)) {
    toggleDoor(world, tx, ty, ctx.bodies());
    return true;
  }
  if (ctx.useTile(tx, ty)) return true;
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
