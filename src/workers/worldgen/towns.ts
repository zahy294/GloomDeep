import { WORLDGEN } from '../../config';
import { DEPTH_LAYERS } from '../../data/biomes';
import { prefabByKey } from '../../data/prefabs';
import { TILES, tileId } from '../../data/tiles';
import { TOWNS, type TownDef } from '../../data/towns';
import { stampPrefabAt } from '../../sim/world/prefabs';
import { prefabGroundRow, type Prefab } from '../../sim/world/tiled';
import { AIR, stepRandom, type GenContext, type PlacedTown } from './context';

const SOLID = Uint8Array.from(TILES, (t) => (t.solid ? 1 : 0));
/** The corridor into an underground town's gate gets a floor of this where it has none. */
const FLOOR = tileId('carved_brick');

const smoothstep = (t: number) => {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
};

/**
 * Step 2 (part) — plan the towns (plan 1.7, M11): pick each town's place and level the ground
 * under a surface town, so later steps can keep clear of it. Surface towns go on a random side of
 * the spawn; underground ones on the other side. Runs after the spawn glade is flattened.
 */
export function planTowns(ctx: GenContext): void {
  const random = stepRandom(ctx, 21);
  const centre = Math.floor(ctx.width / 2);
  const surfaceSide = random() < 0.5 ? -1 : 1;
  for (const def of TOWNS) {
    const prefab = prefabByKey(def.prefab);
    const p = def.placement;
    const side = p.kind === 'surface' ? surfaceSide : -surfaceSide;
    const offset = Math.round(p.minOffset + random() * (p.maxOffset - p.minOffset));
    const x0 = side > 0 ? centre + offset : centre - offset - prefab.width + 1;
    if (x0 < 1 || x0 + prefab.width >= ctx.width - 1) continue; // the world is too small for it
    let y0: number;
    if (p.kind === 'surface') {
      y0 = levelGround(ctx, x0, prefab) - prefabGroundRow(prefab);
    } else {
      const layer = DEPTH_LAYERS.findIndex((l) => l.key === p.layer);
      y0 = (ctx.layerTops[layer] ?? 0) + p.depth;
      if (y0 + prefab.height >= ctx.height - 2) continue;
    }
    ctx.towns.push({ key: def.key, x0, y0, x1: x0 + prefab.width - 1, y1: y0 + prefab.height - 1 });
  }
}

/** Flattens the surface under a prefab to the height at its middle, easing in at the sides. */
function levelGround(ctx: GenContext, x0: number, prefab: Prefab): number {
  const x1 = x0 + prefab.width - 1;
  const level = ctx.surface[Math.floor((x0 + x1) / 2)] ?? 0;
  const blend = WORLDGEN.townBlendWidth;
  for (let x = Math.max(0, x0 - blend); x <= Math.min(ctx.width - 1, x1 + blend); x++) {
    const outside = x < x0 ? x0 - x : x > x1 ? x - x1 : 0;
    const flatness = 1 - smoothstep(outside / blend);
    const s = ctx.surface[x] ?? level;
    ctx.surface[x] = Math.round(s + (level - s) * flatness);
  }
  return level;
}

/**
 * Step 4 (part) — the way down to each underground town: a switchback tunnel from the surface,
 * a little out from the town's gate nearest the spawn, ending in a corridor into that gate.
 * `carveTunnel` is the cave entrances' carver (it never cuts protected areas).
 */
