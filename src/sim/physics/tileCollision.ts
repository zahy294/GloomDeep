import { PHYSICS, TILE_SIZE } from '../../config';
import type { World } from '../world/World';

/** AABB with velocity. (x, y) is the TOP-LEFT corner; y grows downward. Pixels and seconds. */
export interface Body {
  x: number;
  y: number;
  width: number;
  height: number;
  vx: number;
  vy: number;
}

export interface CollisionResult {
  onGround: boolean;
  hitCeiling: boolean;
  hitWallLeft: boolean;
  hitWallRight: boolean;
  /** Pixels the body was lifted by auto step-up during this move (0 if none). */
  steppedUp: number;
}

export function createCollisionResult(): CollisionResult {
  return {
    onGround: false,
    hitCeiling: false,
    hitWallLeft: false,
    hitWallRight: false,
    steppedUp: 0,
  };
}

/**
 * The AABB is half-open: a body whose edge sits exactly on a tile boundary does not overlap the
 * tile beyond it. Subtracting EPS from the max edge before flooring implements that, and also
 * absorbs float error from snapping.
 */
const EPS = 1e-4;

function overlapsSolid(world: World, x: number, y: number, w: number, h: number): boolean {
  // Slopes and one-way platforms plug in here: look at the tile kind instead of a plain isSolid.
  const tx0 = Math.floor(x / TILE_SIZE);
  const tx1 = Math.floor((x + w - EPS) / TILE_SIZE);
  const ty0 = Math.floor(y / TILE_SIZE);
  const ty1 = Math.floor((y + h - EPS) / TILE_SIZE);
  for (let ty = ty0; ty <= ty1; ty++) {
    for (let tx = tx0; tx <= tx1; tx++) {
      if (world.isSolid(tx, ty)) return true;
    }
  }
  return false;
}

/**
 * The top edge (px) of a one-way platform row that feet moving down from `fromFeet` to `toFeet`
 * cross (or touch, when starting exactly on it), under any column the body spans; -1 if none.
 * Movement is substepped to under a tile, so at most one row boundary is crossed.
 */
function platformTopCrossed(
  world: World,
  x: number,
  w: number,
  fromFeet: number,
  toFeet: number,
): number {
  const top = Math.ceil((fromFeet - EPS) / TILE_SIZE) * TILE_SIZE;
  if (toFeet <= top) return -1;
  const row = top / TILE_SIZE;
  const tx0 = Math.floor(x / TILE_SIZE);
  const tx1 = Math.floor((x + w - EPS) / TILE_SIZE);
  for (let tx = tx0; tx <= tx1; tx++) {
    if (world.isPlatform(tx, row)) return top;
  }
  return -1;
}

/**
 * Moves the body by velocity × dt, X axis first, then Y. Each axis advances in substeps of at
 * most PHYSICS.maxSubstepDistance so fast bodies cannot skip over thin walls. Blocked axes snap
 * flush to the tile edge and zero their velocity. Writes into `out` (no allocation).
 */
export function moveAndCollide(
  world: World,
  body: Body,
  dt: number,
  out: CollisionResult,
  /** Max ledge height (px) the body climbs automatically while walking on ground; 0 disables. */
  stepUpHeight = 0,
  /** Whether the body stood on ground at the start of this move (step-up only applies then). */
  grounded = false,
  /** Fall through one-way platforms (holding Down); they only ever block from above. */
  dropThrough = false,
): CollisionResult {
  out.onGround = false;
  out.hitCeiling = false;
  out.hitWallLeft = false;
  out.hitWallRight = false;
  out.steppedUp = 0;

  const { width: w, height: h } = body;
  const canStepUp = stepUpHeight > 0 && grounded && body.vy >= 0;

  const dx = body.vx * dt;
  if (dx !== 0) {
    const steps = Math.ceil(Math.abs(dx) / PHYSICS.maxSubstepDistance);
    const stepX = dx / steps;
    for (let i = 0; i < steps; i++) {
      body.x += stepX;
      if (!overlapsSolid(world, body.x, body.y, w, h)) continue;
      if (canStepUp) {
        // Lift to the top of the tile row the feet are in (a full tile when standing flush).
        const feet = body.y + h;
        const lift = feet - Math.floor((feet - EPS) / TILE_SIZE) * TILE_SIZE;
        if (lift <= stepUpHeight && !overlapsSolid(world, body.x, body.y - lift, w, h)) {
          body.y -= lift;
          out.steppedUp += lift;
          continue;
        }
      }
      if (stepX > 0) {
        body.x = Math.floor((body.x + w - EPS) / TILE_SIZE) * TILE_SIZE - w;
        out.hitWallRight = true;
      } else {
        body.x = (Math.floor(body.x / TILE_SIZE) + 1) * TILE_SIZE;
        out.hitWallLeft = true;
      }
      body.vx = 0;
      break;
    }
  }

  const dy = body.vy * dt;
  if (dy !== 0) {
    const steps = Math.ceil(Math.abs(dy) / PHYSICS.maxSubstepDistance);
    const stepY = dy / steps;
    for (let i = 0; i < steps; i++) {
      const fromFeet = body.y + h;
      body.y += stepY;
      if (!overlapsSolid(world, body.x, body.y, w, h)) {
        if (stepY > 0 && !dropThrough) {
          const top = platformTopCrossed(world, body.x, w, fromFeet, body.y + h);
          if (top >= 0) {
            body.y = top - h;
            out.onGround = true;
            body.vy = 0;
            break;
          }
        }
        continue;
      }
      if (stepY > 0) {
        body.y = Math.floor((body.y + h - EPS) / TILE_SIZE) * TILE_SIZE - h;
        out.onGround = true;
      } else {
        body.y = (Math.floor(body.y / TILE_SIZE) + 1) * TILE_SIZE;
        out.hitCeiling = true;
      }
      body.vy = 0;
      break;
    }
  }

  // Resting flush on the ground has no downward motion to collide with, so probe below the feet.
  if (
    !out.onGround &&
    body.vy >= 0 &&
    (overlapsSolid(world, body.x, body.y + PHYSICS.groundProbe, w, h) ||
      (!dropThrough &&
        platformTopCrossed(world, body.x, w, body.y + h, body.y + h + PHYSICS.groundProbe) >= 0))
  ) {
    out.onGround = true;
  }

  return out;
}
