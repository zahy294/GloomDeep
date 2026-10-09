import { GLOAM } from '../config';
import { variationAt } from '../sim/world/autotile';
import type { World } from '../sim/world/World';

/** Vein variations per Gloam level in the boot-drawn `gloam` sheet. */
export const GLOAM_VARIATIONS = 4;
/** Frame 0 is transparent (TilemapGPULayer samples it for empty cells), then levels × variations. */
export const GLOAM_FRAME_COUNT = 1 + GLOAM.visibleLevels.length * GLOAM_VARIATIONS;

/** How thick the Gloam at a level looks: 0 = none, 1..visibleLevels.length = vein frames. */
export function gloamLevel(value: number): number {
  let level = 0;
  for (const threshold of GLOAM.visibleLevels) if (value >= threshold) level++;
  return level;
}

/** Overlay frame for the Gloam at (x, y), or -1 where there's too little to show. */
export function gloamFrame(world: World, x: number, y: number): number {
  const level = gloamLevel(world.gloam[y * world.width + x] ?? 0);
  if (level === 0) return -1;
  return 1 + (level - 1) * GLOAM_VARIATIONS + (variationAt(x, y) % GLOAM_VARIATIONS);
}

/** Sampling step (tiles) when measuring how much of the view the Gloam covers. */
const COVERAGE_STEP = 3;

/**
 * Fraction 0..1 of the cells in a view rectangle (pixels) that show Gloam, sampled on a grid.
 * Drives the colour drain of the camera grade.
 */
export function gloamCoverage(
  world: World,
  view: { x: number; y: number; width: number; height: number },
  tileSize: number,
): number {
  const x0 = Math.max(0, Math.floor(view.x / tileSize));
  const y0 = Math.max(0, Math.floor(view.y / tileSize));
  const x1 = Math.min(world.width - 1, Math.floor((view.x + view.width) / tileSize));
  const y1 = Math.min(world.height - 1, Math.floor((view.y + view.height) / tileSize));
  let seen = 0;
  let covered = 0;
  for (let y = y0; y <= y1; y += COVERAGE_STEP) {
    for (let x = x0; x <= x1; x += COVERAGE_STEP) {
      seen++;
      if ((world.gloam[y * world.width + x] ?? 0) >= (GLOAM.visibleLevels[0] ?? 0)) covered++;
    }
  }
  return seen > 0 ? covered / seen : 0;
}
