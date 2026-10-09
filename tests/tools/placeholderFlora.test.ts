import { describe, expect, it } from 'vitest';
import { SURFACE_BIOMES } from '../../src/data/biomes';
import { PALETTE_COLORS } from '../../src/data/palette';
import {
  FG_CANOPY_SIZE,
  PARALLAX_LAYERS,
  PARALLAX_SIZE,
  SPRITE_ASSETS,
  parallaxAssetId,
  spriteAsset,
} from '../../src/data/spriteAssets';
import { TILES } from '../../src/data/tiles';
import { getAlpha, getRgb, type RgbaImage } from '../../tools/lib/image';
import { buildFlora, buildParticles, buildSaplings } from '../../tools/lib/placeholderFlora';
import { buildForegroundCanopy, buildParallaxLayer } from '../../tools/lib/placeholderParallax';

const palette = new Set(PALETTE_COLORS);

function frameOf(sheet: RgbaImage, fw: number, fh: number, index: number) {
  const pixels: { x: number; y: number; rgb: number }[] = [];
  for (let y = 0; y < fh; y++) {
    for (let x = 0; x < fw; x++) {
      const alpha = getAlpha(sheet, index * fw + x, y);
      expect([0, 255]).toContain(alpha);
      if (alpha === 255) pixels.push({ x, y, rgb: getRgb(sheet, index * fw + x, y) });
    }
  }
  return pixels;
}

const same = (a: RgbaImage, b: RgbaImage) => Buffer.from(a.data).equals(Buffer.from(b.data));

describe('placeholder sheets', () => {
  it('flora: 16 frames of 16x32; ground plants touch the bottom, ceiling plants the top', () => {
    const def = spriteAsset('flora')!;
    const sheet = buildFlora();
    expect([sheet.width, sheet.height]).toEqual([16 * def.frames, 32]);
    const ceiling = new Set(
      TILES.filter((t) => t.decor?.sprite === 'flora' && t.decor.support === 'ceiling').map(
        (t) => t.decor!.frame,
      ),
    );
    expect(ceiling.size).toBeGreaterThan(0);
    for (let f = 0; f < def.frames; f++) {
      const px = frameOf(sheet, def.frameWidth, def.frameHeight, f);
      expect(px.length).toBeGreaterThan(8);
      for (const p of px) expect(palette.has(p.rgb)).toBe(true);
      if (ceiling.has(f)) expect(px.some((p) => p.y === 0)).toBe(true);
      else expect(px.some((p) => p.y === 31)).toBe(true);
      // Never a block: a frame fills well under half of its 16x32 box.
      expect(px.length).toBeLessThan(0.45 * 16 * 32);
    }
  });

  it('every decor tile points at an existing frame', () => {
    for (const t of TILES) {
      if (!t.decor) continue;
      const def = spriteAsset(t.decor.sprite);
      expect(def, t.key).toBeDefined();
      expect(t.decor.frame).toBeLessThan(def!.frames);
    }
  });

  it('saplings: 3 frames of 48x80 standing on the bottom edge, centred', () => {
    const def = spriteAsset('saplings')!;
    const sheet = buildSaplings();
    expect([sheet.width, sheet.height]).toEqual([48 * 3, 80]);
    for (let f = 0; f < def.frames; f++) {
      const px = frameOf(sheet, 48, 80, f);
      expect(px.length).toBeGreaterThan(100);
      for (const p of px) expect(palette.has(p.rgb)).toBe(true);
      const base = px.filter((p) => p.y === 79);
      expect(base.length).toBeGreaterThan(0);
      const centre = base.reduce((s, p) => s + p.x, 0) / base.length;
      expect(Math.abs(centre - 23.5)).toBeLessThan(3);
    }
  });

  it('particles: 7 non-empty 8x8 frames', () => {
    const sheet = buildParticles();
    expect([sheet.width, sheet.height]).toEqual([56, 8]);
    for (let f = 0; f < 7; f++) {
      const px = frameOf(sheet, 8, 8, f);
      expect(px.length).toBeGreaterThan(3);
      for (const p of px) expect(palette.has(p.rgb)).toBe(true);
    }
  });
});

/** Row of the first opaque pixel in column x (height when empty). */
function topOf(img: RgbaImage, x: number): number {
  for (let y = 0; y < img.height; y++) if (getAlpha(img, x, y) > 0) return y;
  return img.height;
}

describe('parallax layers and foreground canopy', () => {
  it('registers every surface biome x layer plus the canopy as standalone assets', () => {
    for (const b of SURFACE_BIOMES) {
      for (let n = 0; n < PARALLAX_LAYERS; n++) {
        const def = spriteAsset(parallaxAssetId(b.key, n))!;
        expect(def.standalone).toBe(true);
        expect([def.frameWidth, def.frameHeight, def.frames]).toEqual([480, 240, 1]);
      }
    }
    expect(spriteAsset('fg-canopy')).toMatchObject({
      standalone: true,
      frameWidth: 480,
      frameHeight: 120,
    });
    expect(new Set(SPRITE_ASSETS.map((s) => s.id)).size).toBe(SPRITE_ASSETS.length);
  });

  for (const b of SURFACE_BIOMES) {
    for (let n = 0; n < PARALLAX_LAYERS; n++) {
      it(`${b.key} layer ${n}: size, transparent sky, joins at the seam, deterministic`, () => {
        const img = buildParallaxLayer(b.key, n);
        expect([img.width, img.height]).toEqual([PARALLAX_SIZE.width, PARALLAX_SIZE.height]);
        let partial = 0;
        for (let y = 0; y < img.height; y++) {
          for (let x = 0; x < img.width; x++) {
            const a = getAlpha(img, x, y);
            if (a !== 0 && a !== 255) partial++;
          }
        }
        expect(partial).toBe(0);
        // Ground fills the bottom row; there is open sky above the silhouette.
        for (let x = 0; x < img.width; x++) expect(getAlpha(img, x, img.height - 1)).toBe(255);
        const tops = Array.from({ length: img.width }, (_, x) => topOf(img, x));
        expect(Math.max(...tops)).toBeGreaterThan(100);
        // The seam is no rougher than the roughest step inside the image.
        let roughest = 0;
        for (let x = 1; x < img.width; x++) {
          roughest = Math.max(roughest, Math.abs((tops[x] ?? 0) - (tops[x - 1] ?? 0)));
        }
        const seam = Math.abs((tops[0] ?? 0) - (tops[img.width - 1] ?? 0));
        expect(seam).toBeLessThanOrEqual(roughest);
        expect(same(img, buildParallaxLayer(b.key, n))).toBe(true);
      });
    }
  }

  it('foreground canopy: 480x120, hangs from the top, ragged and mostly empty below, wraps', () => {
    const img = buildForegroundCanopy();
    expect([img.width, img.height]).toEqual([FG_CANOPY_SIZE.width, FG_CANOPY_SIZE.height]);
    for (let x = 0; x < img.width; x++) expect(getAlpha(img, x, 0)).toBe(255);
    let lower = 0;
    for (let y = 60; y < img.height; y++) {
      for (let x = 0; x < img.width; x++) if (getAlpha(img, x, y) > 0) lower++;
    }
    expect(lower).toBeLessThan(0.15 * img.width * 60);
    const bottom = (x: number) => {
      let y = 0;
      while (y < img.height && getAlpha(img, x, y) > 0) y++;
      return y;
    };
    expect(Math.abs(bottom(0) - bottom(img.width - 1))).toBeLessThanOrEqual(12);
    expect(same(img, buildForegroundCanopy())).toBe(true);
  });
});
