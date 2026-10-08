import { PLAYER_ANIM } from '../config';
import { PART_FRAME } from '../data/playerParts';

/**
 * Pure pose maths for the parts-based player (no Phaser, unit-tested). Angles are "forward
 * positive": 0 = arm hanging straight down, π/2 = pointing forward (the facing direction),
 * π = straight up. The renderer converts to screen rotation and mirrors for facing left.
 */

export type ArmUse = 'none' | 'mine' | 'place';

export interface PoseInput {
  /** Velocity in px/s (screen axes: +y is down). */
  vx: number;
  vy: number;
  onGround: boolean;
  /** Accumulated horizontal distance walked (px); drives the walk cycle. */
  walkDistance: number;
  /** Seconds since the animation started (idle breathing, swing timing). */
  time: number;
  use: ArmUse;
  /** Direction from the front shoulder to the cursor, as a forward-positive arm angle. */
  aimAngle: number;
}

export interface Pose {
  legsFrame: number;
  /** Vertical offset of everything above the legs (px, negative = up). */
  bodyOffsetY: number;
  backArmAngle: number;
  frontArmAngle: number;
}

/** Forward-positive arm angle pointing from a shoulder at (sx, sy) to (tx, ty), for a facing. */
export function armAngleTowards(
  sx: number,
  sy: number,
  tx: number,
  ty: number,
  facing: 1 | -1,
): number {
  return Math.atan2((tx - sx) * facing, ty - sy);
}

/** Writes the pose into `out` (reused every frame, so animating allocates nothing). */
export function computePose(
  input: PoseInput,
  out: Pose = { legsFrame: 0, bodyOffsetY: 0, backArmAngle: 0, frontArmAngle: 0 },
): Pose {
  const a = PLAYER_ANIM;
  const speed = Math.abs(input.vx);
  const walking = input.onGround && speed >= a.walkSpeedThreshold;

  let legsFrame: number = PART_FRAME.legsIdle;
  let bodyOffsetY = 0;
  let backArmAngle = 0;
  let frontArmAngle = 0;

  if (!input.onGround) {
    legsFrame = PART_FRAME.legsJump;
    const arms = input.vy < 0 ? a.jumpArmRise : a.fallArmSpread;
    backArmAngle = -arms * a.jumpBackArmFactor;
    frontArmAngle = arms;
  } else if (walking) {
    const step = Math.floor(input.walkDistance / a.strideFramePx);
    const cycle = ((step % 4) + 4) % 4;
    legsFrame = PART_FRAME.legsWalk[cycle] ?? PART_FRAME.legsIdle;
    // Passing frames (1, 3) lift the body; arms swing opposite to each other over the stride.
    bodyOffsetY = cycle % 2 === 1 ? -a.walkBob : 0;
    const swing = Math.sin((input.walkDistance / (a.strideFramePx * 4)) * Math.PI * 2);
    frontArmAngle = swing * a.walkArmSwing;
    backArmAngle = -swing * a.walkArmSwing;
  } else {
    bodyOffsetY = Math.sin(input.time * a.idleBreathRate) > 0.6 ? -a.idleBob : 0;
  }

  if (input.use === 'place') {
    frontArmAngle = input.aimAngle;
  } else if (input.use === 'mine') {
    // Hack towards the target: a sawtooth from raised-back to past the aim, eased in.
    const t = (input.time * a.swingRate) % 1;
    const eased = t * t;
    frontArmAngle = input.aimAngle + a.swingBack - eased * (a.swingBack + a.swingForward);
  }

  out.legsFrame = legsFrame;
  out.bodyOffsetY = bodyOffsetY;
  out.backArmAngle = backArmAngle;
  out.frontArmAngle = frontArmAngle;
  return out;
}
