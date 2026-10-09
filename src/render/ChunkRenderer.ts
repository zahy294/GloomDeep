import * as Phaser from 'phaser';
import { CHUNK_RENDER, TILE_SIZE } from '../config';
import type { EventBus, SimEvents, TileLayer } from '../sim/events';
import { tileFrame } from '../sim/world/autotile';
import type { World } from '../sim/world/World';
import { chunkRangeFor, inRange, rangeSize, type ChunkRange, type Rect } from './chunkMath';

/**
 * Phaser's "empty tile" index. The GPU layer still samples atlas texel (0, 0) for it, which is why
 * frame 0 of every atlas is transparent (RESERVED_FRAMES in autotile.ts).
 */
const EMPTY = -1;

interface Slot {
  /** Positioned at the chunk origin; the layer inside stays at (0, 0). See the class comment. */
  container: Phaser.GameObjects.Container;
  layer: Phaser.Tilemaps.TilemapGPULayer;
  tiles: Phaser.Tilemaps.Tile[][];
  /** World chunk index this slot currently shows, or -1 when free. */
  chunkIndex: number;
  /** Tile frames changed since the last texture upload. */
  dirty: boolean;
}

export interface ChunkRenderStats {
  loaded: number;
  /** Chunk texture uploads in the last update (full loads + edit refreshes). */
  uploads: number;
  /**
   * Chunks that entered the camera view before being preloaded, so they were built synchronously
   * in that frame (a potential hitch). Should stay 0 while moving normally; teleports excepted.
   */
  lateLoads: number;
  /** Chunks released back to the pool (cumulative). */
  unloads: number;
}

/**
 * Off-screen chunk loads allowed this frame, shared by all chunk layers so foreground and walls
 * never both preload in the same frame. Reset once per frame by the owner.
 */
export interface PreloadBudget {
  remaining: number;
}

export interface ChunkLayerOptions {
  /** The world layer drawn; its `tileChanged` events refresh frames. Null = no edit refresh. */
  layer: TileLayer | null;
  /** Atlas frame for a tile (default: blob autotiling of `layer`). -1 = empty. */
  frameAt?: (x: number, y: number) => number;
  textureKey: string;
  depth: number;
  poolSize?: number;
}

/**
 * Draws one tile layer (foreground blocks or background walls) as one TilemapGPULayer per chunk,
 * around the camera only, with blob autotiling (frame per tile from `autotile.ts`).
 *
 * TilemapGPULayer keeps a Tile object per cell and rebuilds its GPU data texture from them, and the
 * world (4200 tiles wide) exceeds its 4096-tile limit. So a fixed pool of chunk-sized layers is
 * created once and re-pointed at whichever chunks are near the view: refilling 128×128 indices and
 * regenerating the texture is cheap, creating tilemaps on the fly is not.
 *
 * Edits: a `tileChanged` event recomputes only the frames of the edited tile and its 8 neighbours
 * (in whichever loaded chunks they fall), and each touched chunk re-uploads its texture at most
 * once per frame, however many tiles changed.
 *
 * Phaser 4.2.1 bug: TilemapGPULayer applies its own x/y twice when drawing (SubmitterTilemapGPULayer
 * translates by the layer position and then builds the quad from that position again), so a layer
 * at x = 32768 draws at 65536. Each layer therefore stays at (0, 0) inside a Container placed at the
 * chunk origin; parent transforms are applied correctly. This stays correct if Phaser fixes the bug.
 */
export class ChunkRenderer {
  readonly stats: ChunkRenderStats = { loaded: 0, uploads: 0, lateLoads: 0, unloads: 0 };
  private readonly slots: Slot[] = [];
  private readonly loaded = new Map<number, Slot>();
  private readonly chunkPx: number;
  private readonly tileLayer: TileLayer | null;
  private readonly frameAt: (x: number, y: number) => number;
  private readonly needed: ChunkRange = { cx0: 0, cy0: 0, cx1: 0, cy1: 0 };
  private readonly visible: ChunkRange = { cx0: 0, cy0: 0, cx1: 0, cy1: 0 };
  /** The first update loads the initial view synchronously; that is not a late load. */
  private warmedUp = false;
  private readonly unsubscribe: () => void;

