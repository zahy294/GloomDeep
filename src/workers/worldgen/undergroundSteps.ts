import { WORLDGEN } from '../../config';
import { DEPTH_LAYERS, LIQUID, SURFACE_BIOMES } from '../../data/biomes';
import { TILES, tileId } from '../../data/tiles';
import { valueNoise2 } from '../../sim/random';
import { fairyRings, flora } from './flora';
import { townTunnels } from './towns';
import { placeWaterfalls } from './waterfalls';
import {
  AIR,
  inProtected,
  inTown,
  inTownColumns,
  isSolidId,
  layerAt,
  noiseSeed,
  stepRandom,
  T,
  type GenContext,
} from './context';

const FULL = 255;
const LAYER_ORES = DEPTH_LAYERS.map((l) => l.ores.map((o) => ({ ...o, id: tileId(o.tile) })));
const LAYER_ROCKS = DEPTH_LAYERS.map((l) => {
  const rocks = new Set([tileId(l.rock)]);
  if (l.altRock) rocks.add(tileId(l.altRock));
  return rocks;
});
const LAYER_FEATURE = DEPTH_LAYERS.map((l) => (l.feature ? tileId(l.feature) : -1));
/** Ore id → the veiled tile that hides it (Azure lens), if any. */
const VEILED_FORM = new Map(
  TILES.flatMap((t) => (t.veiled && !t.intangible ? [[tileId(t.veiled), t.id] as const] : [])),
);
const VEILED_PLATFORM = TILES.find((t) => t.intangible && t.veiled)?.id ?? -1;

/** Underground = below the soil (caves never cut the grass or soil near the surface). */
function caveAllowed(ctx: GenContext, x: number, y: number): boolean {
  const surface = ctx.surface[x] ?? ctx.height;
  return y - surface >= WORLDGEN.caveMinDepth && !inProtected(ctx, x, y) && y < ctx.height - 1;
}

function carve(ctx: GenContext, cx: number, cy: number, radius: number): void {
  const r = Math.ceil(radius);
  for (let y = cy - r; y <= cy + r; y++) {
    for (let x = cx - r; x <= cx + r; x++) {
      if (x < 1 || x >= ctx.width - 1 || y < 1) continue;
      if ((x - cx) ** 2 + (y - cy) ** 2 > radius * radius) continue;
      if (caveAllowed(ctx, x, y)) ctx.fg[y * ctx.width + x] = AIR;
    }
  }
}

/**
 * Step 4 — caves: blended noise caves (per-layer threshold), large caverns from low-frequency
 * noise, and random-walk "worm" tunnels that link them.
 */
export function caves(ctx: GenContext): void {
  const { width, height, fg } = ctx;
  const s1 = noiseSeed(ctx, 41);
  const s2 = noiseSeed(ctx, 42);
  const s3 = noiseSeed(ctx, 43);
  const wl = WORLDGEN.caveWavelength;
  const detail = wl / WORLDGEN.caveDetailRatio;
  for (let y = 0; y < height; y++) {
    const threshold = DEPTH_LAYERS[layerAt(ctx, y)]!.caveThreshold;
    for (let x = 0; x < width; x++) {
      if (!caveAllowed(ctx, x, y)) continue;
      const n =
        valueNoise2(x / wl, y / wl, s1) * (1 - WORLDGEN.caveDetailWeight) +
        valueNoise2(x / detail, y / detail, s2) * WORLDGEN.caveDetailWeight;
      const cavern = valueNoise2(x / WORLDGEN.cavernWavelength, y / WORLDGEN.cavernWavelength, s3);
      if (n > threshold || cavern > WORLDGEN.cavernThreshold) fg[y * width + x] = AIR;
    }
  }

  caveEntrances(ctx);
  townTunnels(ctx, (cx, cy, r) => carveTunnel(ctx, cx, cy, r));

  const random = stepRandom(ctx, 4);
  const worms = Math.round((width / 1000) * WORLDGEN.wormsPerThousandColumns);
  for (let w = 0; w < worms; w++) {
    let x = WORLDGEN.wormEdgeMargin + random() * (width - 2 * WORLDGEN.wormEdgeMargin);
    let y =
      (ctx.surface[Math.floor(x)] ?? 0) +
      WORLDGEN.caveMinDepth +
      random() * (height * WORLDGEN.wormStartDepthFraction);
    let angle = random() * Math.PI * 2;
    const length =
      WORLDGEN.wormLengthMin + random() * (WORLDGEN.wormLengthMax - WORLDGEN.wormLengthMin);
    const radius =
      WORLDGEN.wormRadiusMin + random() * (WORLDGEN.wormRadiusMax - WORLDGEN.wormRadiusMin);
    for (let i = 0; i < length; i++) {
      carve(ctx, Math.round(x), Math.round(y), radius);
      angle += (random() - 0.5) * WORLDGEN.wormTurn;
      x += Math.cos(angle);
      y += Math.sin(angle) * WORLDGEN.wormVerticalScale;
      if (x < 2 || x > width - 3 || y < 2 || y > height - 3) break;
    }
  }
}

