import { FLORA_FX, LIQUID, PLAYER, SWIM, TILE_SIZE } from '../../config';
import { TILES } from '../../data/tiles';
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

  player.invuln = Math.max(0, player.invuln - dt);
  // Swimming: what liquid is around the middle of the body.
  const mx = Math.floor((body.x + body.width / 2) / TILE_SIZE);
  const my = Math.floor((body.y + body.height / 2) / TILE_SIZE);
  const mi = world.inBounds(mx, my) ? my * world.width + mx : -1;
  player.inLiquid =
    mi >= 0 && (world.liquid[mi] ?? 0) >= LIQUID.wetAmount ? (world.liquidType[mi] ?? 0) : 0;
  const swimming = player.inLiquid !== 0;
  const fae = player.fae > 0;
  const runSpeed = PLAYER.maxRunSpeed * (fae ? FLORA_FX.faeSpeed : 1);
  const maxRun = swimming ? runSpeed * SWIM.speedFactor : runSpeed;
  player.knockbackTimer = Math.max(0, player.knockbackTimer - dt);
  // Knocked back (or dead): no steering, and only air friction so the knockback carries.
  const control = player.knockbackTimer === 0 && !player.dead;

  // Horizontal
  const dir = control
    ? (input.isHeld('moveRight') ? 1 : 0) - (input.isHeld('moveLeft') ? 1 : 0)
    : 0;
  const accel = player.onGround ? PLAYER.groundAcceleration : PLAYER.airAcceleration;
  const friction = player.onGround && control ? PLAYER.groundFriction : PLAYER.airFriction;
  if (dir !== 0) {
    player.facing = dir === 1 ? 1 : -1;
    // Turning around: acceleration plus friction, so reversing is snappy.
    const a = body.vx * dir < 0 ? accel + friction : accel;
    const v = body.vx + dir * a * dt;
    body.vx = Math.abs(v) > maxRun ? dir * maxRun : v;
  } else {
    const drop = friction * dt;
    body.vx = Math.abs(body.vx) <= drop ? 0 : body.vx - Math.sign(body.vx) * drop;
  }

  // Gravity (gentle in liquid, where holding jump swims upwards)
  if (swimming) {
    body.vy = Math.min(body.vy + PLAYER.gravity * SWIM.gravityFactor * dt, SWIM.maxFallSpeed);
    if (control && input.isHeld('jump')) body.vy = Math.min(body.vy, -SWIM.swimUpSpeed);
  } else {
    body.vy = Math.min(body.vy + PLAYER.gravity * dt, PLAYER.maxFallSpeed);
  }

  // Coyote time and jump buffer
  player.coyoteTimer = player.onGround ? PLAYER.coyoteTime : Math.max(0, player.coyoteTimer - dt);
  player.jumpBufferTimer =
    input.consumePressed('jump') && control
      ? PLAYER.jumpBufferTime
      : Math.max(0, player.jumpBufferTimer - dt);

  if (player.jumpBufferTimer > 0 && player.coyoteTimer > 0) {
    body.vy = -PLAYER.jumpSpeed * (fae ? FLORA_FX.faeJump : 1);
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
  const impact = body.vy;
  // Holding Down drops through one-way platforms (branches).
  const dropThrough = input.isHeld('moveDown');
  moveAndCollide(world, body, dt, collision, PLAYER.stepUpHeight, wasOnGround, dropThrough);
  player.onGround = collision.onGround;
  // Landing hard on a glowcap bounces you back up.
  player.bounced = false;
  if (collision.onGround && !wasOnGround && impact >= FLORA_FX.bounceMinSpeed) {
    const fx = Math.floor((body.x + body.width / 2) / TILE_SIZE);
    const fy = Math.floor((body.y + body.height + 1) / TILE_SIZE);
    const bouncy = TILES[world.get(fx, fy)]?.bouncy ?? 0;
    if (bouncy > 0) {
      body.vy = -impact * bouncy;
      player.onGround = false;
      player.bounced = true;
    }
  }
  player.steppedUpTotal += collision.steppedUp;
  if (collision.hitCeiling) player.jumping = false;
}
