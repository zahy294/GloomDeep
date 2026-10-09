import type { Prefab } from '../../data/prefabs/houses';
import { tileId } from '../../data/tiles';
import { AIR, type World } from './World';

/**
 * Stamps a prefab with its bottom-left cell at (x, bottom): clears the footprint and the rows
 * above it (`headroom`), sets every cell from the legend, and fills under the bottom row down to
 * solid ground with the foundation tile. Goes through world.set so systems hear about it.
 */
export function stampPrefab(
  world: World,
  prefab: Prefab,
  x: number,
  bottom: number,
  headroom: number,
): void {
  const height = prefab.rows.length;
  const width = Math.max(...prefab.rows.map((r) => r.length));
  const top = bottom - height + 1;
  for (let y = top - headroom; y <= bottom; y++) {
    for (let dx = 0; dx < width; dx++) {
      if (!world.inBounds(x + dx, y)) continue;
      world.set(x + dx, y, AIR);
      world.setBg(x + dx, y, AIR);
    }
  }
  const foundation = tileId(prefab.foundation);
  for (let dx = 0; dx < width; dx++) {
    for (let y = bottom + 1; world.inBounds(x + dx, y) && !world.isSolid(x + dx, y); y++) {
      world.set(x + dx, y, foundation);
    }
  }
  prefab.rows.forEach((row, r) => {
    for (let dx = 0; dx < row.length; dx++) {
      const cell = prefab.legend[row[dx] ?? '.'];
      if (!cell || !world.inBounds(x + dx, top + r)) continue;
      if (cell.bg) world.setBg(x + dx, top + r, tileId(cell.bg));
      if (cell.fg) world.set(x + dx, top + r, tileId(cell.fg));
    }
  });
}
