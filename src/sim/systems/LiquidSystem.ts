import { LIQUID } from '../../config';
import { LIQUID as KIND } from '../../data/biomes';
import { TILES, tileId } from '../../data/tiles';
import type { EventBus, SimEvents } from '../events';
import type { World } from '../world/World';
import type { TileRect } from './GloamSystem';

const SOLID = Uint8Array.from(TILES, (t) => (t.solid ? 1 : 0));
const FLAMMABLE = Uint8Array.from(TILES, (t) => (t.flammable ? 1 : 0));
const OBSIDIAN = tileId('obsidian');

const reactionPayload = { x: 0, y: 0 };

/**
 * Flowing water and lava (plan 2.7, plan 3.4 LiquidSystem): world.liquid holds 0–255 per cell,
 * world.liquidType which liquid. Each tick, over the active region around the camera, every
 * liquid cell first falls into the cell below as far as it fits, then evens out with its left and
 * right neighbours. Rows go bottom to top (so a column drains in one tick) and the sideways sweep
 * alternates direction each tick (no drift to one side). Lava moves only every LIQUID.lavaEvery
 * ticks. Where water and lava meet, the lava cools to obsidian (with steam: `liquidReaction`).
 * Lava touching something flammable can set it alight (`ignite`).
 */
export class LiquidSystem {
  private timer = 0;
  private tick = 0;
  /** The rectangle changed this tick (min/max), reported as `liquidChanged`. */
  private x0 = 0;
  private y0 = 0;
  private x1 = -1;
  private y1 = -1;
  private readonly changedPayload: TileRect = { x0: 0, y0: 0, width: 0, height: 0 };
  private readonly unsubscribe: () => void;

  constructor(
    readonly world: World,
    private readonly events: EventBus<SimEvents>,
    private readonly random: () => number,
    /** Sets a tile alight (the FireSystem); lava calls it for flammable neighbours. */
    private readonly ignite: (x: number, y: number) => void,
  ) {
    // A solid block placed into liquid displaces it (it's lost, not pushed aside).
    this.unsubscribe = events.on('tileChanged', ({ x, y, id, layer }) => {
      if (layer !== 'fg' || SOLID[id] !== 1) return;
      const i = world.index(x, y);
      if ((world.liquid[i] ?? 0) === 0) return;
      world.liquid[i] = 0;
      world.liquidType[i] = KIND.none;
      this.mark(x, y);
      this.flush();
    });
  }

  destroy(): void {
    this.unsubscribe();
  }

  /** `region`: the active rectangle (tiles), or null. */
  update(dt: number, region: TileRect | null): void {
    this.timer += dt;
    const step = 1 / LIQUID.tickHz;
    if (this.timer < step || !region) return;
    this.timer -= step;
    if (this.timer > step) this.timer = 0; // no catch-up storms after a stall
    this.tick++;
    this.run(region);
    this.flush();
  }

  /** Adds liquid to a cell (buckets). Returns false if the cell is solid or holds the other liquid. */
  pour(x: number, y: number, type: number, amount: number): boolean {
    const { world } = this;
    if (!world.inBounds(x, y) || world.isSolid(x, y)) return false;
    const i = world.index(x, y);
    const here = world.liquidType[i] ?? KIND.none;
    if (here !== KIND.none && here !== type && (world.liquid[i] ?? 0) > 0) return false;
    world.liquidType[i] = type;
    world.liquid[i] = Math.min(LIQUID.max, (world.liquid[i] ?? 0) + amount);
    this.mark(x, y);
    this.flush();
    return true;
  }

  /** Removes a cell's liquid (buckets). Returns its type and amount. */
  take(x: number, y: number): { type: number; amount: number } {
    const { world } = this;
    if (!world.inBounds(x, y)) return { type: KIND.none, amount: 0 };
    const i = world.index(x, y);
    const result = { type: world.liquidType[i] ?? KIND.none, amount: world.liquid[i] ?? 0 };
    world.liquid[i] = 0;
    world.liquidType[i] = KIND.none;
    this.mark(x, y);
    this.flush();
    return result;
  }

