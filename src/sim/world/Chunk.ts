/**
 * Bookkeeping for one chunkSize × chunkSize block of the world. Tile data itself lives in the
 * World's flat arrays; a chunk only tracks changes.
 *
 * `version` increases on every change, so several consumers (renderer, saver) can each remember
 * the version they last processed. `dirty` is the plan's single "needs saving/upload" flag.
 */
export class Chunk {
  readonly x0: number;
  readonly y0: number;
  version = 0;
  dirty = false;

  constructor(
    readonly cx: number,
    readonly cy: number,
    size: number,
  ) {
    this.x0 = cx * size;
    this.y0 = cy * size;
  }

  markChanged(): void {
    this.version++;
    this.dirty = true;
  }
}
