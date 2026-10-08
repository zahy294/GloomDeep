/** Pure helpers for deciding which chunks the renderer needs. No Phaser, so they're unit-tested. */

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ChunkRange {
  cx0: number;
  cy0: number;
  cx1: number;
  cy1: number;
}

const clamp = (v: number, max: number) => Math.min(max, Math.max(0, v));

/**
 * Inclusive range of chunk coordinates overlapping `rect` (pixels), grown by `margin` pixels on
 * every side and clamped to the world's chunk grid.
 * Writes into `out` when given, so per-frame callers don't allocate.
 */
export function chunkRangeFor(
  rect: Rect,
  margin: number,
  chunkPx: number,
  chunksX: number,
  chunksY: number,
  out: ChunkRange = { cx0: 0, cy0: 0, cx1: 0, cy1: 0 },
): ChunkRange {
  out.cx0 = clamp(Math.floor((rect.x - margin) / chunkPx), chunksX - 1);
  out.cy0 = clamp(Math.floor((rect.y - margin) / chunkPx), chunksY - 1);
  // Subtract a hair so a rect ending exactly on a chunk edge doesn't pull in the next chunk.
  out.cx1 = clamp(Math.floor((rect.x + rect.width + margin - 1e-6) / chunkPx), chunksX - 1);
  out.cy1 = clamp(Math.floor((rect.y + rect.height + margin - 1e-6) / chunkPx), chunksY - 1);
  return out;
}

export function inRange(range: ChunkRange, cx: number, cy: number): boolean {
  return cx >= range.cx0 && cx <= range.cx1 && cy >= range.cy0 && cy <= range.cy1;
}

export function rangeSize(range: ChunkRange): number {
  return (range.cx1 - range.cx0 + 1) * (range.cy1 - range.cy0 + 1);
}
