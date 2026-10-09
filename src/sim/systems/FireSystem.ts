import { FIRE } from '../../config';
import { LIQUID as KIND } from '../../data/biomes';
import { TILES, tileId } from '../../data/tiles';
import type { EventBus, SimEvents, TileLayer } from '../events';
import { AIR, type World } from '../world/World';

/** Per tile id: how long it burns (seconds, 0 = not flammable) and what it leaves behind. */
const BURN_SECONDS = Float32Array.from(TILES, (t) => t.flammable?.seconds ?? 0);
const BURNS_TO = Int32Array.from(TILES, (t) =>
  t.flammable?.becomes ? tileId(t.flammable.becomes) : AIR,
);

const NEIGHBOURS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [-1, 1],
  [1, -1],
  [-1, -1],
] as const;

/** Fire key per cell and layer: foreground cells use the index, walls −(index + 1). */
function keyOf(world: World, layer: TileLayer, x: number, y: number): number {
  const i = world.index(x, y);
  return layer === 'fg' ? i : -(i + 1);
}

const startedPayload = { x: 0, y: 0 };
/** A cell's block burns first; the wall behind only if the block doesn't. */
const LAYERS: readonly TileLayer[] = ['fg', 'bg'];
const burnedPayload = { x: 0, y: 0, layer: 'fg' as TileLayer };

/**
 * Fire (plan 1.2 "Matter behaves", plan 3.4 FireSystem): a burning cell (block or background wall)
 * burns for its tile's `flammable.seconds`, may spread to flammable neighbours meanwhile, then
 * leaves what the tile burns down to (grass → soil, wood → nothing). Water in the cell puts it
 * out; rain puts out fires open to the sky. Ignited by lava and resting flares. Not saved: fires
 * go out when the world is reloaded.
 */
export class FireSystem {
  /** Burning cells → seconds of burning left. */
  readonly burning = new Map<number, number>();
  private timer = 0;

  constructor(
    private readonly world: World,
    private readonly events: EventBus<SimEvents>,
    private readonly random: () => number,
  ) {}

  /** Sets the block (or, if none burns there, the wall) at a cell alight. Returns success. */
  ignite(x: number, y: number): boolean {
    const { world } = this;
    if (!world.inBounds(x, y) || this.burning.size >= FIRE.maxBurning) return false;
    const i = world.index(x, y);
    if ((world.liquid[i] ?? 0) > 0 && world.liquidType[i] === KIND.water) return false; // wet
    for (const layer of LAYERS) {
      if (this.start(layer, x, y)) return true;
    }
    return false;
  }

  /** Starts a fire on one layer of a cell if it burns there and isn't burning yet (and under the cap). */
  private start(layer: TileLayer, x: number, y: number): boolean {
    const { world } = this;
    if (this.burning.size >= FIRE.maxBurning) return false;
    const seconds = BURN_SECONDS[world.getLayer(layer, x, y)] ?? 0;
    const key = keyOf(world, layer, x, y);
    if (seconds <= 0 || this.burning.has(key)) return false;
    this.burning.set(key, seconds);
    startedPayload.x = x;
    startedPayload.y = y;
    this.events.emit('fireStarted', startedPayload);
    return true;
  }

  /** Water in the cell or in one of its 4 neighbours (water flowing over a fire puts it out). */
  private wetAround(x: number, y: number): boolean {
    const { world } = this;
    for (let d = 0; d < 5; d++) {
      const nx = x + (d === 1 ? 1 : d === 2 ? -1 : 0);
      const ny = y + (d === 3 ? 1 : d === 4 ? -1 : 0);
      if (!world.inBounds(nx, ny)) continue;
      const i = world.index(nx, ny);
      // Any water at all: even a thin film flowing past douses it.
      if ((world.liquid[i] ?? 0) > 0 && world.liquidType[i] === KIND.water) return true;
    }
    return false;
  }

  /** Is anything burning at this cell (block or wall)? */
  isBurning(x: number, y: number): boolean {
    const { world } = this;
    if (!world.inBounds(x, y)) return false;
    return this.burning.has(keyOf(world, 'fg', x, y)) || this.burning.has(keyOf(world, 'bg', x, y));
  }

  /** `raining`: 0..1 rain intensity (puts out fires open to the sky). */
  update(dt: number, raining: number): void {
    this.timer += dt;
    const step = 1 / FIRE.tickHz;
    if (this.timer < step || this.burning.size === 0) {
      if (this.burning.size === 0) this.timer = 0;
      return;
    }
    this.timer -= step;
    if (this.timer > step) this.timer = 0;
    const { world } = this;
    const W = world.width;
    // Snapshot the keys: fires started this tick wait for the next one.
    const keys = [...this.burning.keys()];
    for (const key of keys) {
      const left = this.burning.get(key);
      if (left === undefined) continue;
      const layer: TileLayer = key >= 0 ? 'fg' : 'bg';
      const i = key >= 0 ? key : -key - 1;
      const x = i % W;
      const y = (i - x) / W;
      const id = world.getLayer(layer, x, y);
      // Mined, replaced, or water on it or right next to it: out.
      const wet = this.wetAround(x, y);
      // Open to the sky: above the first sun-blocking row, or that row itself for a block (grass).
      const sky = world.skyline[x] ?? 0;
      const exposed = layer === 'fg' ? y <= sky : y < sky;
      const rained =
        raining > 0 && exposed && this.random() < FIRE.rainOutPerSecond * raining * step;
      if ((BURN_SECONDS[id] ?? 0) <= 0 || wet || rained) {
        this.burning.delete(key);
        continue;
      }
      // Spread.
      for (const [dx, dy] of NEIGHBOURS) {
        if (this.random() < FIRE.spreadPerSecond * step) this.ignite(x + dx, y + dy);
      }
      if (layer === 'fg' && this.random() < FIRE.spreadPerSecond * step) {
        this.start('bg', x, y); // into the wall behind
      }
      const next = left - step;
      if (next > 0) {
        this.burning.set(key, next);
        continue;
      }
      this.burning.delete(key);
      world.setLayer(layer, x, y, BURNS_TO[id] ?? AIR);
      burnedPayload.x = x;
      burnedPayload.y = y;
      burnedPayload.layer = layer;
      this.events.emit('tileBurned', burnedPayload);
    }
  }
}
