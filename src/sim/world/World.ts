import { TILES } from '../../data/tiles';
import { DEPTH_LAYERS } from '../../data/biomes';
import type { EventBus, SimEvents, TileLayer } from '../events';
import type { WorldArrays } from './worldData';
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
  /**
   * Per column: the first row with a solid foreground tile (sunlight falls straight down to it).
   * `height` when the column is open all the way down. Kept current on every foreground write.
   */
  readonly skyline: Int32Array;
  /** Surface biome index per column (src/data/biomes.ts SURFACE_BIOMES). */
  readonly surfaceBiome: Uint8Array;
  /** First row of each depth layer (src/data/biomes.ts DEPTH_LAYERS). */
  readonly layerTops: Int32Array;
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
    this.skyline = new Int32Array(size.width).fill(size.height);
    this.surfaceBiome = new Uint8Array(size.width);
    this.layerTops = new Int32Array(DEPTH_LAYERS.length);
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

  /**
   * Replaces the world's contents with generated or saved arrays (same size), then rebuilds
   * derived data. Light is not part of the data: it is recomputed.
   */
  loadArrays(arrays: WorldArrays): void {
    const n = this.width * this.height;
    for (const [name, data] of [
      ['fg', arrays.fg],
      ['bg', arrays.bg],
      ['liquid', arrays.liquid],
      ['liquidType', arrays.liquidType],
      ['gloam', arrays.gloam],
    ] as const) {
      if (data.length !== n) throw new Error(`${name} has ${data.length} cells, expected ${n}`);
    }
    // A save from before a depth layer was added must be migrated, not half-loaded.
    if (arrays.layerTops.length !== this.layerTops.length) {
      throw new Error(
        `layerTops has ${arrays.layerTops.length} layers, expected ${this.layerTops.length}`,
      );
    }
    this.fg.set(arrays.fg);
    this.bg.set(arrays.bg);
    this.liquid.set(arrays.liquid);
    this.liquidType.set(arrays.liquidType);
    this.gloam.set(arrays.gloam);
    this.surfaceBiome.set(arrays.surfaceBiome.subarray(0, this.width));
    this.layerTops.set(arrays.layerTops);
    this.damage.clear();
    this.touchAll();
  }

  /** The persistent arrays (views onto the live data — copy before keeping them). */
  arrays(): WorldArrays {
    return {
      fg: this.fg,
      bg: this.bg,
      liquid: this.liquid,
      liquidType: this.liquidType,
      gloam: this.gloam,
      surfaceBiome: this.surfaceBiome,
      layerTops: this.layerTops,
    };
  }

  /** Marks every chunk changed and rebuilds derived data (after bulk generation). */
  touchAll(): void {
    for (const chunk of this.chunks) chunk.markChanged();
    for (let x = 0; x < this.width; x++) this.rescanSkyline(x, 0);
  }

  private updateSkyline(x: number, y: number, id: number): void {
    const top = this.skyline[x] ?? this.height;
    if (SOLID[id] === 1) {
      if (y < top) this.skyline[x] = y;
    } else if (y === top) {
      this.rescanSkyline(x, y);
    }
  }

  private rescanSkyline(x: number, fromY: number): void {
    let y = fromY;
    while (y < this.height && SOLID[this.fg[y * this.width + x] ?? AIR] !== 1) y++;
    this.skyline[x] = y;
  }

  private write(data: Uint16Array, layer: TileLayer, x: number, y: number, id: number): void {
    if (!this.inBounds(x, y)) return;
    const i = y * this.width + x;
    const previous = data[i] ?? AIR;
    if (previous === id) return;
    data[i] = id;
    this.touch(x, y);
    if (layer === 'fg') this.updateSkyline(x, y, id);
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