/**
 * Cave entrances (part of step 4): tunnels that open at the surface and wind down into the
 * depths in walkable switchbacks, like the cave mouths of other sandbox games. One opens a short
 * walk from the spawn. They are carved before the noise caves' rule `caveMinDepth` applies, so they
 * cut through the soil; the spawn glade stays protected.
 */
function caveEntrances(ctx: GenContext): void {
  const cfg = WORLDGEN.caveEntrances;
  const { width, height } = ctx;
  const random = stepRandom(ctx, 14);
  const centre = Math.floor(width / 2);
  const margin = WORLDGEN.wormEdgeMargin + cfg.spacing / 2;
  const mouths: number[] = [];
  const free = (x: number) =>
    x > margin &&
    x < width - margin &&
    Math.abs(x - centre) > WORLDGEN.spawnHalfWidth + cfg.mouthRadius &&
    !inTownColumns(ctx, x, cfg.mouthRadius + WORLDGEN.townMargin) &&
    mouths.every((m) => Math.abs(m - x) >= cfg.spacing);
  // The one near the spawn first.
  const side = random() < 0.5 ? -1 : 1;
  const near =
    centre + side * Math.round(cfg.nearSpawnMin + random() * (cfg.nearSpawnMax - cfg.nearSpawnMin));
  if (free(near)) mouths.push(near);
  const wanted = Math.max(1, Math.round((width / 1000) * cfg.perThousandColumns));
  for (let tries = 0; tries < wanted * 20 && mouths.length < wanted; tries++) {
    const x = Math.floor(random() * width);
    if (free(x)) mouths.push(x);
  }
  const bottom = Math.floor(height * cfg.depthFraction);
  for (const mouth of mouths) {
    ctx.caveMouths.push(mouth);
    let x = mouth;
    let y = (ctx.surface[mouth] ?? 0) - 1;
    let dir = random() < 0.5 ? -1 : 1;
    let slope = cfg.minSlope + random() * (cfg.maxSlope - cfg.minSlope);
    let untilTurn = cfg.switchbackMin + random() * (cfg.switchbackMax - cfg.switchbackMin);
    for (let step = 0; step < cfg.maxSteps && y < bottom; step++) {
      const surface = ctx.surface[Math.round(x)] ?? 0;
      const r =
        y < surface + 2
          ? cfg.mouthRadius
          : random() < cfg.chamberChance
            ? cfg.chamberRadius
            : cfg.radius;
      carveTunnel(ctx, Math.round(x), Math.round(y), r);
      slope = Math.min(cfg.maxSlope, Math.max(cfg.minSlope, slope + (random() - 0.5) * cfg.turn));
      x += Math.cos(slope) * dir;
      y += Math.sin(slope);
      // Turn back at the world's edges and at the protected spawn glade (carving skips it).
      const glade = Math.abs(x + dir * cfg.mouthRadius - centre) <= WORLDGEN.spawnHalfWidth;
      if (--untilTurn <= 0 || x < margin || x > width - margin || glade) {
        dir = -dir as 1 | -1;
        untilTurn = cfg.switchbackMin + random() * (cfg.switchbackMax - cfg.switchbackMin);
      }
    }
  }
}

/**
 * Carves an open disc (for entrances: allowed above caveMinDepth, never in the spawn glade), and
 * firms up loose silt and gravel in a ring around it into stone, so settling can't plug the
 * tunnel and its roof holds.
 */
