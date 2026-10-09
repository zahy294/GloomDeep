import { PLAYER, TILE_SIZE } from '../../config';
import type { Body } from '../physics/tileCollision';

/** A villager or the Old Dryad (plan 1.7). Data in src/data/npcs.ts by `key`. */
export interface Npc {
  readonly id: number;
  readonly key: string;
  body: Body;
  prevX: number;
  prevY: number;
  facing: 1 | -1;
  onGround: boolean;
  /** The home they live in (Room id), or -1 while homeless. */
  homeId: number;
  /** Where they stroll between (tiles, inclusive) — their home's width. */
  roamX0: number;
  roamX1: number;
  /** Seconds until the next stroll, and where it goes (pixels; NaN = standing still). */
  timer: number;
  targetX: number;
  /** Which of their lines they say next. */
  line: number;
}

/** Same size as the player. Feet-centre at (feetX, feetY), pixels. */
export function createNpc(id: number, key: string, feetX: number, feetY: number): Npc {
  const x = feetX - PLAYER.width / 2;
  const y = feetY - PLAYER.height;
  const tile = Math.floor(feetX / TILE_SIZE);
  return {
    id,
    key,
    body: { x, y, width: PLAYER.width, height: PLAYER.height, vx: 0, vy: 0 },
    prevX: x,
    prevY: y,
    facing: 1,
    onGround: false,
    homeId: -1,
    roamX0: tile,
    roamX1: tile,
    timer: 0,
    targetX: Number.NaN,
    line: 0,
  };
}