  private run(region: TileRect): void {
    const { world } = this;
    const W = world.width;
    const { liquid, liquidType, fg } = world;
    const lavaTick = this.tick % LIQUID.lavaEvery === 0;
    const rightward = this.tick % 2 === 0;
    const xa = region.x0;
    const xb = region.x0 + region.width - 1;
    for (let y = region.y0 + region.height - 1; y >= region.y0; y--) {
      for (let k = 0; k <= xb - xa; k++) {
        const x = rightward ? xa + k : xb - k;
        const i = y * W + x;
        let a = liquid[i] ?? 0;
        if (a === 0) continue;
        const type = liquidType[i] ?? KIND.none;
        if (type === KIND.lava && !lavaTick) continue;
        if (SOLID[fg[i] ?? 0] === 1) {
          // A block was built into it some other way: the liquid is gone.
          liquid[i] = 0;
          liquidType[i] = KIND.none;
          this.mark(x, y);
          continue;
        }
        // Fall.
        if (y + 1 < world.height) {
          const j = i + W;
          if (SOLID[fg[j] ?? 0] !== 1) {
            const below = liquidType[j] ?? KIND.none;
            if (below !== KIND.none && below !== type && (liquid[j] ?? 0) > 0) {
              this.react(x, y, x, y + 1);
              continue;
            }
            const move = Math.min(a, LIQUID.max - (liquid[j] ?? 0));
            if (move > 0) {
              liquid[j] = (liquid[j] ?? 0) + move;
              liquidType[j] = type;
              a -= move;
              this.mark(x, y + 1);
              this.mark(x, y);
            }
          }
        }
        // Spread sideways (left and right in sweep order).
        if (a > LIQUID.minSpread) {
          for (let s = 0; s < 2; s++) {
            const dx = (s === 0) === rightward ? 1 : -1;
            const nx = x + dx;
            if (nx < 0 || nx >= W) continue;
            const j = i + dx;
            if (SOLID[fg[j] ?? 0] === 1) continue;
            const side = liquidType[j] ?? KIND.none;
            const b = liquid[j] ?? 0;
            if (side !== KIND.none && side !== type && b > 0) {
              this.react(x, y, nx, y);
              a = liquid[i] ?? 0;
              break;
            }
            const flow = Math.floor((a - b) * LIQUID.spreadShare);
            if (flow <= 0) continue;
            liquid[j] = b + flow;
            liquidType[j] = type;
            a -= flow;
            this.mark(nx, y);
            this.mark(x, y);
          }
        }
        liquid[i] = a;
        if (a === 0) liquidType[i] = KIND.none;
        if (type === KIND.lava && a > 0) this.lavaHeat(x, y);
      }
    }
  }

  /** Water meets lava: the lava cell cools into obsidian; both liquids there are used up. */
  private react(ax: number, ay: number, bx: number, by: number): void {
    const { world } = this;
    const ia = world.index(ax, ay);
    const lavaAtA = world.liquidType[ia] === KIND.lava;
    const [lx, ly] = lavaAtA ? [ax, ay] : [bx, by];
    const [wx, wy] = lavaAtA ? [bx, by] : [ax, ay];
    const il = world.index(lx, ly);
    const iw = world.index(wx, wy);
    world.liquid[il] = 0;
    world.liquidType[il] = KIND.none;
    world.liquid[iw] = 0;
    world.liquidType[iw] = KIND.none;
    this.mark(lx, ly);
    this.mark(wx, wy);
    world.set(lx, ly, OBSIDIAN);
    reactionPayload.x = lx;
    reactionPayload.y = ly;
    this.events.emit('liquidReaction', reactionPayload);
  }

  private lavaHeat(x: number, y: number): void {
    const { world } = this;
    for (let d = 0; d < 4; d++) {
      const nx = x + (d === 0 ? 1 : d === 1 ? -1 : 0);
      const ny = y + (d === 2 ? 1 : d === 3 ? -1 : 0);
      if (!world.inBounds(nx, ny)) continue;
      const i = world.index(nx, ny);
      const hot = FLAMMABLE[world.fg[i] ?? 0] === 1 || FLAMMABLE[world.bg[i] ?? 0] === 1;
      if (hot && this.random() < LIQUID.lavaIgniteChance) this.ignite(nx, ny);
    }
  }

  private mark(x: number, y: number): void {
    if (this.x1 < this.x0) {
      this.x0 = x;
      this.x1 = x;
      this.y0 = y;
      this.y1 = y;
      return;
    }
    if (x < this.x0) this.x0 = x;
    if (x > this.x1) this.x1 = x;
    if (y < this.y0) this.y0 = y;
    if (y > this.y1) this.y1 = y;
  }

  /** Reports the changed rectangle (one row/column of margin for surface frames), then resets. */
  private flush(): void {
    if (this.x1 < this.x0) return;
    const p = this.changedPayload;
    p.x0 = this.x0 - 1;
    p.y0 = this.y0 - 1;
    p.width = this.x1 - this.x0 + 3;
    p.height = this.y1 - this.y0 + 3;
    this.x0 = 0;
    this.y0 = 0;
    this.x1 = -1;
    this.y1 = -1;
    this.events.emit('liquidChanged', p);
  }
}
