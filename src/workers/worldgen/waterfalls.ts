import { WATER_FX } from '../../config';
import { tileId, TILES } from '../../data/tiles';
import { AIR, inSpawnArea, isSolidId, stepRandom, type GenContext } from './context';

const WATERFALL = tileId('waterfall');
/** Decorations (flora) are non-solid and may stand in the way; they are cleared with the ground. */
const IS_DECOR = Uint8Array.from(TILES, (t) => (t.decor ? 1 : 0));
const SALT = 12;
const FG = WATER_FX.worldgen;

interface Cut {
  /** Ledge column, fall column and direction away from the ledge (+1 right, -1 left). */
  readonly ledge: number;
  readonly fall: number;
  readonly dir: 1 | -1;
  /** First row of the fall and the landing floor row (the first solid row under the water). */
  readonly top: number;
  readonly floor: number;
}

/**
 * Waterfalls (plan 2.7). The hills are too gentle for natural cliffs, so one is cut: a landing
 * basin is dug below a ledge and a ramp climbs back to the original ground on its far side, so
 * the player can walk out. A column of falling-water tiles runs from the ledge down to the floor.
 * Liquids are static until M9, so the fall is a tile the renderer animates. Runs at the end of
 * the settle step, once nothing else will move.
 */
export function placeWaterfalls(ctx: GenContext): void {
  const random = stepRandom(ctx, SALT);
  const wanted = Math.max(1, Math.round(ctx.width / FG.columnsPerFall));
  const placed: Cut[] = [];
  for (let attempt = 0; attempt < FG.attempts && placed.length < wanted; attempt++) {
    const ledge = FG.edgeMargin + Math.floor(random() * (ctx.width - 2 * FG.edgeMargin));
    const dir = random() < 0.5 ? 1 : -1;
    const drop = FG.minDrop + Math.floor(random() * (FG.maxDrop - FG.minDrop + 1));
    if (placed.some((p) => Math.abs(p.fall - ledge) < FG.minSpacing)) continue;
    const cut = planCut(ctx, ledge, dir, drop);
    if (!cut) continue;
    placed.push(cut);
    carve(ctx, cut);
  }
}

/** Checks that the cut fits (flat, dry, open sky, away from the spawn, room for the ramp). */
function planCut(ctx: GenContext, ledge: number, dir: 1 | -1, drop: number): Cut | null {
  const { surface, fg, liquid, width } = ctx;
  const fall = ledge + dir;
  // The lower of the two grass rows, so the ledge is solid beside the first water tile.
  const top = Math.max(surface[ledge] ?? 0, surface[fall] ?? 0);
  const floor = top + drop;
  // The cut spans the ledge, the basin and the ramp that climbs back out.
  const reach = FG.basinWidth + drop;
  const far = fall + dir * reach;
  if (far < FG.edgeMargin || far >= width - FG.edgeMargin) return null;

  for (let x = ledge; x !== far + dir; x += dir) {
    const ground = surface[x] ?? 0;
    if (inSpawnArea(ctx, x, top) || inSpawnArea(ctx, x, floor)) return null;
    if (x !== ledge && Math.abs(ground - top) > FG.maxSlope) return null; // only on level ground
    for (let y = ground - FG.skyClearance; y < ground; y++) {
      const id = fg[y * width + x] ?? AIR;
      if (id !== AIR && IS_DECOR[id] !== 1) return null; // a tree or canopy overhead
    }
    for (let y = ground; y <= floor; y++) {
      if ((liquid[y * width + x] ?? 0) > 0) return null;
      // Caves under the cut would leave the floor hollow.
      if (y > ground && !isSolidId(fg[y * width + x] ?? AIR)) return null;
    }
  }
  return { ledge, fall, dir, top, floor };
}

/** Digs the basin and ramp, re-capping the new ground, then fills the fall column. */
function carve(ctx: GenContext, c: Cut): void {
  const { surface, fg, width } = ctx;
  const reach = FG.basinWidth + (c.floor - c.top);
  for (let k = 0; k < reach; k++) {
    const x = c.fall + c.dir * k;
    const ground = surface[x] ?? 0;
    // Basin columns sit at the floor; the ramp then rises one row per column.
    const level = k < FG.basinWidth ? c.floor : c.floor - (k - FG.basinWidth + 1);
    if (level <= ground) continue;
    const cap = fg[ground * width + x] ?? AIR; // the grass (or biome ground) tile being dug away
    for (let y = ground; y < level; y++) fg[y * width + x] = AIR;
    fg[level * width + x] = cap;
    surface[x] = level;
  }
  for (let y = c.top; y < c.floor; y++) fg[y * width + c.fall] = WATERFALL;
}
