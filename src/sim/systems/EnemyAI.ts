import { ENEMY_AI, TILE_SIZE } from '../../config';
import type { EnemyDef } from '../../data/enemies';
import type { Enemy, EnemyState } from '../entities/Enemy';
import type { Player } from '../entities/Player';
import { createCollisionResult, moveAndCollide } from '../physics/tileCollision';
import type { World } from '../world/World';

const collision = createCollisionResult();

/** Brightest light channel at a pixel position (0 outside the world). */
export function lightAtPx(world: World, x: number, y: number): number {
  const tx = Math.floor(x / TILE_SIZE);
  const ty = Math.floor(y / TILE_SIZE);
  if (!world.inBounds(tx, ty)) return 0;
  const i = ty * world.width + tx;
  return Math.max(world.lightR[i] ?? 0, world.lightG[i] ?? 0, world.lightB[i] ?? 0);
}

function setState(enemy: Enemy, state: EnemyState): void {
  if (enemy.state === state) return;
  enemy.state = state;
  enemy.stateTime = 0;
}

/** Moves `v` towards `target` by at most `rate × dt`. */
function approach(v: number, target: number, rate: number, dt: number): number {
  const step = rate * dt;
  return v < target ? Math.min(target, v + step) : Math.max(target, v - step);
}

/**
 * One step of a creature's behaviour (plan 3.4 AISystem: small state machines per AI type).
 * Movement only: damage, knockback and death are the CombatSystem's.
 * - walker: wanders; chases the player when near, jumping over steps and towards a higher player.
 * - hopper: hops towards the player (slimes).
 * - flyer: flies at the player with a bob; scatters from bright light if it `fleesLight` (bats).
 * - burrower: tunnels through rock beneath the player, then lunges up out of the ground.
 * - shade: drifts through anything towards the player; shrinks back from bright light.
 */
export function updateEnemyAI(
  enemy: Enemy,
  def: EnemyDef,
  player: Player,
  playerAlive: boolean,
  world: World,
  dt: number,
): void {
  const b = enemy.body;
  enemy.prevX = b.x;
  enemy.prevY = b.y;
  enemy.stateTime += dt;
  enemy.invuln = Math.max(0, enemy.invuln - dt);
  enemy.stunned = Math.max(0, enemy.stunned - dt);

  const pb = player.body;
  const dx = pb.x + pb.width / 2 - (b.x + b.width / 2);
  const dy = pb.y + pb.height / 2 - (b.y + b.height / 2);
  const dist = Math.hypot(dx, dy);
  const aggro = playerAlive && dist <= def.aggroRange * TILE_SIZE;
  const dir: 1 | -1 = dx >= 0 ? 1 : -1;

  switch (def.ai) {
    case 'walker':
      walk(enemy, def, world, aggro, dir, dy, dt);
      break;
    case 'hopper':
      hop(enemy, def, world, aggro, dir, dt);
      break;
    case 'flyer':
      fly(enemy, def, world, aggro, dx, dy, dist, dt);
      break;
    case 'burrower':
      burrow(enemy, def, world, aggro, dx, dy, dt);
      break;
    case 'shade':
      drift(enemy, def, world, aggro, dx, dy, dist, dt);
      break;
  }
}

function fall(enemy: Enemy, dt: number): void {
  enemy.body.vy = Math.min(enemy.body.vy + ENEMY_AI.gravity * dt, ENEMY_AI.maxFallSpeed);
}