  constructor(
    scene: Phaser.Scene,
    private readonly world: World,
    events: EventBus<SimEvents>,
    options: ChunkLayerOptions,
  ) {
    const size = world.chunkSize;
    this.chunkPx = size * TILE_SIZE;
    this.tileLayer = options.layer;
    const layer = options.layer ?? 'fg';
    this.frameAt = options.frameAt ?? ((x, y) => tileFrame(world, layer, x, y));
    const blank = Array.from({ length: size }, () => new Array<number>(size).fill(EMPTY));

    for (let i = 0; i < (options.poolSize ?? CHUNK_RENDER.poolSize); i++) {
      const map = scene.make.tilemap({
        data: blank,
        tileWidth: TILE_SIZE,
        tileHeight: TILE_SIZE,
      });
      // gid 0: tile index === atlas frame (frame layout in src/sim/world/autotile.ts).
      const tileset = map.addTilesetImage(
        'tiles',
        options.textureKey,
        TILE_SIZE,
        TILE_SIZE,
        0,
        0,
        0,
      );
      if (!tileset) throw new Error(`Tile texture "${options.textureKey}" is not loaded`);
      const layer = map.createLayer(0, tileset, 0, 0, true);
      if (!(layer instanceof Phaser.Tilemaps.TilemapGPULayer)) {
        throw new Error('Could not create a TilemapGPULayer (WebGL required)');
      }
      const container = scene.add.container(0, 0, [layer]);
      container.setDepth(options.depth).setVisible(false);
      this.slots.push({ container, layer, tiles: layer.layer.data, chunkIndex: -1, dirty: false });
    }

    this.unsubscribe = events.on('tileChanged', (e) => {
      if (this.tileLayer !== null && e.layer === this.tileLayer) this.refreshAround(e.x, e.y);
    });
  }

  /** Call once per frame with the camera's world view. */
  update(view: Rect, budget: PreloadBudget): void {
    const { chunksX, chunksY } = this.world;
    const needed = chunkRangeFor(
      view,
      CHUNK_RENDER.preloadMarginPx,
      this.chunkPx,
      chunksX,
      chunksY,
      this.needed,
    );
    const visible = chunkRangeFor(view, 0, this.chunkPx, chunksX, chunksY, this.visible);
    if (rangeSize(needed) > this.slots.length) {
      throw new Error(
        `Chunk pool too small: need ${rangeSize(needed)} layers, have ${this.slots.length}`,
      );
    }
    this.stats.uploads = 0;

    // Free slots whose chunk drifted out of range.
    for (const index of this.loaded.keys()) {
      if (inRange(needed, index % chunksX, Math.floor(index / chunksX))) continue;
      const slot = this.loaded.get(index);
      if (!slot) continue;
      slot.container.setVisible(false);
      slot.chunkIndex = -1;
      slot.dirty = false;
      this.loaded.delete(index);
      this.stats.unloads++;
    }

    // Visible chunks load immediately; preloads are rate-limited per frame.
    const lateLoads = this.load(visible, Infinity);
    if (this.warmedUp) this.stats.lateLoads += lateLoads;
    this.warmedUp = true;
    budget.remaining -= this.load(needed, budget.remaining);

    // Edits since last frame: one texture upload per touched chunk.
    for (const slot of this.loaded.values()) {
      if (!slot.dirty) continue;
      slot.layer.generateLayerDataTexture();
      slot.dirty = false;
      this.stats.uploads++;
    }
    this.stats.loaded = this.loaded.size;
  }

