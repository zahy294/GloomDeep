import { PLAYER } from '../../config';
import type { Player } from '../entities/Player';
import type { ActionState } from '../input';
import { createCollisionResult, moveAndCollide } from '../physics/tileCollision';
import type { World } from '../world/World';

/** Reused every step so the system allocates nothing. */
const collision = createCollisionResult();

export function updatePlayer(player: Player, input: ActionState, world: World, dt: number): void {
  const body = player.body;
  player.prevX = body.x;
  player.prevY = body.y;

  // Horizontal
  const dir = (input.isHeld('moveRight') ? 1 : 0) - (input.isHeld('moveLeft') ? 1 : 0);
  const accel = player.onGround ? PLAYER.groundAcceleration : PLAYER.airAcceleration;
  const friction = player.onGround ? PLAYER.groundFriction : PLAYER.airFriction;
  if (dir !== 0) {
    player.facing = dir === 1 ? 1 : -1;
    // Turning around: acceleration plus friction, so reversing is snappy.
    const a = body.vx * dir < 0 ? accel + friction : accel;
    const v = body.vx + dir * a * dt;
    body.vx = Math.abs(v) > PLAYER.maxRunSpeed ? dir * PLAYER.maxRunSpeed : v;
  } else {
    const drop = friction * dt;
    body.vx = Math.abs(body.vx) <= drop ? 0 : body.vx - Math.sign(body.vx) * drop;
  }

  // Gravity
  body.vy = Math.min(body.vy + PLAYER.gravity * dt, PLAYER.maxFallSpeed);

  // Coyote time and jump buffer
  player.coyoteTimer = player.onGround ? PLAYER.coyoteTime : Math.max(0, player.coyoteTimer - dt);
  player.jumpBufferTimer = input.consumePressed('jump')
    ? PLAYER.jumpBufferTime
    : Math.max(0, player.jumpBufferTimer - dt);

  if (player.jumpBufferTimer > 0 && player.coyoteTimer > 0) {
    body.vy = -PLAYER.jumpSpeed;
    player.jumpBufferTimer = 0;
    player.coyoteTimer = 0;
    player.jumping = true;
  }

  // Variable jump height
  if (player.jumping) {
    if (body.vy >= 0) {
      player.jumping = false;
    } else if (!input.isHeld('jump')) {
      body.vy *= PLAYER.jumpCutMultiplier;
      player.jumping = false;
    }
  }

  const wasOnGround = player.onGround;
  // Holding Down drops through one-way platforms (branches).
  const dropThrough = input.isHeld('moveDown');
  moveAndCollide(world, body, dt, collision, PLAYER.stepUpHeight, wasOnGround, dropThrough);
  player.onGround = collision.onGround;
  player.steppedUpTotal += collision.steppedUp;
  if (collision.hitCeiling) player.jumping = false;
}
