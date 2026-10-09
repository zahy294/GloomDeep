import { describe, expect, it } from 'vitest';
import { AUTOTILE } from '../../src/config';
import { PALETTE, PALETTE_COLORS } from '../../src/data/palette';
import { TILES } from '../../src/data/tiles';
import { BLOB_INDEX, FRAMES_PER_TILE, FRAME_COUNT, frameBase } from '../../src/sim/world/autotile';
import {
  CRACK_STAGES,
  buildCracksAtlas,
  buildPlaceholderAtlas,
  type Atlas,
} from '../../tools/lib/placeholderAtlas';

const opts = { tileSize: 16, columns: 48, seed: 1234, speckleChance: 28 };

function pixel(atlas: Atlas, frame: number, px: number, py: number): number {
  const x = (frame % atlas.columns) * atlas.tileSize + px;
  const y = Math.floor(frame / atlas.columns) * atlas.tileSize + py;
  const i = (y * atlas.width + x) * 4;
  if (atlas.data[i + 3] === 0) return -1;
  return (atlas.data[i]! << 16) | (atlas.data[i + 1]! << 8) | atlas.data[i + 2]!;
}

function luminance(rgb: number): number {
  return 0.299 * ((rgb >> 16) & 0xff) + 0.587 * ((rgb >> 8) & 0xff) + 0.114 * (rgb & 0xff);
}

function meanLuminance(atlas: Atlas): number {
  let sum = 0;
  let count = 0;
  for (let i = 0; i < atlas.data.length; i += 4) {
    if (atlas.data[i + 3] === 0) continue;
    sum += luminance((atlas.data[i]! << 16) | (atlas.data[i + 1]! << 8) | atlas.data[i + 2]!);
    count++;
  }
  return sum / count;
}

function opaqueCount(atlas: Atlas, stage: number): number {
  let n = 0;
  for (let y = 0; y < atlas.tileSize; y++) {
    for (let x = 0; x < atlas.tileSize; x++) {
      const i = (y * atlas.width + stage * atlas.tileSize + x) * 4;
      if (atlas.data[i + 3] !== 0) n++;
    }
  }
  return n;
}

