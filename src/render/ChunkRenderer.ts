import * as Phaser from 'phaser';
import { CHUNK_RENDER, TILE_SIZE } from '../config';
import { AIR, type World } from '../sim/world/World';
import { chunkRangeFor, inRange, rangeSize, type ChunkRange, type Rect } from './chunkMath';
import { Depth } from './depth';

/** Phaser's "empty tile" index; the GPU layer skips sampling for it. */
const EMPTY = -1;

interface Slot {
  /** Positioned at the chunk origin; the layer inside stays at (0, 0). See the class comment. */
  container: Phaser.GameObjects.Container;
  layer: Phaser.Tilemaps.TilemapGPULayer;
  tiles: Phaser.Tilemaps.Tile[][];
  /** World chunk index this slot currently shows, or -1 when free. */
  chunkIndex: number;
  /** Chunk.version that was last uploaded. */
  version: number;
}

export interface ChunkRenderStats {
  loaded: number;
  /** Chunk uploads in the last update. */
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
 * Draws the foreground tiles as one TilemapGPULayer per chunk, around the camera only.
 *
 * TilemapGPULayer keeps a Tile object per cell and rebuilds its GPU data texture from them, and the
 * world (4200 tiles wide) exceeds its 4096-tile limit. So a fixed pool of chunk-sized layers is
 * created once and re-pointed at whichever chunks are near the view: refilling 128×128 indices and
 * regenerating the texture is cheap, creating tilemaps on the fly is not.
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
  private readonly needed: ChunkRange = { cx0: 0, cy0: 0, cx1: 0, cy1: 0 };
  private readonly visible: ChunkRange = { cx0: 0, cy0: 0, cx1: 0, cy1: 0 };
  /** The first update loads the initial view synchronously; that is not a late load. */
  private warmedUp = false;

  constructor(
    scene: Phaser.Scene,
    private readonly world: World,
    textureKey: string,
    poolSize: number = CHUNK_RENDER.poolSize,
  ) {
    const size = world.chunkSize;
    this.chunkPx = size * TILE_SIZE;
    const blank = Array.from({ length: size }, () => new Array<number>(size).fill(EMPTY));

    for (let i = 0; i < poolSize; i++) {
      const map = scene.make.tilemap({
        data: blank,
        tileWidth: TILE_SIZE,
        tileHeight: TILE_SIZE,
      });
      // gid 0: tile index === tile id === frame in the atlas (see tools/lib/placeholderAtlas.ts).
      const tileset = map.addTilesetImage('tiles', textureKey, TILE_SIZE, TILE_SIZE, 0, 0, 0);
      if (!tileset) throw new Error(`Tile texture "${textureKey}" is not loaded`);
      const layer = map.createLayer(0, tileset, 0, 0, true);
      if (!(layer instanceof Phaser.Tilemaps.TilemapGPULayer)) {
        throw new Error('Could not create a TilemapGPULayer (WebGL required)');
      }
      const container = scene.add.container(0, 0, [layer]);
      container.setDepth(Depth.foregroundTiles).setVisible(false);
      this.slots.push({ container, layer, tiles: layer.layer.data, chunkIndex: -1, version: -1 });
    }
  }

  /** Call once per frame with the camera's world view. */
  update(view: Rect): void {
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
      this.loaded.delete(index);
      this.stats.unloads++;
    }

    // Visible chunks are loaded/refreshed immediately; preloads are rate-limited per frame.
    const lateLoads = this.sync(visible, Infinity);
    if (this.warmedUp) this.stats.lateLoads += lateLoads;
    this.warmedUp = true;
    this.sync(needed, CHUNK_RENDER.maxPreloadsPerFrame);
    this.stats.loaded = this.loaded.size;
  }

  /** Call after a teleport: the next update may legitimately build the new view synchronously. */
  resetWarmUp(): void {
    this.warmedUp = false;
  }

  /** World-space rectangles of loaded chunks, for the debug overlay's chunk borders. */
  forEachLoaded(fn: (x: number, y: number, size: number) => void): void {
    for (const index of this.loaded.keys()) {
      const cx = index % this.world.chunksX;
      const cy = Math.floor(index / this.world.chunksX);
      fn(cx * this.chunkPx, cy * this.chunkPx, this.chunkPx);
    }
  }

  /** Loads or refreshes chunks in range within budget; returns how many were newly loaded. */
  private sync(range: ChunkRange, budget: number): number {
    let newlyLoaded = 0;
    const { chunksX } = this.world;
    for (let cy = range.cy0; cy <= range.cy1; cy++) {
      for (let cx = range.cx0; cx <= range.cx1; cx++) {
        const index = cy * chunksX + cx;
        const chunk = this.world.chunks[index];
        if (!chunk) continue;
        let slot = this.loaded.get(index);
        if (slot && slot.version === chunk.version) continue;
        if (budget <= 0) return newlyLoaded;
        if (!slot) {
          slot = this.slots.find((s) => s.chunkIndex === -1);
          if (!slot) return newlyLoaded; // Unreachable: update() checks the pool size first.
          slot.chunkIndex = index;
          this.loaded.set(index, slot);
          newlyLoaded++;
        }
        this.upload(slot, chunk.x0, chunk.y0, chunk.version);
        budget--;
      }
    }
    return newlyLoaded;
  }

  private upload(slot: Slot, x0: number, y0: number, version: number): void {
    const { fg, width, height } = this.world;
    const size = this.world.chunkSize;
    for (let y = 0; y < size; y++) {
      const row = slot.tiles[y];
      if (!row) continue;
      const wy = y0 + y;
      for (let x = 0; x < size; x++) {
        const tile = row[x];
        if (!tile) continue;
        const wx = x0 + x;
        const id = wx < width && wy < height ? (fg[wy * width + wx] ?? AIR) : AIR;
        tile.index = id === AIR ? EMPTY : id;
      }
    }
    slot.layer.generateLayerDataTexture();
    slot.container.setPosition(x0 * TILE_SIZE, y0 * TILE_SIZE).setVisible(true);
    slot.version = version;
    this.stats.uploads++;
  }
}
