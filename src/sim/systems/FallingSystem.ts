import { FALLING, TILE_SIZE } from '../../config';
import { itemId } from '../../data/items';
import { TILES } from '../../data/tiles';
import type { EventBus, SimEvents } from '../events';
import { createCollisionResult, moveAndCollide, type Body } from '../physics/tileCollision';
import { isDecor } from '../world/decor';
import { AIR, type World } from '../world/World';
import type { SpawnDrop } from './MiningSystem';
import type { SavedDrop } from '../world/worldData';

const FALLS = Uint8Array.from(TILES, (t) => (t.falls ? 1 : 0));
/** Silt and gravel rest on solid blocks and on platforms. */
const HOLDS_UP = Uint8Array.from(TILES, (t) => (t.solid || t.platform ? 1 : 0));
const INTANGIBLE = Uint8Array.from(TILES, (t) => (t.intangible ? 1 : 0));
const DROP = TILES.map((t) => (t.drop ? itemId(t.drop) : -1));
/** Falling blocks are a little narrower than a tile so they drop down one-tile shafts. */
export const FALLING_INSET = 1;
const INSET = FALLING_INSET;
const collision = createCollisionResult();

/** A block of silt or gravel in free fall. */
export interface FallingBlock {
  /** Tile id it lands as. */
  readonly tile: number;
  body: Body;
  prevX: number;
  prevY: number;
}

const landedPayload = { x: 0, y: 0, id: 0 };

/**
 * Falling silt and gravel (plan 3.4 FallingSystem): when a loose block loses what holds it up
 * (mined out underneath), it leaves the grid as a falling block, drops, and lands as a tile again
 * — so the column above follows, and digging under gravel brings the ceiling down (a cave-in).
 * Checks run only around tiles that changed. A landing spot that is taken turns the block into
 * its item drop. Whatever a fast block lands on gets hurt (`hurt`).
 */
export class FallingSystem {
  readonly blocks: FallingBlock[] = [];
  private readonly queue = new Set<number>();
  private readonly unsubscribe: () => void;

  constructor(
    private readonly world: World,
    private readonly events: EventBus<SimEvents>,
  ) {
    this.unsubscribe = events.on('tileChanged', ({ x, y, layer }) => {
      if (layer !== 'fg') return;
      // The changed cell itself (placed loose material) and the one above it (lost support).
      if (world.inBounds(x, y)) this.queue.add(world.index(x, y));
      if (world.inBounds(x, y - 1)) this.queue.add(world.index(x, y - 1));
    });
  }

  destroy(): void {
    this.unsubscribe();
  }

  update(dt: number, spawnDrop: SpawnDrop, hurt: (body: Body, damage: number) => void): void {
    const { world } = this;
    // Loosen unsupported blocks; clearing one queues the cell above it (a column falls in turn).
    while (this.queue.size > 0) {
      const [i] = this.queue;
      if (i === undefined) break;
      this.queue.delete(i);
      const id = world.fg[i] ?? AIR;
      if (FALLS[id] !== 1) continue;
      const x = i % world.width;
      const y = (i - x) / world.width;
      if (y + 1 >= world.height || HOLDS_UP[world.fg[i + world.width] ?? AIR] === 1) continue;
      world.set(x, y, AIR);
      const bx = x * TILE_SIZE + INSET;
      const by = y * TILE_SIZE;
      this.blocks.push({
        tile: id,
        body: { x: bx, y: by, width: TILE_SIZE - INSET * 2, height: TILE_SIZE, vx: 0, vy: 0 },
        prevX: bx,
        prevY: by,
      });
    }

    for (let k = this.blocks.length - 1; k >= 0; k--) {
      const block = this.blocks[k];
      if (!block) continue;
      const b = block.body;
      block.prevX = b.x;
      block.prevY = b.y;
      b.vy = Math.min(b.vy + FALLING.gravity * dt, FALLING.maxFallSpeed);
      const speed = b.vy;
      if (speed >= FALLING.damageSpeed) hurt(b, FALLING.damage);
      moveAndCollide(world, b, dt, collision);
      if (!collision.onGround) continue;
      this.land(block, spawnDrop);
      this.blocks.splice(k, 1);
    }
  }

  /** Blocks in mid-fall as item drops (for saving: nothing is lost if the game saves now). */
  savedAsDrops(): SavedDrop[] {
    const out: SavedDrop[] = [];
    for (const block of this.blocks) {
      const item = DROP[block.tile] ?? -1;
      if (item < 0) continue;
      const b = block.body;
      out.push({
        itemId: item,
        count: 1,
        x: b.x + b.width / 2,
        y: b.y + b.height / 2,
        vx: 0,
        vy: 0,
        age: 0,
        magnetized: false,
        pickupAfter: 0,
      });
    }
    return out;
  }

  private land(block: FallingBlock, spawnDrop: SpawnDrop): void {
    const { world } = this;
    const b = block.body;
    const x = Math.floor((b.x + b.width / 2) / TILE_SIZE);
    const y = Math.floor((b.y + b.height - 1) / TILE_SIZE);
    const here = world.get(x, y);
    if (world.inBounds(x, y) && (here === AIR || isDecor(here) || INTANGIBLE[here] === 1)) {
      world.set(x, y, block.tile);
      landedPayload.x = x;
      landedPayload.y = y;
      landedPayload.id = block.tile;
      this.events.emit('blockLanded', landedPayload);
    } else {
      const drop = DROP[block.tile] ?? -1;
      if (drop >= 0) spawnDrop(drop, 1, b.x + b.width / 2, b.y + b.height / 2);
    }
  }
}
