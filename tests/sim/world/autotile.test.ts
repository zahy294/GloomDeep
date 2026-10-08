import { describe, expect, it } from 'vitest';
import { AUTOTILE } from '../../../src/config';
import { tileId } from '../../../src/data/tiles';
import {
  BLOB_INDEX,
  BLOB_MASKS,
  E,
  FRAME_COUNT,
  FRAMES_PER_TILE,
  N,
  NE,
  S,
  SE,
  W,
  blobMask,
  connects,
  frameBase,
  iconFrame,
  tileFrame,
  variationAt,
} from '../../../src/sim/world/autotile';
import { World } from '../../../src/sim/world/World';

const soil = tileId('forest_soil');
const grass = tileId('elderglade_grass');
const stone = tileId('stone');
const V = AUTOTILE.variations;

function world(w = 5, h = 5): World {
  return new World({ width: w, height: h, chunkSize: 4 });
}

describe('blob masks', () => {
  it('has exactly 47 reduced masks in ascending order', () => {
    expect(BLOB_MASKS).toHaveLength(47);
    expect([...BLOB_MASKS]).toEqual([...BLOB_MASKS].sort((a, b) => a - b));
  });

  it('maps every raw mask into 0..46', () => {
    for (let raw = 0; raw < 256; raw++) {
      const i = BLOB_INDEX[raw]!;
      expect(i).toBeGreaterThanOrEqual(0);
      expect(i).toBeLessThan(47);
    }
  });

  it('ignores corners whose adjacent edges are not both joined', () => {
    expect(BLOB_INDEX[NE]).toBe(BLOB_INDEX[0]);
    expect(BLOB_INDEX[N | NE]).toBe(BLOB_INDEX[N]);
    expect(BLOB_INDEX[N | E | NE]).not.toBe(BLOB_INDEX[N | E]);
    expect(BLOB_INDEX[S | W | SE]).toBe(BLOB_INDEX[S | W]);
  });
});

describe('connects', () => {
  it('is symmetric and never joins air', () => {
    for (let a = 0; a < 10; a++) {
      for (let b = 0; b < 10; b++) expect(connects(a, b)).toBe(connects(b, a));
    }
    expect(connects(0, 0)).toBe(false);
    expect(connects(0, soil)).toBe(false);
    expect(connects(soil, 0)).toBe(false);
  });

  it('follows the merge rules', () => {
    expect(connects(stone, stone)).toBe(true);
    expect(connects(grass, soil)).toBe(true);
    expect(connects(soil, grass)).toBe(true);
    expect(connects(grass, stone)).toBe(false);
  });
});

describe('tileFrame', () => {
  it('returns -1 for air', () => {
    expect(tileFrame(world(), 'fg', 2, 2)).toBe(-1);
  });

  it('uses the isolated shape for a lone tile', () => {
    const w = world();
    w.set(2, 2, stone);
    expect(tileFrame(w, 'fg', 2, 2)).toBe(frameBase(stone) + variationAt(2, 2));
    expect(iconFrame(stone)).toBe(frameBase(stone));
  });

  it('uses the all-joined shape for a surrounded tile', () => {
    const w = world();
    for (let y = 1; y <= 3; y++) for (let x = 1; x <= 3; x++) w.set(x, y, stone);
    expect(blobMask(w, 'fg', 2, 2)).toBe(255);
    expect(tileFrame(w, 'fg', 2, 2)).toBe(
      frameBase(stone) + BLOB_INDEX[255]! * V + variationAt(2, 2),
    );
  });

  it('counts the world edge as joined', () => {
    const w = world(3, 3);
    w.set(0, 0, stone);
    // Only the N, NE, E... sides that leave the world are joined; the inside neighbours are air.
    const mask = blobMask(w, 'fg', 0, 0);
    expect(mask & N).toBe(N);
    expect(mask & W).toBe(W);
    expect(mask & E).toBe(0);
    expect(mask & S).toBe(0);
    expect(mask & SE).toBe(0);
  });

  it('joins merging tiles but not unrelated ones', () => {
    const w = world();
    w.set(1, 2, grass);
    w.set(2, 2, soil);
    w.set(3, 2, tileId('moss'));
    expect(blobMask(w, 'fg', 1, 2) & E).toBe(E);
    expect(blobMask(w, 'fg', 2, 2) & W).toBe(W);
    expect(blobMask(w, 'fg', 2, 2) & E).toBe(0);
  });

  it('works on the background layer independently', () => {
    const w = world();
    w.setBg(2, 2, soil);
    w.set(2, 1, soil);
    expect(tileFrame(w, 'bg', 2, 2)).toBe(frameBase(soil) + variationAt(2, 2));
    expect(tileFrame(w, 'fg', 2, 2)).toBe(-1);
  });

  it('keeps every frame inside the atlas and variations stable', () => {
    const w = world(16, 16);
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) w.set(x, y, 1 + ((x * 3 + y * 5) % 9));
    }
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        const f = tileFrame(w, 'fg', x, y);
        expect(f).toBeGreaterThanOrEqual(0);
        expect(f).toBeLessThan(FRAME_COUNT);
        expect(variationAt(x, y)).toBe(variationAt(x, y));
        expect(variationAt(x, y)).toBeLessThan(V);
      }
    }
    expect(FRAME_COUNT).toBe(1 + 9 * FRAMES_PER_TILE);
  });
});
