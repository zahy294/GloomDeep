import { FLARE } from '../../config';
import { ITEMS } from '../../data/items';
import { createFlare, type Flare } from '../entities/Flare';
import type { Player } from '../entities/Player';
import type { EventBus, SimEvents } from '../events';
import type { ActionState } from '../input';
import type { Inventory } from '../inventory/Inventory';
import { createCollisionResult, moveAndCollide } from '../physics/tileCollision';
import type { World } from '../world/World';
import { LANTERN_HAND } from './lanternCone';

export interface FlareState {
  /** Seconds until another flare may be thrown while the button stays held. */
  cooldown: number;
}

export function createFlareState(): FlareState {
  return { cooldown: 0 };
}

const THROWS = Uint8Array.from(ITEMS, (i) => (i.throws === 'flare' ? 1 : 0));
const collision = createCollisionResult();
const thrownPayload = { x: 0, y: 0 };
const NO_PAYLOAD: Record<string, never> = {};

/**
 * Flares (plan M7): the secondary button with a flare selected throws one towards the cursor.
 * Flares fall, bounce off tiles, slide to a stop and burn for FLARE.lifeSeconds; their light goes
 * into the light grid (LightSystem), so they also push the Gloam back. Not saved: they burn out.
 */
export function updateFlares(
  state: FlareState,
  flares: Flare[],
  player: Player,
  input: ActionState,
  inventory: Inventory,
  world: World,
  events: EventBus<SimEvents>,
  dt: number,
): void {
  state.cooldown = Math.max(0, state.cooldown - dt);
  const selected = inventory.selectedStack;
  if (input.isHeld('useAlt') && state.cooldown === 0 && selected && THROWS[selected.itemId] === 1) {
    const b = player.body;
    const x = b.x + b.width / 2 + LANTERN_HAND.x * player.facing;
    const y = b.y + b.height + LANTERN_HAND.y;
    const dx = input.aimX - x;
    const dy = input.aimY - y;
    const length = Math.hypot(dx, dy) || 1;
    flares.push(createFlare(x, y, dx / length, dy / length));
    inventory.removeFromSlot(inventory.selected, 1);
    state.cooldown = FLARE.throwInterval;
    thrownPayload.x = x;
    thrownPayload.y = y;
    events.emit('flareThrown', thrownPayload);
    events.emit('inventoryChanged', NO_PAYLOAD);
  }

  for (let i = flares.length - 1; i >= 0; i--) {
    const flare = flares[i];
    if (!flare) continue;
    flare.age += dt;
    if (flare.age >= FLARE.lifeSeconds) {
      flares[i] = flares[flares.length - 1] ?? flare;
      flares.pop();
      continue;
    }
    const b = flare.body;
    flare.prevX = b.x;
    flare.prevY = b.y;
    b.vy = Math.min(b.vy + FLARE.gravity * dt, FLARE.maxFallSpeed);
    const vx = b.vx;
    const vy = b.vy;
    moveAndCollide(world, b, dt, collision);
    if (collision.hitWallLeft || collision.hitWallRight) b.vx = -vx * FLARE.bounce;
    if (collision.hitCeiling) b.vy = -vy * FLARE.bounce;
    if (collision.onGround) {
      b.vy = vy > FLARE.gravity * dt * 2 ? -vy * FLARE.bounce : 0;
      const slow = FLARE.groundFriction * dt;
      b.vx = Math.abs(b.vx) <= slow ? 0 : b.vx - Math.sign(b.vx) * slow;
    }
  }
}