function carveTunnel(ctx: GenContext, cx: number, cy: number, radius: number): void {
  const firm = WORLDGEN.caveEntrances.firmRing;
  const outer = radius + firm;
  const r = Math.ceil(outer);
  for (let y = cy - r; y <= cy + r; y++) {
    for (let x = cx - r; x <= cx + r; x++) {
      if (x < 1 || x >= ctx.width - 1 || y < 1 || y >= ctx.height - 1) continue;
      const d2 = (x - cx) ** 2 + (y - cy) ** 2;
      if (d2 > outer * outer || inProtected(ctx, x, y)) continue;
      const i = y * ctx.width + x;
      if (d2 <= radius * radius) ctx.fg[i] = AIR;
      else if (ctx.fg[i] === T.silt || ctx.fg[i] === T.gravel) ctx.fg[i] = T.stone;
    }
  }
}

/**
 * Step 5 — ores and Lumen crystals: random-walk veins placed in each layer's rock, with counts
 * from the layer's ore densities (plan: "by depth and biome").
 */
export function ores(ctx: GenContext): void {
  const { width, height, fg } = ctx;
  const random = stepRandom(ctx, 5);
  for (let layer = 0; layer < DEPTH_LAYERS.length; layer++) {
    const top = Math.max(ctx.layerTops[layer] ?? 0, 1);
    const bottom = Math.min(ctx.layerTops[layer + 1] ?? height, height - 1);
    const cells = (bottom - top) * width;
    const rocks = LAYER_ROCKS[layer]!;
    for (const ore of LAYER_ORES[layer] ?? []) {
      const veins = Math.round((cells * ore.density) / WORLDGEN.veinCells);
      for (let v = 0; v < veins; v++) {
        let x = Math.floor(random() * width);
        let y = top + Math.floor(random() * (bottom - top));
        const size = Math.max(
          1,
          Math.round(
            ore.size * ore.size * WORLDGEN.veinSizeScale * (WORLDGEN.veinSizeRandomMin + random()),
          ),
        );
        // Some veins hide from plain sight: only the Azure lens shows what they are.
        const veiled = VEILED_FORM.get(ore.id);
        const id = veiled !== undefined && random() < WORLDGEN.veiledVeinChance ? veiled : ore.id;
        for (let i = 0; i < size; i++) {
          if (x > 0 && x < width - 1 && y > top && y < bottom) {
            const idx = y * width + x;
            if (rocks.has(fg[idx] ?? AIR)) fg[idx] = id;
          }
          const dir = Math.floor(random() * 4);
          x += dir === 0 ? 1 : dir === 1 ? -1 : 0;
          y += dir === 2 ? 1 : dir === 3 ? -1 : 0;
        }
      }
    }
  }
}

/**
 * Step 6 — liquids: water pools in surface dips (chance per biome — the Mire is wet), and
 * underground lakes of each layer's liquid (water, lava at depth) in low cave pockets.
 * Static until the liquid simulation (M9).
 */