function walk(
  enemy: Enemy,
  def: EnemyDef,
  world: World,
  aggro: boolean,
  dir: 1 | -1,
  dy: number,
  dt: number,
): void {
  const b = enemy.body;
  fall(enemy, dt);
  if (enemy.stunned <= 0) {
    if (aggro) {
      setState(enemy, 'chase');
      enemy.facing = dir;
    } else {
      setState(enemy, 'idle');
      if (enemy.stateTime >= ENEMY_AI.wanderSeconds) {
        enemy.stateTime = 0;
        enemy.facing = enemy.facing === 1 ? -1 : 1;
      }
    }
    const target = enemy.facing * def.speed * (aggro ? 1 : ENEMY_AI.wanderSpeed);
    b.vx = approach(b.vx, target, ENEMY_AI.acceleration, dt);
    // Jump at walls, and up towards a player standing higher.
    const wantsUp = aggro && dy < -ENEMY_AI.jumpAtHeight * TILE_SIZE;
    if (enemy.onGround && def.jump && wantsUp) {
      b.vy = -def.jump;
    }
  } else if (enemy.onGround) {
    b.vx = approach(b.vx, 0, ENEMY_AI.groundFriction, dt);
  }
  moveAndCollide(world, b, dt, collision, ENEMY_AI.stepUp, enemy.onGround);
  enemy.onGround = collision.onGround;
  if ((collision.hitWallLeft || collision.hitWallRight) && enemy.onGround) {
    if (aggro && def.jump) b.vy = -def.jump;
    else enemy.facing = enemy.facing === 1 ? -1 : 1;
  }
}

function hop(enemy: Enemy, def: EnemyDef, world: World, aggro: boolean, dir: 1 | -1, dt: number) {
  const b = enemy.body;
  fall(enemy, dt);
  if (enemy.onGround) {
    b.vx = approach(b.vx, 0, ENEMY_AI.groundFriction, dt);
    const wait = aggro ? ENEMY_AI.hopDelay : ENEMY_AI.hopDelay * ENEMY_AI.idleHopFactor;
    if (enemy.stunned <= 0 && enemy.stateTime >= wait) {
      enemy.stateTime = 0;
      enemy.facing = aggro ? dir : enemy.facing === 1 ? -1 : 1;
      b.vx = enemy.facing * def.speed * (aggro ? 1 : ENEMY_AI.wanderSpeed);
      b.vy = -(def.jump ?? 0) * (aggro ? 1 : ENEMY_AI.idleHopHeight);
    }
  }
  setState(enemy, aggro ? 'chase' : 'idle');
  moveAndCollide(world, b, dt, collision, 0, enemy.onGround);
  enemy.onGround = collision.onGround;
  if (collision.hitWallLeft || collision.hitWallRight) b.vx = -b.vx * ENEMY_AI.wallBounce;
}

function fly(
  enemy: Enemy,
  def: EnemyDef,
  world: World,
  aggro: boolean,
  dx: number,
  dy: number,
  dist: number,
  dt: number,
): void {
  const b = enemy.body;
  const light = lightAtPx(world, b.x + b.width / 2, b.y + b.height / 2);
  if (def.fleesLight && light >= ENEMY_AI.fleeLight) setState(enemy, 'flee');
  else if (enemy.state === 'flee' && enemy.stateTime < ENEMY_AI.fleeSeconds) {
    // keep fleeing for a moment
  } else setState(enemy, aggro ? 'chase' : 'idle');

  let tx = 0;
  let ty = 0;
  if (enemy.state === 'chase' && dist > 0) {
    tx = (dx / dist) * def.speed;
    ty = (dy / dist) * def.speed;
  } else if (enemy.state === 'flee' && dist > 0) {
    tx = (-dx / dist) * def.speed;
    ty = (-Math.abs(dy) / dist) * def.speed - def.speed * ENEMY_AI.fleeLift;
  } else {
    tx = enemy.facing * def.speed * ENEMY_AI.wanderSpeed;
    if (enemy.stateTime >= ENEMY_AI.wanderSeconds) {
      enemy.stateTime = 0;
      enemy.facing = enemy.facing === 1 ? -1 : 1;
    }
  }
  ty += Math.sin(enemy.stateTime * ENEMY_AI.bobRate + enemy.id) * ENEMY_AI.bobSpeed;
  if (enemy.stunned <= 0) {
    b.vx = approach(b.vx, tx, ENEMY_AI.acceleration, dt);
    b.vy = approach(b.vy, ty, ENEMY_AI.acceleration, dt);
  }
  if (b.vx !== 0) enemy.facing = b.vx > 0 ? 1 : -1;
  moveAndCollide(world, b, dt, collision);
  enemy.onGround = false;
}

