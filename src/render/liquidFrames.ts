import { LIQUID } from '../data/biomes';
import type { World } from '../sim/world/World';

/**
 * Frame layout of the liquids sheet drawn in BootScene: frame 0 is transparent (TilemapGPULayer
 * samples it for empty cells), then body and surface frames per liquid.
 */
export const LIQUID_FRAME = {
  waterBody: 1,
  waterSurface: 2,
  lavaBody: 3,
  lavaSurface: 4,
} as const;

export const LIQUID_FRAME_COUNT = 5;

/**
 * Static liquid frames until liquids flow (M9): a cell is a surface when the cell above holds no
 * liquid of the same type. Partial amounts draw as full cells for now.
 */
export function liquidFrame(world: World, x: number, y: number): number {
  const i = y * world.width + x;
  const type = world.liquidType[i];
  if (!type) return -1;
  const surface = y === 0 || world.liquidType[i - world.width] !== type;
  if (type === LIQUID.lava) return surface ? LIQUID_FRAME.lavaSurface : LIQUID_FRAME.lavaBody;
  return surface ? LIQUID_FRAME.waterSurface : LIQUID_FRAME.waterBody;
}