export function townTunnels(
  ctx: GenContext,
  carveTunnel: (cx: number, cy: number, radius: number) => void,
): void {
  const cfg = WORLDGEN.townTunnel;
  const tunnel = WORLDGEN.caveEntrances;
  const random = stepRandom(ctx, 22);
  const centre = ctx.width / 2;
  for (const town of ctx.towns) {
    const def = TOWNS.find((t) => t.key === town.key);
    if (!def || def.placement.kind !== 'underground') continue;
    const gate = nearestGate(def, town, centre);
    if (!gate) continue;
    // Outward from the gate: the direction away from the town.
    const out = gate.x < (town.x0 + town.x1) / 2 ? -1 : 1;
    const inner = gate.x + out * (WORLDGEN.townMargin + 1);
    const far = gate.x + out * (cfg.mouthOffset + cfg.band);
    const lo = Math.max(2, Math.min(inner, far));
    const hi = Math.min(ctx.width - 3, Math.max(inner, far));
    let x = gate.x + out * cfg.mouthOffset;
    let y = (ctx.surface[Math.round(x)] ?? 0) - 1;
    ctx.caveMouths.push(Math.round(x));
    let dir: 1 | -1 = random() < 0.5 ? -1 : 1;
    let slope = tunnel.minSlope + random() * (tunnel.maxSlope - tunnel.minSlope);
    for (let step = 0; step < tunnel.maxSteps && y < gate.feetY - 1; step++) {
      const surface = ctx.surface[Math.round(x)] ?? 0;
      carveTunnel(
        Math.round(x),
        Math.round(y),
        y < surface + 2 ? tunnel.mouthRadius : tunnel.radius,
      );
      slope = Math.min(
        tunnel.maxSlope,
        Math.max(tunnel.minSlope, slope + (random() - 0.5) * tunnel.turn),
      );
      x += Math.cos(slope) * dir;
      y += Math.sin(slope);
      if (x <= lo || x >= hi) dir = (x <= lo ? 1 : -1) as 1 | -1;
    }
    // The corridor: level with the gate's floor, straight in through the margin.
    const floor = gate.feetY + 1;
    const from = Math.round(x);
    const step = from < gate.x ? 1 : -1;
    for (let cx = from; cx !== gate.x; cx += step) {
      for (let cy = floor - cfg.corridorHeight; cy < floor; cy++) {
        const i = cy * ctx.width + cx;
        ctx.fg[i] = AIR;
        ctx.liquid[i] = 0;
      }
      // A floor to walk on all the way in.
      if (SOLID[ctx.fg[floor * ctx.width + cx] ?? AIR] !== 1)
        ctx.fg[floor * ctx.width + cx] = FLOOR;
    }
  }
}

/** The town's gate waypoint nearest a column (world tiles, feet row). */
function nearestGate(
  def: TownDef,
  town: PlacedTown,
  column: number,
): { x: number; feetY: number } | null {
  const prefab = prefabByKey(def.prefab);
  let best: { x: number; feetY: number } | null = null;
  for (const w of prefab.waypoints) {
    if (!w.tag.startsWith('gate')) continue;
    const g = { x: town.x0 + w.x, feetY: town.y0 + w.y };
    if (!best || Math.abs(g.x - column) < Math.abs(best.x - column)) best = g;
  }
  return best;
}

/**
 * Step 7 (part) — stamp the towns: each prefab replaces its rectangle (dry), and every district
 * rectangle that carries a `gloam` level is filled with it (the Citadel is lost to the Gloam).
 * Later steps keep out of town rectangles, so this is what the world starts with.
 */
export function stampTowns(ctx: GenContext): void {
  const { width } = ctx;
  const target = {
    width,
    height: ctx.height,
    setFg: (x: number, y: number, id: number) => {
      const i = y * width + x;
      ctx.fg[i] = id;
      ctx.liquid[i] = 0;
      ctx.liquidType[i] = 0;
    },
    setBg: (x: number, y: number, id: number) => {
      ctx.bg[y * width + x] = id;
    },
    fgAt: (x: number, y: number) => ctx.fg[y * width + x] ?? AIR,
  };
  for (const town of ctx.towns) {
    const def = TOWNS.find((t) => t.key === town.key);
    if (!def) continue;
    const prefab = prefabByKey(def.prefab);
    stampPrefabAt(target, prefab, town.x0, town.y0);
    for (const o of prefab.objects) {
      const level = o.props.gloam;
      if (o.kind !== 'district' || typeof level !== 'number') continue;
      for (let y = town.y0 + o.y0; y <= town.y0 + o.y1; y++) {
        for (let x = town.x0 + o.x0; x <= town.x0 + o.x1; x++) {
          const i = y * width + x;
          if (SOLID[ctx.fg[i] ?? AIR] === 1 || (ctx.bg[i] ?? AIR) !== AIR) ctx.gloam[i] = level;
        }
      }
    }
  }
}
