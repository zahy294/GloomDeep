import { TILES, tileId } from '../../data/tiles';
import type { Prefab } from './tiled';
import { AIR, type World } from './World';

const SOLID = Uint8Array.from(TILES, (t) => (t.solid ? 1 : 0));

/** Where a prefab is written: the live World (debug starts) or worldgen's raw arrays. */
export interface StampTarget {
  readonly width: number;
  readonly height: number;
  setFg(x: number, y: number, id: number): void;
  setBg(x: number, y: number, id: number): void;
  fgAt(x: number, y: number): number;
}

/** Tile ids for a prefab's cells, resolved once per prefab. */
const resolved = new WeakMap<Prefab, { fg: Uint16Array; bg: Uint16Array; foundation: number }>();

function ids(prefab: Prefab): { fg: Uint16Array; bg: Uint16Array; foundation: number } {
  let r = resolved.get(prefab);
  if (!r) {
    const f = prefab.props.foundation;
    r = {
      fg: Uint16Array.from(prefab.fg, (k) => (k ? tileId(k) : AIR)),
      bg: Uint16Array.from(prefab.bg, (k) => (k ? tileId(k) : AIR)),
      foundation: typeof f === 'string' && f ? tileId(f) : AIR,
    };
    resolved.set(prefab, r);
  }
  return r;
}

/**
 * Writes a prefab with its top-left cell at (x0, y0): every cell of its rectangle is replaced
 * (empty cells become air), then each column is filled under the bottom row with the map's
 * `foundation` tile down to solid ground, so a prefab never floats.
 */
export function stampPrefabAt(target: StampTarget, prefab: Prefab, x0: number, y0: number): void {
  const { fg, bg, foundation } = ids(prefab);
  const inside = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < target.width && y < target.height;
  for (let py = 0; py < prefab.height; py++) {
    for (let px = 0; px < prefab.width; px++) {
      const x = x0 + px;
      const y = y0 + py;
      if (!inside(x, y)) continue;
      const i = py * prefab.width + px;
      target.setBg(x, y, bg[i] ?? AIR);
      target.setFg(x, y, fg[i] ?? AIR);
    }
  }
  if (foundation === AIR) return;
  for (let px = 0; px < prefab.width; px++) {
    const x = x0 + px;
    for (let y = y0 + prefab.height; inside(x, y) && SOLID[target.fgAt(x, y)] !== 1; y++) {
      target.setFg(x, y, foundation);
    }
  }
}

/** The live world as a stamp target (writes go through world.set so systems hear about them). */
export function worldTarget(world: World): StampTarget {
  return {
    width: world.width,
    height: world.height,
    setFg: (x, y, id) => world.set(x, y, id),
    setBg: (x, y, id) => world.setBg(x, y, id),
    fgAt: (x, y) => world.get(x, y),
  };
}

/**
 * Stamps a prefab with its bottom-left cell at (x, bottom), clearing `headroom` rows above it
 * (debug village cottages).
 */
export function stampPrefab(
  world: World,
  prefab: Prefab,
  x: number,
  bottom: number,
  headroom: number,
): void {
  const top = bottom - prefab.height + 1;
  for (let y = top - headroom; y < top; y++) {
    for (let dx = 0; dx < prefab.width; dx++) {
      if (!world.inBounds(x + dx, y)) continue;
      world.set(x + dx, y, AIR);
      world.setBg(x + dx, y, AIR);
    }
  }
  stampPrefabAt(worldTarget(world), prefab, x, top);
}
