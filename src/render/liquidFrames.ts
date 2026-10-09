import { LIQUID as LIQUID_RULES } from '../config';
import { LIQUID } from '../data/biomes';
import type { World } from '../sim/world/World';

/** Fill heights a partly full cell can show (each 16 / LIQUID_LEVELS pixels). */
export const LIQUID_LEVELS = 8;
/** Surface frames come in two wave phases, alternated over time and along the surface. */
export const WAVE_PHASES = 2;
const FRAMES_PER_LIQUID = 1 + LIQUID_LEVELS * WAVE_PHASES;

/**
 * Frame layout of the liquids sheet drawn in BootScene: frame 0 is transparent (TilemapGPULayer
 * samples it for empty cells); then per liquid (water, lava): a full body frame, and surface
 * frames for each fill level and wave phase.
 */
export const LIQUID_FRAME_COUNT = 1 + FRAMES_PER_LIQUID * 2;

export function liquidBase(type: number): number {
  return 1 + (type === LIQUID.lava ? FRAMES_PER_LIQUID : 0);
}

export function surfaceFrame(type: number, level: number, phase: number): number {
  return liquidBase(type) + 1 + (level - 1) * WAVE_PHASES + phase;
}

/** Flame sheet (BootScene): frame 0 empty, then FLAME_FRAMES animation frames. */
export const FLAME_FRAMES = 3;

/**
 * The frame for a cell: a full body under more of the same liquid, otherwise a surface whose
 * height follows the amount (1–8 steps) and whose ripple phase moves along the surface with
 * `waveTick`.
 */
export function liquidFrame(world: World, x: number, y: number, waveTick = 0): number {
  const i = y * world.width + x;
  const type = world.liquidType[i];
  const amount = world.liquid[i] ?? 0;
  if (!type || amount === 0) return -1;
  const covered =
    y > 0 && world.liquidType[i - world.width] === type && (world.liquid[i - world.width] ?? 0) > 0;
  if (covered) return liquidBase(type);
  const level = Math.min(
    LIQUID_LEVELS,
    Math.max(1, Math.ceil((amount / LIQUID_RULES.max) * LIQUID_LEVELS)),
  );
  const phase = (waveTick + (x >> 1)) % WAVE_PHASES;
  return surfaceFrame(type, level, phase);
}
