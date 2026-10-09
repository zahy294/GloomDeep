import { WORLDGEN } from '../../config';
import { DEPTH_LAYERS, SURFACE_BIOMES } from '../../data/biomes';
import { tileId } from '../../data/tiles';
import { valueNoise1, valueNoise2 } from '../../sim/random';
import { layerAt, noiseSeed, stepRandom, type GenContext } from './context';
import { ruins } from './flora';
import { giantTrees } from './giantTrees';

const smoothstep = (t: number) => {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
};

const BIOME_IDS = SURFACE_BIOMES.map((b) => ({
  grass: tileId(b.grass),
  soil: tileId(b.soil),
  subsoil: b.subsoil ? tileId(b.subsoil) : -1,
}));
const LAYER_IDS = DEPTH_LAYERS.map((l) => ({
  rock: tileId(l.rock),
  alt: l.altRock ? tileId(l.altRock) : -1,
}));

/** Step 1 — terrain height: layered smooth noise per column (hilliness is applied in step 2). */
export function terrainHeight(ctx: GenContext): void {
  const base = ctx.height * WORLDGEN.surfaceLevel;
  const seed = noiseSeed(ctx, 1);
  for (let x = 0; x < ctx.width; x++) {
    let hills = 0;
    WORLDGEN.hillOctaves.forEach((o, i) => {
      hills += o.amplitude * (valueNoise1(x / o.wavelength, seed + i) * 2 - 1);
    });
    ctx.surface[x] = Math.round(base + hills);
  }
}

/**
 * Step 2 — biome placement: Elderglade in the middle, Moonpetal Vale and Weeping Mire on either
 * side (which side is seeded), borders wiggled by noise. Each biome scales the hills (the Mire is
 * flat); hilliness blends across borders. The starting glade is flattened around the spawn.
 * Depth layers get their (wiggled) top rows.
 */
export function biomePlacement(ctx: GenContext): void {
  const { width, height } = ctx;
  const random = stepRandom(ctx, 2);
  const moonpetalLeft = random() < 0.5;
  const centreHalf = (width * WORLDGEN.centreBiomeFraction) / 2;
  const mid = width / 2;
  const wiggleSeed = noiseSeed(ctx, 2);
  const leftEdge =
    mid - centreHalf + (valueNoise1(1.5, wiggleSeed) * 2 - 1) * WORLDGEN.biomeBorderWiggle;
  const rightEdge =
    mid + centreHalf + (valueNoise1(7.5, wiggleSeed) * 2 - 1) * WORLDGEN.biomeBorderWiggle;
  const side = moonpetalLeft ? [1, 2] : [2, 1];

  const base = height * WORLDGEN.surfaceLevel;
  for (let x = 0; x < width; x++) {
    const biome = x < leftEdge ? side[0]! : x > rightEdge ? side[1]! : 0;
    ctx.surfaceBiome[x] = biome;
    // Hilliness blends linearly over biomeBlendWidth around each border.
    const blendLeft = smoothstep(
      (x - (leftEdge - WORLDGEN.biomeBlendWidth / 2)) / WORLDGEN.biomeBlendWidth,
    );
    const blendRight = smoothstep(
      (x - (rightEdge - WORLDGEN.biomeBlendWidth / 2)) / WORLDGEN.biomeBlendWidth,
    );
    const hLeft = SURFACE_BIOMES[side[0]!]?.hilliness ?? 1;
    const hCentre = SURFACE_BIOMES[0]?.hilliness ?? 1;
    const hRight = SURFACE_BIOMES[side[1]!]?.hilliness ?? 1;
    const hilliness = hLeft + (hCentre - hLeft) * blendLeft + (hRight - hCentre) * blendRight;
    const surface = ctx.surface[x] ?? base;
    ctx.surface[x] = Math.round(base + (surface - base) * hilliness);
  }

  // Starting glade: flatten towards the centre column's height.
  const centre = Math.floor(mid);
  const centreHeight = ctx.surface[centre] ?? Math.round(base);
  for (let x = 0; x < width; x++) {
    const distance = Math.abs(x - centre) - WORLDGEN.spawnHalfWidth;
    const flatness = 1 - smoothstep(distance / WORLDGEN.spawnBlendWidth);
    const s = ctx.surface[x] ?? centreHeight;
    ctx.surface[x] = Math.round(s + (centreHeight - s) * flatness);
  }
  ctx.spawnArea = {
    x0: centre - WORLDGEN.spawnHalfWidth,
    x1: centre + WORLDGEN.spawnHalfWidth,
    y0: 0,
    y1: centreHeight + WORLDGEN.caveMinDepth,
  };

  DEPTH_LAYERS.forEach((layer, i) => {
    ctx.layerTops[i] = i === 0 ? 0 : Math.round(height * layer.top);
  });
}

