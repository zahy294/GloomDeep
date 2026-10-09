import { FLARE } from '../../config';
import type { Body } from '../physics/tileCollision';

/** A thrown flare (plan M7): a small body that bounces, comes to rest and burns for a while. */
export interface Flare {
  body: Body;
  prevX: number;
  prevY: number;
  age: number;
}

/** Spawned centred on a point, flying along (dirX, dirY) (a unit vector). */
export function createFlare(x: number, y: number, dirX: number, dirY: number): Flare {
  const s = FLARE.size;
  return {
    body: {
      x: x - s / 2,
      y: y - s / 2,
      width: s,
      height: s,
      vx: dirX * FLARE.throwSpeed,
      vy: dirY * FLARE.throwSpeed,
    },
    prevX: x - s / 2,
    prevY: y - s / 2,
    age: 0,
  };
}

/** 1 while burning, fading to 0 over the last FLARE.fadeSeconds. */
export function flareStrength(flare: Flare): number {
  const left = FLARE.lifeSeconds - flare.age;
  return left <= 0 ? 0 : Math.min(1, left / FLARE.fadeSeconds);
}
