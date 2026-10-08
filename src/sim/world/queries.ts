import type { World } from './World';

/**
 * Nearest feet row at or above `ty` in column `tx` where a body `heightTiles` tall fits in open
 * space. Used for debug spawns/teleports so the player never starts inside terrain. Returns `ty`
 * unchanged if no space is found before the top of the world.
 */
export function findOpenFeetRow(world: World, tx: number, ty: number, heightTiles: number): number {
  for (let feet = ty; feet - heightTiles >= 0; feet--) {
    let clear = true;
    for (let dy = 1; dy <= heightTiles && clear; dy++) {
      if (world.isSolid(tx, feet - dy)) clear = false;
    }
    if (clear) return feet;
  }
  return ty;
}