/**
 * Step 3 — dirt/stone layers: grass, biome soil and subsoil, then each depth layer's rock with its
 * secondary rock blended in by noise. Layer boundaries wiggle so strata don't look ruled.
 */
export function dirtAndStone(ctx: GenContext): void {
  const { width, height, fg } = ctx;
  const soilSeed = noiseSeed(ctx, 3);
  const wiggleSeed = noiseSeed(ctx, 4);
  const altSeed = noiseSeed(ctx, 5);
  for (let x = 0; x < width; x++) {
    const surface = ctx.surface[x] ?? 0;
    const biome = BIOME_IDS[ctx.surfaceBiome[x] ?? 0] ?? BIOME_IDS[0]!;
    const soilNoise = valueNoise1(x / WORLDGEN.soilWavelength, soilSeed);
    const soilDepth = Math.round(
      WORLDGEN.soilDepthMin + soilNoise * (WORLDGEN.soilDepthMax - WORLDGEN.soilDepthMin),
    );
    ctx.soilDepth[x] = soilDepth;
    const wiggle =
      (valueNoise1(x / WORLDGEN.layerWiggleWavelength, wiggleSeed) * 2 - 1) * WORLDGEN.layerWiggle;
    for (let y = Math.max(0, surface); y < height; y++) {
      const depth = y - surface;
      let id: number;
      if (depth === 0) id = biome.grass;
      else if (depth <= soilDepth) id = biome.soil;
      else if (depth <= soilDepth + WORLDGEN.subsoilDepth && biome.subsoil >= 0) id = biome.subsoil;
      else {
        const layer = LAYER_IDS[layerAt(ctx, Math.round(y + wiggle))] ?? LAYER_IDS[0]!;
        const def = DEPTH_LAYERS[layerAt(ctx, Math.round(y + wiggle))];
        id = layer.rock;
        if (layer.alt >= 0 && def) {
          const n = valueNoise2(
            x / WORLDGEN.altRockWavelength,
            y / WORLDGEN.altRockWavelength,
            altSeed,
          );
          if (n > 1 - def.altRockAmount * WORLDGEN.altRockSpread) id = layer.alt;
        }
      }
      fg[y * width + x] = id;
    }
  }
}

/**
 * Step 7 — structures: giant ancient trees (one at the edge of the starting glade) and small rune
 * ruins (one on the glade).
 * Ruins/shrines/arenas (M5–M12) and town prefabs (M11) plug in here.
 */
export function structures(ctx: GenContext): void {
  giantTrees(ctx);
  ruins(ctx);
}

/**
 * Step 8 — background walls: everything below the grass gets a wall of the column's soil or the
 * layer's base rock (never ore or crystal), so caves have a back wall.
 */
export function backgroundWalls(ctx: GenContext): void {
  const { width, height, bg } = ctx;
  for (let x = 0; x < width; x++) {
    const surface = ctx.surface[x] ?? height;
    const soilDepth = ctx.soilDepth[x] ?? 0;
    const biome = BIOME_IDS[ctx.surfaceBiome[x] ?? 0] ?? BIOME_IDS[0]!;
    for (let y = Math.max(0, surface + 1); y < height; y++) {
      const depth = y - surface;
      const rock = (LAYER_IDS[layerAt(ctx, y)] ?? LAYER_IDS[0]!).rock;
      bg[y * width + x] = depth <= soilDepth ? biome.soil : rock;
    }
  }
}
