import { describe, expect, it } from 'vitest';
import { PALETTE } from '../../src/data/palette';
import { BLOB_MASKS, E, N, S, W } from '../../src/sim/world/autotile';
import { dominantRamp, generateAutotiles } from '../../tools/lib/autotileGen';
import { createImage, getAlpha, getRgb, setPixel, type RgbaImage } from '../../tools/lib/image';

const COLUMNS = 48;
const SIZE = 16;
const VARIATIONS = 3;
const OUTLINE = PALETTE.soil[0];

/** 64x64 texture of soil-ramp colours (positions encoded so cuts are distinguishable). */
function baseTexture(): RgbaImage {
  const img = createImage(64, 64);
  const colours = [PALETTE.soil[1], PALETTE.soil[2], PALETTE.soil[3]];
  for (let y = 0; y < 64; y++) {
    for (let x = 0; x < 64; x++) {
      setPixel(img, x, y, colours[(x * 7 + y * 13 + ((x * y) % 5)) % 3]!);
    }
  }
  return img;
}

const set = generateAutotiles(baseTexture());

function frameOf(mask: number, variation = 0): number {
  return BLOB_MASKS.indexOf(mask) * VARIATIONS + variation;
}
function at(frame: number, x: number, y: number): number {
  return getRgb(set, (frame % COLUMNS) * SIZE + x, Math.floor(frame / COLUMNS) * SIZE + y);
}

describe('generateAutotiles', () => {
  it('has the layout of one tile block', () => {
    expect(set.width).toBe(COLUMNS * SIZE);
    expect(set.height).toBe(3 * SIZE);
    expect(BLOB_MASKS).toHaveLength(47);
    // Last real frame is 140; frames 141..143 stay empty.
    expect(getAlpha(set, (140 % COLUMNS) * SIZE + 8, Math.floor(140 / COLUMNS) * SIZE + 8)).toBe(
      255,
    );
    expect(getAlpha(set, (141 % COLUMNS) * SIZE + 8, Math.floor(141 / COLUMNS) * SIZE + 8)).toBe(0);
  });

  it('picks the dominant ramp', () => {
    expect(dominantRamp(baseTexture(), [PALETTE.soil, PALETTE.leaf, PALETTE.stone])).toBe(
      PALETTE.soil,
    );
  });

  it('outlines every side of the isolated shape in the ramp darkest shade', () => {
    const f = frameOf(0);
    for (let i = 0; i < SIZE; i++) {
      expect(at(f, i, 0)).toBe(OUTLINE);
      expect(at(f, i, SIZE - 1)).toBe(OUTLINE);
      expect(at(f, 0, i)).toBe(OUTLINE);
      expect(at(f, SIZE - 1, i)).toBe(OUTLINE);
    }
  });

  it('has no outline on the fully connected shape', () => {
    const f = frameOf(255);
    for (let i = 0; i < SIZE; i++) {
      for (const [x, y] of [
        [i, 0],
        [i, SIZE - 1],
        [0, i],
        [SIZE - 1, i],
      ] as const) {
        expect(at(f, x, y)).not.toBe(OUTLINE);
      }
    }
  });

  it('notches an inner corner', () => {
    const f = frameOf(N | E | S | W);
    // N|E|S|W without corners: all four corners are notches.
    expect(BLOB_MASKS).toContain(N | E | S | W);
    expect(at(f, SIZE - 1, 0)).toBe(OUTLINE);
    expect(at(f, SIZE - 2, 1)).toBe(OUTLINE);
    expect(at(f, 0, 0)).toBe(OUTLINE);
    expect(at(f, 8, 0)).not.toBe(OUTLINE);
    expect(at(f, 8, 8)).not.toBe(OUTLINE);
  });

  it('draws a highlight just inside an exposed top edge only', () => {
    const exposed = frameOf(S | E | W);
    expect(at(exposed, 8, 1)).toBe(PALETTE.soil[2]);
    const covered = frameOf(255);
    expect(at(covered, 8, 1)).toBe(getRgb(baseTexture(), 8, 1));
  });

  it('makes variations differ', () => {
    const f = frameOf(255);
    let different = 0;
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) if (at(f, x, y) !== at(f + 1, x, y)) different++;
    }
    expect(different).toBeGreaterThan(20);
  });

  it('takes interior pixels from the source texture', () => {
    const base = baseTexture();
    const f = frameOf(255, 0);
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) expect(at(f, x, y)).toBe(getRgb(base, x, y));
    }
    // Variation 1 starts at (32, 16) and wraps around the 64px texture.
    const g = frameOf(255, 1);
    expect(at(g, 3, 5)).toBe(getRgb(base, 35, 21));
  });

  it('only uses palette colours for a palette-matched texture', () => {
    const allowed = new Set<number>(Object.values(PALETTE).flat());
    for (let y = 0; y < set.height; y++) {
      for (let x = 0; x < COLUMNS * SIZE; x++) {
        if (getAlpha(set, x, y) === 0) continue;
        expect(allowed.has(getRgb(set, x, y))).toBe(true);
      }
    }
  });
});
