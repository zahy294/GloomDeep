import { SETTLEMENT } from '../../config';
import { TILES } from '../../data/tiles';
import { isDoor } from './doors';
import { AIR, type World } from './World';

const SOLID = Uint8Array.from(TILES, (t) => (t.solid ? 1 : 0));
const FLOOR = Uint8Array.from(TILES, (t) => (t.solid || t.platform ? 1 : 0));
const EMITS = Uint8Array.from(TILES, (t) => (t.light ? 1 : 0));

/** Why a room isn't a home (for the UI's "this home needs..." hints). */
export type RoomProblem = 'open' | 'small' | 'walls' | 'light' | 'door' | 'floor' | null;

export interface Room {
  /** Stable id: the smallest cell index inside. */
  readonly id: number;
  readonly cells: number;
  /** Where an NPC stands: feet cell (tile coordinates). */
  readonly spotX: number;
  readonly spotY: number;
  /** Bounding box (tiles, inclusive). */
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
  readonly problem: RoomProblem;
}

/** Reused flood-fill buffers (rooms are small, so a set beats a world-sized array). */
const visited = new Set<number>();
let queue = new Int32Array(0);

/**
 * The room containing (x, y) (plan 1.7: NPCs move into lit homes). A room is the open space
 * reachable from (x, y) without crossing a solid block or a door. It's a home (`problem` null)
 * when it is closed in (at most SETTLEMENT.maxCells), big enough, backed by walls, lit by a light
 * inside, has a door, and has a floor spot with room to stand. Returns null for a solid start.
 */
export function findRoom(world: World, x: number, y: number): Room | null {
  if (!world.inBounds(x, y)) return null;
  const start = world.index(x, y);
  if (SOLID[world.fg[start] ?? AIR] === 1 || isDoor(world.fg[start] ?? AIR)) return null;
  if (queue.length < SETTLEMENT.maxCells + 1) queue = new Int32Array(SETTLEMENT.maxCells + 1);
  visited.clear();
  const W = world.width;
  let head = 0;
  let tail = 0;
  queue[tail++] = start;
  visited.add(start);
  let id = start;
  let walls = 0;
  let lights = 0;
  let doors = 0;
  let open = false;
  let x0 = x;
  let y0 = y;
  let x1 = x;
  let y1 = y;
  while (head < tail) {
    const i = queue[head++] ?? 0;
    const cx = i % W;
    const cy = (i - cx) / W;
    if (i < id) id = i;
    if (cx < x0) x0 = cx;
    if (cx > x1) x1 = cx;
    if (cy < y0) y0 = cy;
    if (cy > y1) y1 = cy;
    if ((world.bg[i] ?? AIR) !== AIR) walls++;
    if (EMITS[world.fg[i] ?? AIR] === 1) lights++;
    for (let d = 0; d < 4; d++) {
      const nx = cx + (d === 0 ? 1 : d === 1 ? -1 : 0);
      const ny = cy + (d === 2 ? 1 : d === 3 ? -1 : 0);
      if (!world.inBounds(nx, ny)) {
        open = true;
        continue;
      }
      const j = ny * W + nx;
      const t = world.fg[j] ?? AIR;
      if (isDoor(t)) {
        if (!visited.has(j)) {
          visited.add(j);
          doors++;
        }
        continue;
      }
      if (SOLID[t] === 1 || visited.has(j)) continue;
      if (tail >= SETTLEMENT.maxCells) {
        open = true; // too big to be a room: it's the outdoors or a cave
        continue;
      }
      visited.add(j);
      queue[tail++] = j;
    }
    if (open) break;
  }
  const cells = tail;
  const base = { id, cells, spotX: x, spotY: y, x0, y0, x1, y1 };
  if (open) return { ...base, problem: 'open' };
  if (cells < SETTLEMENT.minCells) return { ...base, problem: 'small' };
  if (walls < cells * SETTLEMENT.wallCoverage) return { ...base, problem: 'walls' };
  if (lights === 0) return { ...base, problem: 'light' };
  if (doors === 0) return { ...base, problem: 'door' };
  // A spot to stand: an open cell over a floor with standing room above (searched from the middle).
  const mid = (x0 + x1) >> 1;
  for (let k = 0; k <= x1 - x0; k++) {
    const sx = mid + (k % 2 === 0 ? k / 2 : -(k + 1) / 2);
    for (let sy = y1; sy >= y0; sy--) {
      if (!visited.has(sy * W + sx) || isDoor(world.get(sx, sy))) continue;
      if (FLOOR[world.get(sx, sy + 1)] !== 1) continue;
      let room = true;
      for (let h = 1; h < SETTLEMENT.standHeight && room; h++) {
        const above = (sy - h) * W + sx;
        room = sy - h >= 0 && visited.has(above) && SOLID[world.fg[above] ?? AIR] !== 1;
      }
      if (room) return { ...base, spotX: sx, spotY: sy + 1, problem: null };
    }
  }
  return { ...base, problem: 'floor' };
}
