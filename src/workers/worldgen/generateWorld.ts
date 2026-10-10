import { removeUnsupportedDecor } from './flora';
import { TILE_SIZE } from '../../config';
import { DEPTH_LAYERS } from '../../data/biomes';
import type { GeneratedWorld } from '../../sim/world/worldData';
import { AIR, createContext, isSolidId, type GenContext } from './context';
import {
  backgroundWalls,
  biomePlacement,
  dirtAndStone,
  structures,
  terrainHeight,
} from './surfaceSteps';
import { caves, decorations, initialGloam, liquids, ores, settle } from './undergroundSteps';

/** Player height in tiles that must be free above the spawn. */
const SPAWN_CLEARANCE = 4;

/**
 * Step 12 — validation: the spawn column is open sky down to solid, dry ground (repairing it if a
 * step broke that), and the spawn is recorded. Boss arena reachability joins when arenas exist.
 */
export function validate(ctx: GenContext): void {
  removeUnsupportedDecor(ctx);
  const { width, fg, liquid } = ctx;
  const x = Math.floor(width / 2);
  const ground = ctx.surface[x] ?? 0;
  for (let y = ground - SPAWN_CLEARANCE; y < ground; y++) {
    const i = y * width + x;
    if (y < 0) continue;
    fg[i] = AIR;
    liquid[i] = 0;
  }
  const below = ground * width + x;
  if (!isSolidId(fg[below] ?? AIR)) throw new Error(`Spawn at column ${x} has no ground`);
  ctx.spawnX = (x + 0.5) * TILE_SIZE;
  ctx.spawnY = ground * TILE_SIZE;
}

export interface WorldgenStep {
  /** Shown on the progress screen. */
  readonly label: string;
  readonly run: (ctx: GenContext) => void;
}

/** The 12 steps of plan 3.2, in order. */
export const WORLDGEN_STEPS: readonly WorldgenStep[] = [
  { label: 'Raising the land', run: terrainHeight },
  { label: 'Placing the biomes', run: biomePlacement },
  { label: 'Laying soil and stone', run: dirtAndStone },
  { label: 'Carving caves', run: caves },
  { label: 'Seeding ores and Lumen', run: ores },
  { label: 'Filling pools and lava', run: liquids },
  { label: 'Raising the ancient trees', run: structures },
  { label: 'Building back walls', run: backgroundWalls },
  { label: 'Growing glowcaps and roots', run: decorations },
  { label: 'Spreading the Gloam', run: initialGloam },
  { label: 'Letting things settle', run: settle },
  { label: 'Checking the spawn', run: validate },
];

/**
 * Generates a whole world. Pure and deterministic: the same (width, height, seed) always gives
 * the same arrays (tested). `onProgress(fraction, label)` is called before each step.
 */
export function generateWorld(
  width: number,
  height: number,
  seed: number,
  onProgress: (fraction: number, label: string) => void = () => {},
): GeneratedWorld {
  const ctx = createContext(width, height, seed, DEPTH_LAYERS.length);
  WORLDGEN_STEPS.forEach((step, i) => {
    onProgress(i / WORLDGEN_STEPS.length, step.label);
    step.run(ctx);
  });
  onProgress(1, 'Done');
  return {
    width,
    height,
    arrays: {
      fg: ctx.fg,
      bg: ctx.bg,
      liquid: ctx.liquid,
      liquidType: ctx.liquidType,
      gloam: ctx.gloam,
      surfaceBiome: ctx.surfaceBiome,
      layerTops: ctx.layerTops,
    },
    spawnX: ctx.spawnX,
    spawnY: ctx.spawnY,
    caveMouths: [...ctx.caveMouths],
    towns: ctx.towns.map((t) => ({ ...t })),
    arenas: ctx.arenas.map((a) => ({ ...a })),
  };
}
