import { BUILDING, TILE_SIZE } from '../../config';
import { TILES, tileId } from '../../data/tiles';
import type { Body } from '../physics/tileCollision';
import { AIR, type World } from './World';

/** Per tile id: 1 for door tiles (open or closed). */
export const IS_DOOR = Uint8Array.from(TILES, (t) => (t.door ? 1 : 0));
/** Per tile id: the door tile it toggles to, or -1. */
const TOGGLES = Int32Array.from(TILES, (t) => (t.door ? tileId(t.door.toggles) : -1));

export function isDoor(id: number): boolean {
  return IS_DOOR[id] === 1;
}

/** The contiguous column of door cells through (x, y): top and bottom rows, or null. */
export function doorColumn(
  world: World,
  x: number,
  y: number,
): { top: number; bottom: number } | null {
  if (!isDoor(world.get(x, y))) return null;
  let top = y;
  let bottom = y;
  while (isDoor(world.get(x, top - 1)) && y - top < BUILDING.doorHeight) top--;
  while (isDoor(world.get(x, bottom + 1)) && bottom - y < BUILDING.doorHeight) bottom++;
  return { top, bottom };
}

/**
 * Opens or closes the door through (x, y). A door won't close on someone standing in it
 * (`bodies`). Returns true if it changed.
 */
export function toggleDoor(world: World, x: number, y: number, bodies: readonly Body[]): boolean {
  const column = doorColumn(world, x, y);
  if (!column) return false;
  const to = TOGGLES[world.get(x, column.bottom)] ?? -1;
  if (to < 0) return false;
  if (TILES[to]?.solid) {
    const x0 = x * TILE_SIZE;
    const y0 = column.top * TILE_SIZE;
    const y1 = (column.bottom + 1) * TILE_SIZE;
    for (const b of bodies) {
      if (b.x < x0 + TILE_SIZE && x0 < b.x + b.width && b.y < y1 && y0 < b.y + b.height)
        return false;
    }
  }
  for (let ty = column.top; ty <= column.bottom; ty++) world.set(x, ty, to);
  return true;
}

/**
 * Can a door stand with its bottom cell at (x, y)? It needs `BUILDING.doorHeight` cells that
 * `free` allows, and solid ground under the bottom one.
 */
export function doorFits(
  world: World,
  x: number,
  y: number,
  free: (id: number) => boolean,
): boolean {
  if (!world.isSolid(x, y + 1)) return false;
  for (let k = 0; k < BUILDING.doorHeight; k++) {
    if (!world.inBounds(x, y - k) || !free(world.get(x, y - k))) return false;
  }
  return true;
}

/** Places a closed door column with its bottom at (x, y). */
export function placeDoor(world: World, x: number, y: number, id: number): void {
  for (let k = 0; k < BUILDING.doorHeight; k++) world.set(x, y - k, id);
}

/** Removes the rest of a door column after one of its cells was mined at (x, y). */
export function clearDoorColumn(world: World, x: number, y: number): void {
  for (const dir of [-1, 1]) {
    let ty = y + dir;
    for (let k = 0; k < BUILDING.doorHeight && isDoor(world.get(x, ty)); k++, ty += dir) {
      world.set(x, ty, AIR);
    }
  }
}