function burrow(
  enemy: Enemy,
  def: EnemyDef,
  world: World,
  aggro: boolean,
  dx: number,
  dy: number,
  dt: number,
): void {
  const b = enemy.body;
  const inRock = world.isSolid(
    Math.floor((b.x + b.width / 2) / TILE_SIZE),
    Math.floor((b.y + b.height / 2) / TILE_SIZE),
  );
  if (enemy.state === 'lunge') {
    fall(enemy, dt);
    // Back in the ground on the way down: tunnel again.
    if (b.vy > 0 && inRock && enemy.stateTime > ENEMY_AI.lungeMinSeconds) setState(enemy, 'tunnel');
  } else if (!inRock) {
    // Out of the ground without lunging (dug out, knocked out): fall back in.
    fall(enemy, dt);
    setState(enemy, 'tunnel');
  } else {
    setState(enemy, 'tunnel');
    // Swim through rock to a point under the player.
    const gx = dx;
    const gy = dy + ENEMY_AI.burrowDepth * TILE_SIZE;
    const g = Math.hypot(gx, gy) || 1;
    const speed = aggro ? def.speed : def.speed * ENEMY_AI.wanderSpeed;
    if (enemy.stunned <= 0) {
      b.vx = approach(b.vx, (gx / g) * speed, ENEMY_AI.acceleration, dt);
      b.vy = approach(b.vy, aggro ? (gy / g) * speed : 0, ENEMY_AI.acceleration, dt);
    }
    const under = Math.abs(dx) < ENEMY_AI.lungeRange * TILE_SIZE;
    const close = dy < 0 && -dy < ENEMY_AI.lungeHeight * TILE_SIZE;
    if (aggro && under && close && enemy.stateTime > ENEMY_AI.lungeCooldown) {
      setState(enemy, 'lunge');
      b.vy = -(def.jump ?? 0);
      b.vx = Math.sign(dx) * def.speed * ENEMY_AI.lungeDrift;
    }
  }
  if (b.vx !== 0) enemy.facing = b.vx > 0 ? 1 : -1;
  // Burrowers ignore the tiles they tunnel through.
  b.x += b.vx * dt;
  b.y += b.vy * dt;
  enemy.onGround = false;
}

function drift(
  enemy: Enemy,
  def: EnemyDef,
  world: World,
  aggro: boolean,
  dx: number,
  dy: number,
  dist: number,
  dt: number,
): void {
  const b = enemy.body;
  const light = lightAtPx(world, b.x + b.width / 2, b.y + b.height / 2);
  if (def.fleesLight && light >= ENEMY_AI.shadeFleeLight) setState(enemy, 'flee');
  else if (enemy.state !== 'flee' || enemy.stateTime >= ENEMY_AI.fleeSeconds) {
    setState(enemy, aggro ? 'chase' : 'idle');
  }
  let tx = 0;
  let ty = 0;
  if (dist > 0 && enemy.state !== 'idle') {
    const sign = enemy.state === 'flee' ? -1 : 1;
    tx = ((sign * dx) / dist) * def.speed;
    ty = ((sign * dy) / dist) * def.speed;
  }
  ty += Math.sin(enemy.stateTime * ENEMY_AI.bobRate + enemy.id) * ENEMY_AI.bobSpeed;
  if (enemy.stunned <= 0) {
    b.vx = approach(b.vx, tx, ENEMY_AI.acceleration, dt);
    b.vy = approach(b.vy, ty, ENEMY_AI.acceleration, dt);
  }
  if (Math.abs(b.vx) > 1) enemy.facing = b.vx > 0 ? 1 : -1;
  // Shades pass through rock: they are darkness itself.
  b.x += b.vx * dt;
  b.y += b.vy * dt;
  enemy.onGround = false;
}
