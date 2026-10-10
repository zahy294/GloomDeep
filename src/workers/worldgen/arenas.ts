import { WORLDGEN } from '../../config';
import { BOSSES, type BossDef } from '../../data/bosses';
import { DEPTH_LAYERS, LIQUID, SURFACE_BIOMES } from '../../data/biomes';
import { prefabByKey } from '../../data/prefabs';
import { TILES, tileId } from '../../data/tiles';
import { WARDS } from '../../data/wards';
import { stampPrefabAt } from '../../sim/world/prefabs';
import { prefabGroundRow, type Prefab } from '../../sim/world/tiled';
import { AIR, inTown, stepRandom, type GenContext, type PlacedTown } from './context';
import { carveWayDown, levelGround, townWayDown, wayDownBand, type WayDown } from './towns';

const SOLID = Uint8Array.from(TILES, (t) => (t.solid ? 1 : 0));
const FULL = 255;

interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

const overlaps = (a: Rect, b: Rect, margin: number) =>
  a.x0 - margin <= b.x1 && b.x0 <= a.x1 + margin && a.y0 - margin <= b.y1 && b.y0 <= a.y1 + margin;

/** Planning order: the centred Heart first, then the surface pool, then the rest. */
const ORDER = (def: BossDef) =>
  def.placement.kind === 'surface' ? 1 : def.placement.side === 'centre' ? 0 : 2;

/**
 * Step 2 (part) — plan the boss arenas (M12, plan 1.4), after the towns: the Gloam Heart's chamber
 * centred under the spawn at the bottom of the world, the Mire Sovereign's pool in the middle of
 * the Weeping Mire, the Moth Matriarch's nest and the Hollow Warden's hall in their layers a set
 * distance from the spawn. Each underground arena gets a way down from the surface (step 4).
 * Candidates are tried until neither the arena nor its tunnel's band runs into a town, another
 * arena, another tunnel's band or the spawn glade.
 */
export function planArenas(ctx: GenContext): void {
  const random = stepRandom(ctx, 23);
  const centre = Math.floor(ctx.width / 2);
  const canopy = ctx.towns.find((t) => t.key === 'canopyhold');
  const townSide = canopy ? Math.sign((canopy.x0 + canopy.x1) / 2 - centre) || 1 : 1;
  const bands: Rect[] = [];
  for (const town of ctx.towns) {
    const way = townWayDown(ctx, town);
    if (way) bands.push(wayDownBand(ctx, way));
  }
  for (const def of [...BOSSES].sort((a, b) => ORDER(a) - ORDER(b))) {
    const prefab = prefabByKey(def.arena);
    const placed =
      def.placement.kind === 'surface'
        ? planSurface(ctx, def, prefab)
        : planUnderground(ctx, def, prefab, random, centre, townSide, bands);
    if (placed) ctx.arenas.push(placed);
  }
}

function planSurface(ctx: GenContext, def: BossDef, prefab: Prefab): PlacedTown | null {
  if (def.placement.kind !== 'surface') return null;
  const biome = SURFACE_BIOMES.findIndex(
    (b) => b.key === (def.placement as { biome: string }).biome,
  );
  // The longest run of the biome's columns; the arena goes in its middle.
  let best = { x0: 0, x1: -1 };
  let start = -1;
  for (let x = 0; x <= ctx.width; x++) {
    const inBiome = x < ctx.width && ctx.surfaceBiome[x] === biome;
    if (inBiome && start < 0) start = x;
    if (!inBiome && start >= 0) {
      if (x - 1 - start > best.x1 - best.x0) best = { x0: start, x1: x - 1 };
      start = -1;
    }
  }
  const margin = WORLDGEN.arenaEdgeMargin;
  if (best.x1 - best.x0 + 1 < prefab.width + 2 * margin) return null;
  const x0 = Math.floor((best.x0 + best.x1 - prefab.width) / 2);
  const level = levelGround(ctx, x0, prefab);
  const y0 = level - prefabGroundRow(prefab);
  const rect = { x0, y0, x1: x0 + prefab.width - 1, y1: y0 + prefab.height - 1 };
  const clash = [...ctx.towns, ...ctx.arenas].some((t) => overlaps(rect, t, WORLDGEN.townMargin));
  if (clash || y0 < 1 || rect.y1 >= ctx.height - 2) return null;
  return { key: def.key, ...rect, surface: true };
}

