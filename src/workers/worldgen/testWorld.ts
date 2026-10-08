import { TEST_WORLD, TILE_SIZE } from '../../config';
import { tileId } from '../../data/tiles';
import { valueNoise1, valueNoise2 } from '../../sim/random';
import { AIR, type World } from '../../sim/world/World';

export type TestWorldParams = typeof TEST_WORLD;

export interface GeneratedWorld {
  /** Player spawn, feet-centre, in pixels. */
  spawnX: number;
  spawnY: number;
}

/** Offsets added to the seed so hills, soil and caves use unrelated noise. */
const STREAM = {
  hills: 101,
  soil: 202,
  caves: 303,
  caves2: 304,
  moss: 405,
  crystals: 506,
} as const;

const smoothstep = (t: number) => {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
};

function hillsAt(x: number, seed: number, p: TestWorldParams): number {
  let hills = 0;
  p.hillOctaves.forEach((o, i) => {
    hills += o.amplitude * (valueNoise1(x / o.wavelength, seed + STREAM.hills + i) * 2 - 1);
  });
  return hills;
}

/** Surface row (first solid tile) for column x. Flattens towards the centre for the spawn clearing. */
function surfaceAt(x: number, world: World, seed: number, p: TestWorldParams): number {
  const centre = Math.floor(world.width / 2);
  const distance = Math.abs(x - centre) - p.flatSpawnHalfWidth;
  const flatness = 1 - smoothstep(distance / p.flatSpawnBlendWidth);
  const hills = hillsAt(x, seed, p) * (1 - flatness) + hillsAt(centre, seed, p) * flatness;
  return Math.round(world.height * p.surfaceLevel + hills);
}

/**
 * M1 test world: rolling hills, soil over stone, noise caves, moss and crystal patches.
 * Writes the World arrays directly (bulk generation), then marks every chunk changed.
 * Real world generation (12 steps, in a worker) replaces this in M4.
 */
export function generateTestWorld(
  world: World,
  seed: number,
  p: TestWorldParams = TEST_WORLD,
): GeneratedWorld {
  const GRASS = tileId('elderglade_grass');
  const SOIL = tileId('forest_soil');
  const STONE = tileId('stone');
  const MOSS = tileId('moss');
  const CRYSTAL = tileId('lumen_crystal');
  const { width, height, fg, bg } = world;
  const caveWl = p.caveWavelength;
  const caveDetailWl = p.caveWavelength / p.caveDetailRatio;

  for (let x = 0; x < width; x++) {
    const surface = surfaceAt(x, world, seed, p);
    const soilNoise = valueNoise1(x / p.soilWavelength, seed + STREAM.soil);
    const soilDepth = Math.round(p.soilDepthMin + soilNoise * (p.soilDepthMax - p.soilDepthMin));

    for (let y = Math.max(0, surface); y < height; y++) {
      const depth = y - surface;
      const i = y * width + x;

      let id: number;
      if (depth === 0) id = GRASS;
      else if (depth <= soilDepth) id = SOIL;
      else if (
        depth >= p.crystalMinDepth &&
        valueNoise2(x / p.crystalWavelength, y / p.crystalWavelength, seed + STREAM.crystals) >
          p.crystalNoiseThreshold
      ) {
        id = CRYSTAL;
      } else if (
        valueNoise2(x / p.mossWavelength, y / p.mossWavelength, seed + STREAM.moss) >
        p.mossNoiseThreshold
      ) {
        id = MOSS;
      } else id = STONE;

      // Background walls sit behind everything underground so caves aren't see-through.
      bg[i] = depth === 0 ? AIR : depth <= soilDepth ? SOIL : STONE;

      if (depth >= p.caveMinDepth) {
        const cave =
          valueNoise2(x / caveWl, y / caveWl, seed + STREAM.caves) * (1 - p.caveDetailWeight) +
          valueNoise2(x / caveDetailWl, y / caveDetailWl, seed + STREAM.caves2) *
            p.caveDetailWeight;
        if (cave > p.caveThreshold) id = AIR;
      }
      fg[i] = id;
    }
  }

  world.touchAll();

  const spawnTileX = Math.floor(width / 2);
  const spawnSurface = surfaceAt(spawnTileX, world, seed, p);
  return { spawnX: (spawnTileX + 0.5) * TILE_SIZE, spawnY: spawnSurface * TILE_SIZE };
}
