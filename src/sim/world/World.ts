import { TILES } from '../../data/tiles';
import type { EventBus, SimEvents, TileLayer } from '../events';
import { Chunk } from './Chunk';

export interface WorldSize {
  width: number;
  height: number;
  chunkSize: number;
}

/** Id 0 in the tile registry. */
export const AIR = 0;

/** Per-id solidity, so collision checks are one typed-array read instead of an object lookup. */
const SOLID = Uint8Array.from(TILES, (t) => (t.solid ? 1 : 0));

/**
 * The tile grid. Data lives in flat world-sized typed arrays (index = y * width + x); chunks are
 * bookkeeping on top (what changed, for rendering and later saving). Every write goes through
 * set* so the right chunk is marked and `tileChanged` is emitted.
 */
export class World {
  readonly width: number;
  readonly height: number;
  readonly chunkSize: number;
  readonly chunksX: number;
  readonly chunksY: number;

  readonly fg: Uint16Array;
  readonly bg: Uint16Array;
  readonly liquid: Uint8Array;
  readonly liquidType: Uint8Array;
  readonly lightR: Uint8Array;
  readonly lightG: Uint8Array;
  readonly lightB: Uint8Array;
  readonly gloam: Uint8Array;
  /** Mining progress, only for tiles currently being mined. */
  readonly damage = new Map<number, number>();
  readonly chunks: readonly Chunk[];

  private readonly tileChangedPayload = {
    x: 0,
    y: 0,
    id: 0,
    previous: 0,
    layer: 'fg' as TileLayer,
  };

  constructor(
    size: WorldSize,
    private readonly events?: EventBus<SimEvents>,
  ) {
    this.width = size.width;
    this.height = size.height;
    this.chunkSize = size.chunkSize;
    this.chunksX = Math.ceil(size.width / size.chunkSize);
    this.chunksY = Math.ceil(size.height / size.chunkSize);

    const n = size.width * size.height;
    this.fg = new Uint16Array(n);
    this.bg = new Uint16Array(n);
    this.liquid = new Uint8Array(n);
    this.liquidType = new Uint8Array(n);
    this.lightR = new Uint8Array(n);
    this.lightG = new Uint8Array(n);
    this.lightB = new Uint8Array(n);
    this.gloam = new Uint8Array(n);

    const chunks: Chunk[] = [];
    for (let cy = 0; cy < this.chunksY; cy++) {
      for (let cx = 0; cx < this.chunksX; cx++) chunks.push(new Chunk(cx, cy, size.chunkSize));
    }
    this.chunks = chunks;
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  index(x: number, y: number): number {
    return y * this.width + x;
  }

  /** Foreground tile id; air outside the world. */
  get(x: number, y: number): number {
    return this.inBounds(x, y) ? (this.fg[y * this.width + x] ?? AIR) : AIR;
  }

  getBg(x: number, y: number): number {
    return this.inBounds(x, y) ? (this.bg[y * this.width + x] ?? AIR) : AIR;
  }

  /** Collision query. Outside the world counts as solid, so nothing can leave it. */
  isSolid(x: number, y: number): boolean {
    if (!this.inBounds(x, y)) return true;
    return SOLID[this.fg[y * this.width + x] ?? AIR] === 1;
  }

  /** Sets a foreground tile, marks its chunk changed and emits `tileChanged`. */
  set(x: number, y: number, id: number): void {
    this.write(this.fg, 'fg', x, y, id);
  }

  /** Sets a background wall, marks its chunk changed and emits `tileChanged`. */
  setBg(x: number, y: number, id: number): void {
    this.write(this.bg, 'bg', x, y, id);
  }

  /** Reads a tile from either layer (air outside the world). */
  getLayer(layer: TileLayer, x: number, y: number): number {
    return layer === 'fg' ? this.get(x, y) : this.getBg(x, y);
  }

  setLayer(layer: TileLayer, x: number, y: number, id: number): void {
    this.write(layer === 'fg' ? this.fg : this.bg, layer, x, y, id);
  }

  chunkAt(cx: number, cy: number): Chunk | undefined {
    if (cx < 0 || cy < 0 || cx >= this.chunksX || cy >= this.chunksY) return undefined;
    return this.chunks[cy * this.chunksX + cx];
  }

  /** Marks every chunk changed (after bulk generation, which writes the arrays directly). */
  touchAll(): void {
    for (const chunk of this.chunks) chunk.markChanged();
  }

  private write(data: Uint16Array, layer: TileLayer, x: number, y: number, id: number): void {
    if (!this.inBounds(x, y)) return;
    const i = y * this.width + x;
    const previous = data[i] ?? AIR;
    if (previous === id) return;
    data[i] = id;
    this.touch(x, y);
    const payload = this.tileChangedPayload;
    payload.x = x;
    payload.y = y;
    payload.id = id;
    payload.previous = previous;
    payload.layer = layer;
    this.events?.emit('tileChanged', payload);
  }

  private touch(x: number, y: number): void {
    const cs = this.chunkSize;
    this.chunkAt(Math.floor(x / cs), Math.floor(y / cs))?.markChanged();
  }
}