function planUnderground(
  ctx: GenContext,
  def: BossDef,
  prefab: Prefab,
  random: () => number,
  centre: number,
  townSide: number,
  bands: Rect[],
): PlacedTown | null {
  const p = def.placement;
  if (p.kind !== 'underground') return null;
  const layer = DEPTH_LAYERS.findIndex((l) => l.key === p.layer);
  if (layer < 0) return null;
  const gap = WORLDGEN.arenaLayerGap;
  const ward = WARDS.find((w) => w.layer === p.layer);
  let top = (ctx.layerTops[layer] ?? 0) + gap + (ward?.thickness ?? 0);
  if (layer === 0) {
    // The first layer begins under the soil: keep below the deepest ground and the soil.
    let deepest = 0;
    for (let x = 0; x < ctx.width; x++) deepest = Math.max(deepest, ctx.surface[x] ?? 0);
    top = Math.max(top, deepest + WORLDGEN.caveMinDepth + gap);
  }
  const bottom = (ctx.layerTops[layer + 1] ?? ctx.height - WORLDGEN.arenaEdgeMargin) - gap;
  const yMax = bottom - prefab.height;
  if (yMax < top) return null;
  const y0 = Math.round(top + (yMax - top) * p.depth);
  const margin = WORLDGEN.townMargin;
  const gates = prefab.objects.filter((o) => o.kind === 'gate');
  const glade = WORLDGEN.spawnHalfWidth + WORLDGEN.caveEntrances.mouthRadius;
  for (let attempt = 0; attempt < WORLDGEN.arenaAttempts; attempt++) {
    let x0: number;
    if (p.side === 'centre') {
      x0 = centre - Math.floor(prefab.width / 2);
    } else {
      const preferred = p.side === 'towns' ? townSide : -townSide;
      // The preferred side first; the other side if that keeps failing.
      const side = attempt < WORLDGEN.arenaAttempts / 2 ? preferred : -preferred;
      const offset = Math.round(p.minOffset + random() * (p.maxOffset - p.minOffset));
      x0 = side > 0 ? centre + offset : centre - offset - prefab.width + 1;
    }
    const rect = { x0, y0, x1: x0 + prefab.width - 1, y1: y0 + prefab.height - 1 };
    const edge = WORLDGEN.arenaEdgeMargin;
    if (rect.x0 < edge || rect.x1 >= ctx.width - edge || rect.y1 >= ctx.height - edge) continue;
    const structures = [...ctx.towns, ...ctx.arenas];
    if (structures.some((t) => overlaps(rect, t, margin))) continue;
    if (bands.some((b) => overlaps(rect, b, margin))) continue;
    // A way down from one of its gates whose band is clear of everything and the glade.
    const way = gates
      .map((g): WayDown => {
        const x = x0 + g.x0;
        return { x, feetY: y0 + g.y0, out: x < (rect.x0 + rect.x1) / 2 ? -1 : 1 };
      })
      .find((w) => {
        const band = wayDownBand(ctx, w);
        if (band.x0 <= centre + glade && band.x1 >= centre - glade) return false;
        return ![...structures, rect].some((t) => overlaps(band, t, margin));
      });
    if (!way) continue;
    bands.push(wayDownBand(ctx, way));
    ctx.arenaWays.push(way);
    return { key: def.key, ...rect };
  }
  return null;
}

/** Step 4 (part) — the ways down to the underground arenas (planned with them). */
export function arenaTunnels(
  ctx: GenContext,
  carveTunnel: (cx: number, cy: number, radius: number) => void,
): void {
  const random = stepRandom(ctx, 24);
  for (const way of ctx.arenaWays) carveWayDown(ctx, way, random, carveTunnel);
}

/**
 * Step 7 (part) — stamp the arenas (each prefab replaces its rectangle; `gloam` rectangles fill
 * with their level; the Mire's pool fills to the Sovereign's resting depth), then lay the wards:
 * bands of warded stone across the whole width at the top of their layers (M12).
 */
export function stampArenas(ctx: GenContext): void {
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
  for (const arena of ctx.arenas) {
    const def = BOSSES.find((b) => b.key === arena.key);
    if (!def) continue;
    const prefab = prefabByKey(def.arena);
    stampPrefabAt(target, prefab, arena.x0, arena.y0);
    for (const o of prefab.objects) {
      const level = o.props.gloam;
      if (o.kind === 'gloam' && typeof level === 'number') {
        for (let y = arena.y0 + o.y0; y <= arena.y0 + o.y1; y++) {
          for (let x = arena.x0 + o.x0; x <= arena.x0 + o.x1; x++) {
            const i = y * width + x;
            if (SOLID[ctx.fg[i] ?? AIR] === 1 || (ctx.bg[i] ?? AIR) !== AIR) ctx.gloam[i] = level;
          }
        }
      }
      if (o.kind === 'pool' && def.script === 'mire') {
        for (let y = arena.y0 + o.y1 - def.startLevel + 1; y <= arena.y0 + o.y1; y++) {
          for (let x = arena.x0 + o.x0; x <= arena.x0 + o.x1; x++) {
            const i = y * width + x;
            if (SOLID[ctx.fg[i] ?? AIR] === 1) continue;
            ctx.liquid[i] = FULL;
            ctx.liquidType[i] = LIQUID.water;
          }
        }
      }
    }
  }
  for (const ward of WARDS) {
    const layer = DEPTH_LAYERS.findIndex((l) => l.key === ward.layer);
    const top = ctx.layerTops[layer];
    if (layer < 0 || top === undefined) continue;
    const id = tileId(ward.tile);
    for (let y = top; y < Math.min(ctx.height - 1, top + ward.thickness); y++) {
      for (let x = 0; x < width; x++) {
        if (inTown(ctx, x, y)) continue;
        const i = y * width + x;
        ctx.fg[i] = id;
        ctx.liquid[i] = 0;
        ctx.liquidType[i] = 0;
      }
    }
  }
}