export function liquids(ctx: GenContext): void {
  const { width, height, fg, liquid, liquidType } = ctx;
  const random = stepRandom(ctx, 6);

  // Surface pools: from each local minimum of the surface (rows grow downwards), climb each side
  // to its rim (the highest point before the ground falls again) and fill up to the lower rim.
  for (let x = 2; x < width - 2; x++) {
    const s = ctx.surface[x] ?? 0;
    if (!((ctx.surface[x - 1] ?? 0) < s && (ctx.surface[x + 1] ?? 0) <= s)) continue;
    if (inProtected(ctx, x, s - 1)) continue;
    const biome = SURFACE_BIOMES[ctx.surfaceBiome[x] ?? 0];
    if (!biome || random() > biome.poolChance) continue;
    let left = x;
    let right = x;
    while (
      left > 0 &&
      x - left < WORLDGEN.poolMaxWidth &&
      (ctx.surface[left - 1] ?? 0) <= (ctx.surface[left] ?? 0)
    )
      left--;
    while (
      right < width - 1 &&
      right - x < WORLDGEN.poolMaxWidth &&
      (ctx.surface[right + 1] ?? 0) <= (ctx.surface[right] ?? 0)
    )
      right++;
    const leftRim = ctx.surface[left] ?? s;
    const rightRim = ctx.surface[right] ?? s;
    const level = Math.max(leftRim, rightRim); // larger row = lower; fill below the lower rim
    for (let px = left; px <= right; px++) {
      const floor = ctx.surface[px] ?? 0;
      for (let y = level; y < floor; y++) {
        const i = y * width + px;
        if (fg[i] !== AIR) continue;
        liquid[i] = FULL;
        liquidType[i] = LIQUID.water;
      }
    }
  }

  // Underground lakes: cave air in high lake-noise areas, filled bottom-up so pools rest on floors.
  const lakeSeed = noiseSeed(ctx, 61);
  for (let y = height - 2; y > 0; y--) {
    const layer = DEPTH_LAYERS[layerAt(ctx, y)];
    if (!layer?.liquid) continue;
    const type = LIQUID[layer.liquid];
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      if (fg[i] !== AIR || !caveAllowed(ctx, x, y)) continue;
      if (
        valueNoise2(x / WORLDGEN.lakeWavelength, y / WORLDGEN.lakeWavelength, lakeSeed) <
        WORLDGEN.lakeThreshold
      )
        continue;
      const below = i + width;
      if (isSolidId(fg[below] ?? AIR) || (liquid[below] ?? 0) > 0) {
        liquid[i] = FULL;
        liquidType[i] = type;
      }
    }
  }
}

/**
 * Step 9 — decorations and flora: each layer's signature feature (glowcaps, roots, crystals) grows
 * in clumps on cave rock, then flora (grass, flowers, saplings, glowing plants, hanging moss) is
 * placed by the rules in src/data/flora.ts.
 */
export function decorations(ctx: GenContext): void {
  caveFeatures(ctx);
  flora(ctx);
  fairyRings(ctx);
}

/**
 * Veiled spirit platforms (Azure lens secrets): a pit cut into a flat stretch of cave floor and a
 * row of unseen, untouchable platform tiles across its top, flush with the floor. Azure light
 * turns them into real platforms; without it you drop into the pit.
 */
function spiritBridges(ctx: GenContext): void {
  if (VEILED_PLATFORM < 0) return;
  const { width, height, fg, liquid } = ctx;
  const cfg = WORLDGEN.spiritBridges;
  const random = stepRandom(ctx, 13);
  const wanted = Math.round((width / 1000) * cfg.perThousandColumns);
  const air = (x: number, y: number) =>
    fg[y * width + x] === AIR && (liquid[y * width + x] ?? 0) === 0;
  const solid = (x: number, y: number) => isSolidId(fg[y * width + x] ?? AIR);
  let placed = 0;
  for (let attempt = 0; attempt < wanted * cfg.attemptsPerBridge && placed < wanted; attempt++) {
    const span = cfg.minSpan + Math.floor(random() * (cfg.maxSpan - cfg.minSpan + 1));
    const depth = cfg.pitDepthMin + Math.floor(random() * (cfg.pitDepthMax - cfg.pitDepthMin + 1));
    // Drop from a random cave cell to the floor below it.
    const x = 2 + Math.floor(random() * (width - 4));
    let y = 2 + Math.floor(random() * (height - 4));
    if (!air(x, y) || !caveAllowed(ctx, x, y)) continue;
    while (y < height - depth - 3 && air(x, y + 1)) y++;
    const floor = y + 1;
    const x0 = x - (span >> 1);
    if (x0 < 2 || x0 + span >= width - 2 || floor + depth >= height - 2) continue;
    // A flat floor row with open air above, one tile wider than the pit on each side.
    let ok = true;
    for (let x = x0 - 1; x <= x0 + span && ok; x++) {
      ok = solid(x, floor) && air(x, floor - 1) && air(x, floor - 2) && caveAllowed(ctx, x, floor);
    }
    if (!ok) continue;
    // Cut the pit through solid rock only (no breaking into another cave or a pool).
    // ...including a rock floor under it and rock walls either side.
    for (let y = floor; y <= floor + depth && ok; y++) {
      for (let x = x0 - 1; x <= x0 + span && ok; x++) ok = solid(x, y) && caveAllowed(ctx, x, y);
    }
    if (!ok) continue;
    for (let y = floor + 1; y < floor + depth; y++) {
      for (let x = x0; x < x0 + span; x++) fg[y * width + x] = AIR;
    }
    for (let x = x0; x < x0 + span; x++) fg[floor * width + x] = VEILED_PLATFORM;
    placed++;
  }
}