  /**
   * Recomputes the frames in a rectangle of tiles (for layers whose frames depend on data other
   * than the tile layer, like the Gloam overlay). Touched chunks re-upload at the next update.
   */
  refreshRect(x0: number, y0: number, width: number, height: number): void {
    const size = this.world.chunkSize;
    const xs = Math.max(0, x0);
    const ys = Math.max(0, y0);
    const xe = Math.min(this.world.width, x0 + width);
    const ye = Math.min(this.world.height, y0 + height);
    for (let ty = ys; ty < ye; ty++) {
      const cy = Math.floor(ty / size);
      for (let tx = xs; tx < xe; tx++) {
        const cx = Math.floor(tx / size);
        const slot = this.loaded.get(cy * this.world.chunksX + cx);
        const tile = slot?.tiles[ty - cy * size]?.[tx - cx * size];
        if (!slot || !tile) continue;
        const frame = this.frameAt(tx, ty);
        if (tile.index === frame) continue;
        tile.index = frame;
        slot.dirty = true;
      }
    }
  }

  /** Sets the opacity of the whole layer (every chunk). */
  setAlpha(alpha: number): void {
    for (const slot of this.slots) slot.container.setAlpha(alpha);
  }

  /** World-space rectangles of loaded chunks, for the debug overlay's chunk borders. */
  forEachLoaded(fn: (x: number, y: number, size: number) => void): void {
    for (const index of this.loaded.keys()) {
      const cx = index % this.world.chunksX;
      const cy = Math.floor(index / this.world.chunksX);
      fn(cx * this.chunkPx, cy * this.chunkPx, this.chunkPx);
    }
  }

  destroy(): void {
    this.unsubscribe();
  }

  /** Loads chunks in range that aren't loaded yet, within budget; returns how many it loaded. */
  private load(range: ChunkRange, budget: number): number {
    const { chunksX } = this.world;
    let loadedNow = 0;
    for (let cy = range.cy0; cy <= range.cy1; cy++) {
      for (let cx = range.cx0; cx <= range.cx1; cx++) {
        const index = cy * chunksX + cx;
        if (this.loaded.has(index)) continue;
        const chunk = this.world.chunks[index];
        if (!chunk) continue;
        if (budget <= 0) return loadedNow;
        const slot = this.slots.find((s) => s.chunkIndex === -1);
        if (!slot) return loadedNow; // Unreachable: update() checks the pool size first.
        slot.chunkIndex = index;
        this.loaded.set(index, slot);
        this.fill(slot, chunk.x0, chunk.y0);
        loadedNow++;
        budget--;
      }
    }
    return loadedNow;
  }

  private fill(slot: Slot, x0: number, y0: number): void {
    const size = this.world.chunkSize;
    for (let y = 0; y < size; y++) {
      const row = slot.tiles[y];
      if (!row) continue;
      for (let x = 0; x < size; x++) {
        const tile = row[x];
        if (tile) tile.index = this.frameAt(x0 + x, y0 + y);
      }
    }
    slot.layer.generateLayerDataTexture();
    slot.container.setPosition(x0 * TILE_SIZE, y0 * TILE_SIZE).setVisible(true);
    slot.dirty = false;
    this.stats.uploads++;
  }

  /** Recomputes the frames of (x, y) and its 8 neighbours in whichever loaded chunks hold them. */
  private refreshAround(x: number, y: number): void {
    const size = this.world.chunkSize;
    for (let ty = y - 1; ty <= y + 1; ty++) {
      for (let tx = x - 1; tx <= x + 1; tx++) {
        if (!this.world.inBounds(tx, ty)) continue;
        const cx = Math.floor(tx / size);
        const cy = Math.floor(ty / size);
        const slot = this.loaded.get(cy * this.world.chunksX + cx);
        const tile = slot?.tiles[ty - cy * size]?.[tx - cx * size];
        if (!slot || !tile) continue;
        const frame = this.frameAt(tx, ty);
        if (tile.index === frame) continue;
        tile.index = frame;
        slot.dirty = true;
      }
    }
  }
}
