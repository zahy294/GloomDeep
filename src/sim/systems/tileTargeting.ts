import { TILE_SIZE } from '../../config';
import type { Body } from '../physics/tileCollision';

/** Tile column/row under a world-pixel position. */
export function tileAt(px: number): number {
  return Math.floor(px / TILE_SIZE);
}

/** Whether the centre of tile (tx, ty) is within `reachTiles` of the body's centre. */
export function inReach(body: Body, tx: number, ty: number, reachTiles: number): boolean {
  const dx = (tx + 0.5) * TILE_SIZE - (body.x + body.width / 2);
  const dy = (ty + 0.5) * TILE_SIZE - (body.y + body.height / 2);
  const reach = reachTiles * TILE_SIZE;
  return dx * dx + dy * dy <= reach * reach;
}

/** Whether tile (tx, ty) overlaps the body (half-open, like collision). */
export function overlapsBody(body: Body, tx: number, ty: number): boolean {
  const left = tx * TILE_SIZE;
  const top = ty * TILE_SIZE;
  return (
    body.x < left + TILE_SIZE &&
    body.x + body.width > left &&
    body.y < top + TILE_SIZE &&
    body.y + body.height > top
  );
}
