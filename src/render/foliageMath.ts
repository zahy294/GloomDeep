import { FOLIAGE, TILE_SIZE } from '../config';
import type { DecorDef } from '../data/tiles';

/** Where a decoration's sprite is anchored, in world pixels, and the origin that pins it there. */
export interface DecorPlacement {
  x: number;
  y: number;
  originX: number;
  originY: number;
}

/**
 * Ground plants stand on the bottom edge of their tile (sprite bottom-centre), hanging ones hang
 * from the top edge (sprite top-centre), wall decorations sit in the middle of the tile.
 */
export function decorPlacement(
  support: DecorDef['support'],
  tx: number,
  ty: number,
  out: DecorPlacement = { x: 0, y: 0, originX: 0.5, originY: 0.5 },
): DecorPlacement {
  out.x = (tx + 0.5) * TILE_SIZE;
  out.originX = 0.5;
  if (support === 'ground') {
    out.y = (ty + 1) * TILE_SIZE;
    out.originY = 1;
  } else if (support === 'ceiling') {
    out.y = ty * TILE_SIZE;
    out.originY = 0;
  } else {
    out.y = (ty + 0.5) * TILE_SIZE;
    out.originY = 0.5;
  }
  return out;
}

/**
 * +1 for plants pivoting at their base, −1 for ones pivoting at their top: a wind to the right
 * rotates the first clockwise (positive) and the second counter-clockwise.
 */
export function pivotSign(support: DecorDef['support']): 1 | -1 {
  return support === 'ceiling' ? -1 : 1;
}

/** Stable pseudo-random 0..1 from a tile position, so neighbours never move in lockstep. */
export function positionHash(tx: number, ty: number): number {
  let h = Math.imul(tx, 0x27d4eb2d) ^ Math.imul(ty, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Swing period (ms) and phase delay (ms) for the plant at a tile. */
export function swayTiming(tx: number, ty: number): { periodMs: number; delayMs: number } {
  const { periodMs, periodJitter } = FOLIAGE.sway;
  const a = positionHash(tx, ty);
  const b = positionHash(ty + 7919, tx + 104729);
  const period = periodMs * (1 + (a * 2 - 1) * periodJitter);
  return { periodMs: period, delayMs: b * period * 2 };
}

/**
 * The rotation animation of a plant as `base + amplitude * ease(t)`: it swings through
 * `2 * half` radians centred on a lean that follows the wind. `bend` shifts the whole swing
 * (the plant being pushed by the player).
 */
export function swayRotation(
  sway: number,
  wind: number,
  sign: 1 | -1,
  bend: number,
  out: { base: number; amplitude: number } = { base: 0, amplitude: 0 },
): { base: number; amplitude: number } {
  const { idleFraction, windFraction, leanFraction } = FOLIAGE.sway;
  const half = sway * (idleFraction + windFraction * Math.abs(wind)) * 0.5;
  const lean = sway * leanFraction * wind * sign;
  out.base = lean + bend - half;
  out.amplitude = half * 2;
  return out;
}

/**
 * How far a plant leans away from the player (radians, already signed for its pivot), 0 beyond the
 * bend radius. Falls off smoothly so a plant eases into the lean as the player walks up.
 */
export function bendTarget(
  plantX: number,
  playerX: number,
  sway: number,
  sign: 1 | -1,
  radiusPx: number = FOLIAGE.bend.radiusPx,
): number {
  if (sway <= 0) return 0;
  const away = Math.abs(plantX - playerX) / radiusPx;
  if (away >= 1) return 0;
  const closeness = 1 - away;
  const strength = closeness * closeness * (3 - 2 * closeness);
  const max = Math.min(FOLIAGE.bend.maxRadians, sway * FOLIAGE.bend.perSway);
  const direction = plantX >= playerX ? 1 : -1;
  return direction * sign * strength * max;
}
