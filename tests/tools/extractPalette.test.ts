import { describe, expect, it } from 'vitest';
import { oklabDistance, rgbToOklab } from '../../tools/lib/color';
import { createImage, setPixel } from '../../tools/lib/image';
import { extractPalette, paletteSwatches } from '../../tools/lib/extractPalette';

const RAMPS = [
  [0x1a0a2e, 0x3d1a6e, 0x6a35b8, 0xa77cf0],
  [0x0b3b1a, 0x1b6b2c, 0x3fa044, 0x8be07a],
  [0x4a0f0f, 0x8a1f1f, 0xd03a2a, 0xff8a6a],
  [0x0a2a4a, 0x14508a, 0x2a86d0, 0x7ac4ff],
];

function build() {
  const img = createImage(16, 16);
  let i = 0;
  for (const ramp of RAMPS) {
    for (const c of ramp) {
      for (let k = 0; k < 16; k++) {
        setPixel(img, i % 16, Math.floor(i / 16), c);
        i++;
      }
    }
  }
  return img;
}

describe('extractPalette', () => {
  it('recovers known colours within a small OKLab distance', () => {
    const ramps = extractPalette(build());
    expect(ramps).toHaveLength(4);
    const all = ramps.flat().map(rgbToOklab);
    for (const c of RAMPS.flat()) {
      const d = Math.min(...all.map((q) => oklabDistance(rgbToOklab(c), q)));
      expect(d).toBeLessThan(0.02);
    }
  });

  it('keeps each source ramp together, ordered dark to light', () => {
    const ramps = extractPalette(build());
    for (const ramp of ramps) {
      expect(ramp).toHaveLength(4);
      const ls = ramp.map((c) => rgbToOklab(c).L);
      expect([...ls].sort((a, b) => a - b)).toEqual(ls);
      const source = RAMPS.find((r) => r.includes(ramp[0]!));
      expect(source).toBeDefined();
      expect(ramp.every((c) => source!.includes(c))).toBe(true);
    }
  });

  it('is deterministic', () => {
    expect(extractPalette(build())).toEqual(extractPalette(build()));
  });

  it('allows fewer colours than requested and ignores transparent pixels', () => {
    const img = createImage(4, 1);
    setPixel(img, 0, 0, 0x102030);
    setPixel(img, 1, 0, 0x405060);
    setPixel(img, 2, 0, 0xff00ff, 0);
    const ramps = extractPalette(img);
    expect(ramps.flat().sort()).toEqual([0x102030, 0x405060]);
  });

  it('draws one swatch row per ramp', () => {
    const sw = paletteSwatches(RAMPS);
    expect(sw.width).toBe(32);
    expect(sw.height).toBe(32);
  });
});
