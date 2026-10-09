import { ITEM_DROP } from '../../config';
import type { ItemDrop } from '../entities/ItemDrop';
import type { Player } from '../entities/Player';
import type { EventBus, SimEvents } from '../events';
import type { Inventory } from '../inventory/Inventory';
import { createCollisionResult, moveAndCollide } from '../physics/tileCollision';
import type { World } from '../world/World';

const collision = createCollisionResult();

// Mutable payload reused for every pickup; listeners must copy what they keep.
const pickedUp = { itemId: 0, count: 0, x: 0, y: 0 };
const inventoryChangedPayload: Record<string, never> = {};

export function updateItemDrops(
  drops: ItemDrop[],
  player: Player,
  inventory: Inventory,
  world: World,
  events: EventBus<SimEvents>,
  dt: number,
): void {
  const pb = player.body;
  const px = pb.x + pb.width / 2;
  const py = pb.y + pb.height / 2;
  const magnetSq = ITEM_DROP.magnetRadius * ITEM_DROP.magnetRadius;
  const pickupSq = ITEM_DROP.pickupRadius * ITEM_DROP.pickupRadius;

  for (let i = drops.length - 1; i >= 0; i--) {
    const drop = drops[i];
    if (!drop) continue;
    const b = drop.body;
    drop.prevX = b.x;
    drop.prevY = b.y;
    drop.age += dt;

    if (drop.age > ITEM_DROP.despawnAfter) {
      removeAt(drops, i);
      continue;
    }

    let dx = px - (b.x + b.width / 2);
    let dy = py - (b.y + b.height / 2);
    let distSq = dx * dx + dy * dy;

    drop.magnetized =
      drop.age >= drop.pickupAfter && distSq <= magnetSq && inventory.canAccept(drop.itemId);

    if (drop.magnetized) {
      const dist = Math.sqrt(distSq);
      if (dist > 0) {
        const a = ITEM_DROP.magnetAcceleration * dt;
        b.vx += (dx / dist) * a;
        b.vy += (dy / dist) * a;
      }
      const speedSq = b.vx * b.vx + b.vy * b.vy;
      if (speedSq > ITEM_DROP.magnetMaxSpeed * ITEM_DROP.magnetMaxSpeed) {
        const k = ITEM_DROP.magnetMaxSpeed / Math.sqrt(speedSq);
        b.vx *= k;
        b.vy *= k;
      }
      // Flies through tiles on purpose: it is on its way to the player.
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      dx = px - (b.x + b.width / 2);
      dy = py - (b.y + b.height / 2);
      distSq = dx * dx + dy * dy;
    } else {
      b.vy = Math.min(b.vy + ITEM_DROP.gravity * dt, ITEM_DROP.maxFallSpeed);
      moveAndCollide(world, b, dt, collision);
      if (collision.onGround && b.vx !== 0) {
        const slow = ITEM_DROP.groundFriction * dt;
        b.vx = Math.abs(b.vx) <= slow ? 0 : b.vx - Math.sign(b.vx) * slow;
      }
    }

    if (drop.magnetized && distSq <= pickupSq) {
      const leftover = inventory.add(drop.itemId, drop.count);
      const added = drop.count - leftover;
      if (added > 0) {
        pickedUp.itemId = drop.itemId;
        pickedUp.count = added;
        pickedUp.x = b.x + b.width / 2;
        pickedUp.y = b.y + b.height / 2;
        events.emit('itemPickedUp', pickedUp);
        events.emit('inventoryChanged', inventoryChangedPayload);
      }
      if (leftover === 0) removeAt(drops, i);
      else drop.count = leftover;
    }
  }
}

/** Order isn't meaningful, so fill the hole with the last element. */
function removeAt(drops: ItemDrop[], i: number): void {
  const last = drops.pop();
  if (last && i < drops.length) drops[i] = last;
}
