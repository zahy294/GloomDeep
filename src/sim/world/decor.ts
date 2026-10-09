import { TILE_SIZE } from '../../config';
import { itemId } from '../../data/items';
import { TILES, type DecorDef } from '../../data/tiles';
import type { EventBus, SimEvents } from '../events';
import { AIR, type World } from './World';

const DECOR: readonly (DecorDef | undefined)[] = TILES.map((t) => t.decor);
const DROP_ITEM = TILES.map((t) => (t.drop ? itemId(t.drop) : -1));
/** Per-id: something decorations can stand on or hang from (blocks, branches, leaf canopies). */
const ANCHOR = Uint8Array.from(TILES, (t) =>
  t.solid || t.platform || t.sunTransmit !== undefined ? 1 : 0,
);

export function isDecor(id: number): boolean {
  return DECOR[id] !== undefined;
}

/** Whether decoration `id` would be held in place at (x, y). */
export function decorSupported(world: World, x: number, y: number, id: number): boolean {
  const decor = DECOR[id];
  if (!decor) return true;
  const anchored = (tx: number, ty: number) => ANCHOR[world.get(tx, ty)] === 1;
  switch (decor.support) {
    case 'ground':
      return anchored(x, y + 1);
    case 'ceiling': {
      // Hanging decorations also hang from one another, so vines and moss form chains.
      const above = world.get(x, y - 1);
      return ANCHOR[above] === 1 || DECOR[above]?.support === 'ceiling';
    }
    case 'wall':
      return world.getBg(x, y) !== AIR || anchored(x - 1, y) || anchored(x + 1, y);
  }
}

/**
 * Removes decorations that lost their support (the block under a flower was mined, the branch a
 * vine hung from was cut). Edits are collected from `tileChanged` and checked once per step;
 * removals cascade, so a whole vine chain falls. Removed decorations drop their item, if any.
 */
export class DecorSupport {
  /** Cells to re-check, as x, y pairs. Reused; never shrinks. */
  private readonly pending: number[] = [];
  private readonly unsubscribe: () => void;

  constructor(
    private readonly world: World,
    events: EventBus<SimEvents>,
  ) {
    this.unsubscribe = events.on('tileChanged', (e) => {
      // The changed cell itself (a wall behind wall decor) and its four neighbours.
      this.pending.push(e.x, e.y, e.x, e.y - 1, e.x, e.y + 1, e.x - 1, e.y, e.x + 1, e.y);
    });
  }

  /** Call once per simulation step. */
  update(spawnDrop: (item: number, count: number, x: number, y: number) => void): void {
    const { world, pending } = this;
    // Removing a decoration emits tileChanged, which appends more cells: keep going until quiet.
    for (let i = 0; i < pending.length; i += 2) {
      const x = pending[i]!;
      const y = pending[i + 1]!;
      const id = world.get(x, y);
      if (!isDecor(id) || decorSupported(world, x, y, id)) continue;
      world.set(x, y, AIR);
      const drop = DROP_ITEM[id] ?? -1;
      if (drop >= 0) spawnDrop(drop, 1, (x + 0.5) * TILE_SIZE, (y + 0.5) * TILE_SIZE);
    }
    pending.length = 0;
  }

  destroy(): void {
    this.unsubscribe();
  }
}