describe('placeholder blob atlas', () => {
  const tiles = buildPlaceholderAtlas(TILES, opts, 'tiles');
  const walls = buildPlaceholderAtlas(TILES, opts, 'walls');
  const stoneRamp = PALETTE.stone;
  const stoneBase = frameBase(4);

  it('is deterministic for a given seed', () => {
    const again = buildPlaceholderAtlas(TILES, opts, 'tiles');
    expect(Buffer.from(tiles.data).equals(Buffer.from(again.data))).toBe(true);
  });

  it('sizes the atlas to the frame layout, with no frame for air', () => {
    expect(tiles.frameCount).toBe(FRAME_COUNT);
    expect(tiles.width).toBe(48 * 16);
    expect(tiles.height).toBe(Math.ceil(FRAME_COUNT / 48) * 16);
    expect(walls.width).toBe(tiles.width);
    expect(walls.height).toBe(tiles.height);
    // Frame 0 is fully transparent (the GPU tilemap samples it for empty cells); tile 1 starts at 1.
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++) expect(pixel(tiles, 0, x, y)).toBe(-1);
    expect(pixel(tiles, 1, 8, 0)).not.toBe(-1);
    expect(frameBase(1)).toBe(1);
    expect(FRAMES_PER_TILE).toBe(AUTOTILE.blobShapes * AUTOTILE.variations);
  });

  it('only uses opaque master-palette colours, in tiles and walls', () => {
    const palette = new Set(PALETTE_COLORS);
    // Count violations and assert once: an expect() per pixel is far too slow for a big atlas.
    const bad: string[] = [];
    for (const atlas of [tiles, walls]) {
      for (let i = 0; i < atlas.data.length; i += 4) {
        if (atlas.data[i + 3] === 0) continue;
        const rgb = (atlas.data[i]! << 16) | (atlas.data[i + 1]! << 8) | atlas.data[i + 2]!;
        if (atlas.data[i + 3] !== 255 || !palette.has(rgb))
          bad.push(`#${rgb.toString(16)}@${i / 4}`);
      }
    }
    expect(bad.slice(0, 5)).toEqual([]);
  });

  it('outlines all four sides of an isolated tile', () => {
    const frame = stoneBase + BLOB_INDEX[0]! * AUTOTILE.variations;
    for (let i = 0; i < 16; i++) {
      expect(pixel(tiles, frame, i, 0)).toBe(stoneRamp[0]);
      expect(pixel(tiles, frame, i, 15)).toBe(stoneRamp[0]);
      expect(pixel(tiles, frame, 0, i)).toBe(stoneRamp[0]);
      expect(pixel(tiles, frame, 15, i)).toBe(stoneRamp[0]);
    }
  });

  it('draws no outline on the edges of a fully connected tile', () => {
    const frame = stoneBase + BLOB_INDEX[255]! * AUTOTILE.variations;
    let darkOnEdge = 0;
    for (let i = 0; i < 16; i++) {
      for (const c of [
        pixel(tiles, frame, i, 0),
        pixel(tiles, frame, i, 15),
        pixel(tiles, frame, 0, i),
        pixel(tiles, frame, 15, i),
      ]) {
        if (c === stoneRamp[0]) darkOnEdge++;
      }
    }
    // Only occasional dark speckles, never a continuous line (64 edge pixels in total).
    expect(darkOnEdge).toBeLessThan(16);
    expect(pixel(tiles, frame, 0, 0)).not.toBe(-1);
  });

  it('notches an inner corner but leaves the other corners plain', () => {
    // All neighbours joined except NE.
    const mask = 255 & ~2;
    const frame = stoneBase + BLOB_INDEX[mask]! * AUTOTILE.variations;
    for (const [x, y] of [
      [14, 0],
      [15, 0],
      [14, 1],
      [15, 1],
    ] as const) {
      expect(pixel(tiles, frame, x, y)).toBe(stoneRamp[0]);
    }
  });

  it('gives the three variations different speckles', () => {
    const base = stoneBase + BLOB_INDEX[255]! * AUTOTILE.variations;
    const sig = (v: number) => {
      let s = '';
      for (let y = 2; y < 14; y++) for (let x = 2; x < 14; x++) s += pixel(tiles, base + v, x, y);
      return s;
    };
    expect(new Set([sig(0), sig(1), sig(2)]).size).toBe(3);
  });

  it('draws walls darker than foreground tiles', () => {
    expect(meanLuminance(walls)).toBeLessThan(meanLuminance(tiles));
  });

  it('rejects a registry whose ids do not match their positions', () => {
    const broken = [TILES[0]!, { ...TILES[2]!, id: 5 }];
    expect(() => buildPlaceholderAtlas(broken, opts)).toThrow(/id 5/);
  });
});

describe('placeholder crack atlas', () => {
  const cracks = buildCracksAtlas(opts);

  it('has four 16x16 frames in one row, transparent background', () => {
    expect(cracks.width).toBe(CRACK_STAGES * 16);
    expect(cracks.height).toBe(16);
    expect(opaqueCount(cracks, 0)).toBeGreaterThan(0);
    expect(opaqueCount(cracks, 3)).toBeLessThan(16 * 16);
  });

  it('adds more crack pixels at each stage, all in one palette colour', () => {
    for (let s = 1; s < CRACK_STAGES; s++) {
      expect(opaqueCount(cracks, s)).toBeGreaterThan(opaqueCount(cracks, s - 1));
    }
    const colors = new Set<number>();
    for (let i = 0; i < cracks.data.length; i += 4) {
      if (cracks.data[i + 3] === 0) continue;
      expect(cracks.data[i + 3]).toBe(255);
      colors.add((cracks.data[i]! << 16) | (cracks.data[i + 1]! << 8) | cracks.data[i + 2]!);
    }
    expect([...colors]).toEqual([PALETTE.tealShadow[0]]);
  });
});
