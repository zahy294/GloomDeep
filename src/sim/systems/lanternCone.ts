import { TILE_SIZE } from '../../config';
import type { LensDef } from '../../data/lenses';
import type { Player } from '../entities/Player';
import type { ActionState } from '../input';

/** Where on the player the lantern's cone starts (px from the feet-centre, facing right). */
export const LANTERN_HAND = { x: 4, y: -18 } as const;

/** The lantern's cone in tile units (the same shape the light job draws). */
export interface Cone {
  x: number;
  y: number;
  dirX: number;
  dirY: number;
  range: number;
  cosHalf: number;
}

export function createCone(): Cone {
  return { x: 0, y: 0, dirX: 1, dirY: 0, range: 0, cosHalf: 1 };
}

/** Fills `out` with the cone of a lens held by the player, aimed at the cursor. */
export function lanternCone(player: Player, input: ActionState, lens: LensDef, out: Cone): Cone {
  const b = player.body;
  const handX = b.x + b.width / 2 + LANTERN_HAND.x * player.facing;
  const handY = b.y + b.height + LANTERN_HAND.y;
  const dx = input.aimX - handX;
  const dy = input.aimY - handY;
  const length = Math.hypot(dx, dy) || 1;
  out.x = handX / TILE_SIZE;
  out.y = handY / TILE_SIZE;
  out.dirX = dx / length;
  out.dirY = dy / length;
  out.range = lens.range;
  out.cosHalf = Math.cos(lens.halfAngle);
  return out;
}

/** Whether the centre of tile (tx, ty) lies inside the cone (geometry only, no occlusion). */
export function inCone(cone: Cone, tx: number, ty: number): boolean {
  const dx = tx + 0.5 - cone.x;
  const dy = ty + 0.5 - cone.y;
  const dist = Math.hypot(dx, dy);
  if (dist > cone.range) return false;
  return dist < 1e-6 || (dx * cone.dirX + dy * cone.dirY) / dist >= cone.cosHalf;
}