/** Each layer's signature feature in small clumps on cave floors, walls and ceilings. */
function caveFeatures(ctx: GenContext): void {
  const { width, height, fg, liquid } = ctx;
  const random = stepRandom(ctx, 9);
  // Neighbour offsets and a scratch list, allocated once (this loop visits every cell).
  const steps = [width, -width, -1, 1] as const;
  const faces = [0, 0, 0, 0];
  for (let y = 2; y < height - 2; y++) {
    const layer = layerAt(ctx, y);
    const feature = LAYER_FEATURE[layer] ?? -1;
    const amount = DEPTH_LAYERS[layer]?.featureAmount ?? 0;
    if (feature < 0 || amount <= 0) continue;
    for (let x = 2; x < width - 2; x++) {
      const i = y * width + x;
      // A cave-air cell touching rock: the rock face gets a clump.
      if (fg[i] !== AIR || (liquid[i] ?? 0) > 0 || !caveAllowed(ctx, x, y)) continue;
      if (random() > amount * WORLDGEN.featureChanceScale) continue;
      let faceCount = 0;
      for (const d of steps) if (isSolidId(fg[i + d] ?? AIR)) faces[faceCount++] = i + d;
      if (faceCount === 0) continue;
      const face = faces[Math.floor(random() * faceCount)] ?? i;
      let j = face;
      const size = 1 + Math.floor(random() * WORLDGEN.featureClumpMax);
      for (let k = 0; k < size; k++) {
        if (isSolidId(fg[j] ?? AIR)) fg[j] = feature;
        const step = steps[Math.floor(random() * steps.length)] ?? 1;
        if (j + step > width && j + step < width * (height - 1)) j += step;
      }
    }
  }
}

/** Step 10 — initial Gloam: per-layer strength, with noise, strongest at the bottom (plan 1.4). */
export function initialGloam(ctx: GenContext): void {
  const { width, height, gloam } = ctx;
  const seed = noiseSeed(ctx, 10);
  for (let y = 0; y < height; y++) {
    const strength = DEPTH_LAYERS[layerAt(ctx, y)]?.gloam ?? 0;
    if (strength <= 0) continue;
    for (let x = 0; x < width; x++) {
      if (inTown(ctx, x, y)) continue; // a town's Gloam comes with its prefab
      const n = valueNoise2(x / WORLDGEN.gloamWavelength, y / WORLDGEN.gloamWavelength, seed);
      gloam[y * width + x] = Math.round(
        Math.min(1, strength * (WORLDGEN.gloamNoiseBase + n)) * 255,
      );
    }
  }
}

/**
 * Step 11 — settle: liquids and loose silt/gravel fall until something holds them, so the world
 * starts at rest (the real simulations come in M9). One bottom-up compaction pass per column is
 * exact: everything that can fall drops onto the next free cell above the last support.
 * Waterfalls (plan 2.7) are cut in last, once nothing else will move.
 */
export function settle(ctx: GenContext): void {
  const { width, height, fg, liquid, liquidType } = ctx;
  for (let x = 0; x < width; x++) {
    let free = -1; // lowest empty row an item could fall into, or -1 if none below
    for (let y = height - 1; y >= 0; y--) {
      const i = y * width + x;
      const id = fg[i] ?? AIR;
      const wet = (liquid[i] ?? 0) > 0;
      const falls = id === T.silt || id === T.gravel || (id === AIR && wet);
      if (id === AIR && !wet) {
        if (free === -1) free = y;
      } else if (!falls) {
        free = -1;
      } else if (free !== -1) {
        const j = free * width + x;
        fg[j] = id;
        liquid[j] = liquid[i] ?? 0;
        liquidType[j] = liquidType[i] ?? 0;
        fg[i] = AIR;
        liquid[i] = 0;
        liquidType[i] = 0;
        free--; // the cell above the landed item is the next free one (it was empty or is this one)
      }
    }
  }
  // After the settling, so no loose silt or gravel comes to rest on an unseen platform.
  spiritBridges(ctx);
  placeWaterfalls(ctx);
}
