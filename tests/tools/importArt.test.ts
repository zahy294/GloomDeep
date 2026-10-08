import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import type { ArtManifest, ArtManifestEntry } from '../../src/data/artManifest';
import { PALETTE_COLORS } from '../../src/data/palette';
import { fakeAiImage } from '../../tools/lib/fakeAiImage';
import {
  blit,
  createImage,
  getAlpha,
  getRgb,
  readPng,
  setPixel,
  writePng,
  type RgbaImage,
} from '../../tools/lib/image';
import {
  FAR_FROM_PALETTE_THRESHOLD,
  checkSeams,
  describeSeams,
  detectBlockSize,
  downscale,
  importImage,
  matchPalette,
  removeBackground,
  trimAndAnchor,
} from '../../tools/lib/importArt';
import { artPaths } from '../../tools/lib/manifest';
import { runImport } from '../../tools/import-art';

const ROSE = 0xc4637e;
const ROSE_LIGHT = 0xf0a0b0;
const OUTLINE = 0x281e36;
const STEM = 0xd6e0f0;
const STEM_SHADE = 0x95a4c0;
const SOIL = 0x644736;
const SOIL_DARK = 0x45302a;
const MOSS = 0x5f8a3a;

/** 16x24 mushroom: rose cap, pale stem, 1px dark outline, content 14 wide, resting on the bottom. */
function mushroom(): RgbaImage {
  const img = createImage(16, 24);
  const inside = (x: number, y: number): boolean => {
    const cap = ((x - 7.5) / 7) ** 2 + ((y - 7) / 6.5) ** 2 <= 1 && y <= 11;
    const stem = x >= 5 && x <= 10 && y >= 10 && y <= 23;
    return cap || stem;
  };
  for (let y = 0; y < 24; y++) {
    for (let x = 0; x < 16; x++) {
      if (!inside(x, y)) continue;
      const edge = [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ].some(([dx = 0, dy = 0]) => !inside(x + dx, y + dy));
      let c = y <= 11 ? ROSE : x <= 7 ? STEM : STEM_SHADE;
      if (y <= 5 && x <= 7) c = ROSE_LIGHT;
      setPixel(img, x, y, edge ? OUTLINE : c);
    }
  }
  return img;
}

/** 8x8 frame with a small blob; used for the 2x2 sheet (anchor 'center'). */
function blob(color: number, size: number): RgbaImage {
  const img = createImage(8, 8);
  const x0 = Math.floor((8 - size) / 2);
  for (let y = x0; y < x0 + size; y++) {
    for (let x = x0; x < x0 + size; x++) {
      const edge = x === x0 || y === x0 || x === x0 + size - 1 || y === x0 + size - 1;
      setPixel(img, x, y, edge ? OUTLINE : color);
    }
  }
  return img;
}

function sheet(frames: RgbaImage[]): RgbaImage {
  const img = createImage(16, 16);
  frames.forEach((f, i) => {
    const ox = (i % 2) * 8;
    const oy = Math.floor(i / 2) * 8;
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        if (getAlpha(f, x, y)) setPixel(img, ox + x, oy + y, getRgb(f, x, y));
      }
    }
  });
  return img;
}

/** 16x16 seamless texture: soil with moss bands that wrap, columns 0 and 15 identical. */
function texture(): RgbaImage {
  const img = createImage(16, 16);
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const band =
        y % 8 < 2 || y % 8 === 7 ? MOSS : (x + y) % 5 === 0 && x > 1 && x < 14 ? SOIL_DARK : SOIL;
      setPixel(img, x, y, band);
    }
  }
  return img;
}

function diffCount(a: RgbaImage, b: RgbaImage): number {
  expect(`${a.width}x${a.height}`).toBe(`${b.width}x${b.height}`);
  let n = 0;
  for (let i = 0; i < a.data.length; i += 4) {
    const ta = (a.data[i + 3] ?? 0) < 128;
    const tb = (b.data[i + 3] ?? 0) < 128;
    if (ta !== tb) n++;
    else if (
      !ta &&
      (a.data[i] !== b.data[i] ||
        a.data[i + 1] !== b.data[i + 1] ||
        a.data[i + 2] !== b.data[i + 2])
    )
      n++;
  }
  return n;
}

function magentaish(img: RgbaImage): number {
  let n = 0;
  for (let i = 0; i < img.data.length; i += 4) {
    if ((img.data[i + 3] ?? 0) < 128) continue;
    const r = img.data[i] ?? 0;
    const g = img.data[i + 1] ?? 0;
    const b = img.data[i + 2] ?? 0;
    if (Math.min(r, b) - g > 60) n++;
  }
  return n;
}

const entryOf = (over: Partial<ArtManifestEntry>): ArtManifestEntry => ({
  id: 'x',
  category: 'foliage',
  raw: 'foliage/x.png',
  anchor: 'bottom-center',
  source: { kind: 'nano-banana' },
  status: 'raw',
  ...over,
});

describe('fixtures', () => {
  it('hand-made sprites are palette colours and sit where the anchor puts them', () => {
    const m = mushroom();
    const t = trimAndAnchor(m, { width: 16, height: 24 }, 'bottom-center');
    expect(diffCount(t.image, m)).toBe(0);
    expect(PALETTE_COLORS).toContain(ROSE);
    expect(PALETTE_COLORS).toContain(OUTLINE);
  });

  it('fakeAiImage is deterministic and uses a magenta background', () => {
    const a = fakeAiImage(mushroom(), { seed: 5 });
    const b = fakeAiImage(mushroom(), { seed: 5 });
    expect(a.data).toEqual(b.data);
    expect(fakeAiImage(mushroom(), { seed: 6 }).data).not.toEqual(a.data);
    expect(a.width).toBe(104);
    expect(getRgb(a, 3, 3) >> 16).toBeGreaterThan(240);
  });
});

describe('removeBackground', () => {
  it('makes near-magenta transparent and keeps everything else', () => {
    const img = createImage(4, 1);
    setPixel(img, 0, 0, 0xff00ff);
    setPixel(img, 1, 0, 0xfa05fb); // noisy magenta
    setPixel(img, 2, 0, ROSE);
    setPixel(img, 3, 0, OUTLINE);
    const { image, removedFraction } = removeBackground(img);
    expect([0, 1, 2, 3].map((x) => getAlpha(image, x, 0))).toEqual([0, 0, 255, 255]);
    expect(removedFraction).toBe(0.5);
  });

  it('removes the magenta-tinted fringe but not pinkish palette colours', () => {
    const img = createImage(8, 3);
    for (let y = 0; y < 3; y++) {
      for (let x = 0; x < 8; x++) setPixel(img, x, y, x < 3 ? 0xff00ff : ROSE);
    }
    // fringe: 50% blends of the sprite colour (dark teal) with magenta, two pixels deep
    for (let y = 0; y < 3; y++) {
      setPixel(img, 3, y, 0x8f27a9);
      setPixel(img, 4, y, 0x8f27a9);
      for (let x = 5; x < 8; x++) setPixel(img, x, y, 0x1d4e52);
    }
    const { image } = removeBackground(img);
    expect(getAlpha(image, 3, 1)).toBe(0);
    expect(getAlpha(image, 4, 1)).toBe(0);
    expect(getAlpha(image, 5, 1)).toBe(255);

    const rose = createImage(4, 3);
    for (let y = 0; y < 3; y++) {
      for (let x = 0; x < 4; x++) setPixel(rose, x, y, x === 0 ? 0xff00ff : ROSE);
    }
    expect(getAlpha(removeBackground(rose).image, 1, 1)).toBe(255);
  });

  it('leaves images without magenta alone', () => {
    const { removed } = removeBackground(texture());
    expect(removed).toBe(0);
  });
});

describe('detectBlockSize', () => {
  const small = mushroom();
  it('finds alternating 6/7 as about 6.5', () => {
    const b = detectBlockSize(fakeAiImage(small, { pitch: [6, 7], seed: 2 }));
    expect(b.x).toBeCloseTo(6.5, 0);
    expect(Math.abs(b.x - 6.5)).toBeLessThan(0.15);
    expect(Math.abs(b.y - 6.5)).toBeLessThan(0.15);
  });
  it('finds an even pitch of 8', () => {
    const b = detectBlockSize(fakeAiImage(small, { pitch: 8, seed: 3 }));
    expect(Math.abs(b.x - 8)).toBeLessThan(0.15);
    expect(Math.abs(b.y - 8)).toBeLessThan(0.15);
  });
  it('finds a fractional pitch of 6.5', () => {
    const b = detectBlockSize(fakeAiImage(small, { pitch: 6.5, seed: 4 }));
    expect(Math.abs(b.x - 6.5)).toBeLessThan(0.15);
  });
  it('reports pitch 1 for a flat image', () => {
    expect(detectBlockSize(createImage(40, 40)).x).toBe(1);
  });
});

describe('downscale', () => {
  it('takes the central colour, ignoring blurred block edges, and never averages', () => {
    const img = createImage(12, 6);
    for (let y = 0; y < 6; y++) {
      for (let x = 0; x < 12; x++) setPixel(img, x, y, x < 6 ? 0x2c6a68 : 0xc4637e);
    }
    // smear the seam and the block rims with an in-between colour
    for (let y = 0; y < 6; y++) {
      setPixel(img, 5, y, 0x7a6673);
      setPixel(img, 6, y, 0x7a6673);
      setPixel(img, 0, y, 0x111111);
    }
    const out = downscale(img, { width: 2, height: 1 });
    expect(getRgb(out, 0, 0)).toBe(0x2c6a68);
    expect(getRgb(out, 1, 0)).toBe(0xc4637e);
  });

  it('marks mostly-transparent blocks transparent', () => {
    const img = createImage(6, 6);
    for (let y = 0; y < 6; y++)
      for (let x = 0; x < 6; x++) setPixel(img, x, y, ROSE, x < 2 ? 255 : 0);
    expect(getAlpha(downscale(img, { width: 1, height: 1 }), 0, 0)).toBe(0);
  });
});

describe('matchPalette', () => {
  it('snaps to the nearest palette colour and reports far colours with counts', () => {
    const img = createImage(4, 1);
    setPixel(img, 0, 0, ROSE + 0x020201);
    setPixel(img, 1, 0, 0x8040c0);
    setPixel(img, 2, 0, 0x8040c0);
    const { image, far } = matchPalette(img, PALETTE_COLORS);
    expect(getRgb(image, 0, 0)).toBe(ROSE);
    expect(getAlpha(image, 3, 0)).toBe(0);
    expect(far).toHaveLength(1);
    expect(far[0]).toMatchObject({ color: 0x8040c0, count: 2 });
    expect(far[0]?.distance).toBeGreaterThan(FAR_FROM_PALETTE_THRESHOLD);
  });
});

describe('trimAndAnchor', () => {
  const dot = (): RgbaImage => {
    const img = createImage(10, 10);
    for (let y = 2; y < 5; y++) for (let x = 3; x < 8; x++) setPixel(img, x, y, ROSE); // 5x3
    return img;
  };
  const where = (img: RgbaImage) => {
    const xs: number[] = [];
    const ys: number[] = [];
    for (let y = 0; y < img.height; y++) {
      for (let x = 0; x < img.width; x++) {
        if (!getAlpha(img, x, y)) continue;
        xs.push(x);
        ys.push(y);
      }
    }
    return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  };
  it('bottom-center touches the bottom and centres horizontally', () => {
    const r = trimAndAnchor(dot(), { width: 10, height: 8 }, 'bottom-center');
    expect(where(r.image)).toEqual([2, 5, 6, 7]);
    expect(r.overflow).toBeUndefined();
  });
  it('center and top-left', () => {
    expect(where(trimAndAnchor(dot(), { width: 9, height: 9 }, 'center').image)).toEqual([
      2, 3, 6, 5,
    ]);
    expect(where(trimAndAnchor(dot(), { width: 9, height: 9 }, 'top-left').image)).toEqual([
      0, 0, 4, 2,
    ]);
  });
  it('reports content that does not fit instead of hiding it', () => {
    const r = trimAndAnchor(dot(), { width: 4, height: 2 }, 'center');
    expect(r.overflow).toEqual({ contentWidth: 5, contentHeight: 3 });
  });
  it('flags empty images', () => {
    expect(trimAndAnchor(createImage(4, 4), { width: 4, height: 4 }, 'center').empty).toBe(true);
  });
});

describe('checkSeams', () => {
  it('passes a clean seamless texture', () => {
    const seams = checkSeams(texture(), 'xy');
    expect(seams.map((s) => s.ok)).toEqual([true, true]);
    expect(seams[0]?.mismatchFraction).toBe(0);
  });
  it('finds a planted seam with its row range', () => {
    const t = texture();
    for (let y = 6; y <= 10; y++) setPixel(t, 15, y, 0xffd88a);
    const seams = checkSeams(t, 'x');
    expect(seams).toHaveLength(1);
    expect(seams[0]?.ok).toBe(false);
    expect(seams[0]?.ranges).toEqual([{ start: 6, end: 10 }]);
    expect(describeSeams(seams)[0]).toContain('rows 6–10');
  });
  it('checks top/bottom for xy textures', () => {
    const t = texture();
    for (let x = 0; x < 16; x++) setPixel(t, x, 15, 0xffd88a);
    const [, tb] = checkSeams(t, 'xy');
    expect(tb?.ok).toBe(false);
    expect(describeSeams(checkSeams(t, 'xy'))[0]).toContain('columns 0–15');
  });
});

describe('importImage end to end', () => {
  const cases: [string, number | number[], number][] = [
    ['alternating 6/7', [6, 7], 11],
    ['even 8', 8, 12],
    ['fractional 6.5', 6.5, 13],
  ];

  for (const [name, pitch, seed] of cases) {
    it(`restores the original sprite exactly (${name})`, () => {
      const original = mushroom();
      const raw = fakeAiImage(original, { pitch, seed });
      const r = importImage(
        raw,
        entryOf({ targetSize: { width: 16, height: 24 } }),
        PALETTE_COLORS,
      );
      expect(diffCount(r.image, original)).toBe(0);
      expect(magentaish(r.image)).toBe(0);
      expect(r.far).toHaveLength(0);
      expect(r.removedFraction).toBeGreaterThan(0.2);
      expect(r.warnings).toEqual([]);
      // Sprites are cropped to their content first, so the pitch is measured on the sprite itself.
      expect(Math.abs(r.pitch.usedX - raw.width / 16)).toBeLessThan(0.25);
      expect(Math.abs(r.pitch.detectedX - r.pitch.usedX)).toBeLessThan(0.2);
    });
  }

  it('works without a targetSize by using the detected pitch (output = the trimmed sprite)', () => {
    const original = mushroom();
    const raw = fakeAiImage(original, { pitch: 8, seed: 21 });
    const r = importImage(raw, entryOf({}), PALETTE_COLORS);
    const trimmed = trimAndAnchor(original, { width: 16, height: 24 }, 'top-left').image;
    const bounds = { width: 0, height: 0 };
    for (let y = 0; y < 24; y++)
      for (let x = 0; x < 16; x++)
        if (getAlpha(trimmed, x, y)) {
          bounds.width = Math.max(bounds.width, x + 1);
          bounds.height = Math.max(bounds.height, y + 1);
        }
    expect(`${r.image.width}x${r.image.height}`).toBe(`${bounds.width}x${bounds.height}`);
    expect(diffCount(r.image, trimAndAnchor(trimmed, bounds, 'top-left').image)).toBe(0);
  });

  it('reports an off-palette colour', () => {
    const original = mushroom();
    setPixel(original, 7, 4, 0x8040c0);
    setPixel(original, 8, 4, 0x8040c0);
    const raw = fakeAiImage(original, { pitch: [6, 7], seed: 8 });
    const r = importImage(raw, entryOf({ targetSize: { width: 16, height: 24 } }), PALETTE_COLORS);
    expect(r.far).toHaveLength(1);
    expect(r.far[0]?.count).toBe(2);
    expect(Math.abs(((r.far[0]?.color ?? 0) >> 16) - 0x80)).toBeLessThan(8);
  });

  it('re-anchors a sprite that was drawn off-position', () => {
    const shifted = createImage(16, 24);
    const m = mushroom();
    for (let y = 0; y < 23; y++)
      for (let x = 0; x < 16; x++) {
        if (getAlpha(m, x, y + 1)) setPixel(shifted, x, y, getRgb(m, x, y + 1)); // 1px above the floor
      }
    const raw = fakeAiImage(shifted, { pitch: 8, seed: 31 });
    const r = importImage(raw, entryOf({ targetSize: { width: 16, height: 24 } }), PALETTE_COLORS);
    expect(diffCount(r.image, m)).toBe(0);
  });

  it('warns when targetSize contradicts the detected pixel grid', () => {
    const raw = fakeAiImage(mushroom(), { pitch: 8, seed: 41 });
    const ok = importImage(raw, entryOf({ targetSize: { width: 16, height: 24 } }), PALETTE_COLORS);
    expect(ok.warnings).toEqual([]);
    // A larger frame is fine (padding); one too small for the detected grid is reported.
    const roomy = importImage(
      raw,
      entryOf({ targetSize: { width: 32, height: 48 } }),
      PALETTE_COLORS,
    );
    expect(roomy.warnings).toEqual([]);
    const wrong = importImage(
      raw,
      entryOf({ targetSize: { width: 8, height: 12 } }),
      PALETTE_COLORS,
    );
    expect(wrong.warnings.some((w) => w.includes('larger than targetSize'))).toBe(true);
  });

  it('slices a 2x2 sheet and anchors each frame', () => {
    const original = sheet([blob(ROSE, 6), blob(MOSS, 4), blob(STEM, 8), blob(SOIL, 5)]);
    const raw = fakeAiImage(original, { pitch: 6.5, seed: 51 });
    const r = importImage(
      raw,
      entryOf({
        targetSize: { width: 8, height: 8 },
        grid: { columns: 2, rows: 2 },
        anchor: 'center',
      }),
      PALETTE_COLORS,
    );
    expect(r.image.width).toBe(16);
    expect(r.image.height).toBe(16);
    expect(diffCount(r.image, original)).toBe(0);
  });

  it('keeps a seamless texture and finds the seam in a bad one', () => {
    const good = importImage(
      fakeAiImage(texture(), { pitch: [6, 7], seed: 61, background: 0x000000 }),
      entryOf({ targetSize: { width: 16, height: 16 }, tileable: 'xy', anchor: 'top-left' }),
      PALETTE_COLORS,
    );
    expect(diffCount(good.image, texture())).toBe(0);
    expect(good.removedFraction).toBe(0);
    expect(good.seams.every((s) => s.ok)).toBe(true);

    const bad = texture();
    for (let y = 6; y <= 10; y++) setPixel(bad, 15, y, 0xffd88a);
    const r = importImage(
      fakeAiImage(bad, { pitch: [6, 7], seed: 62, background: 0x000000 }),
      entryOf({ targetSize: { width: 16, height: 16 }, tileable: 'xy', anchor: 'top-left' }),
      PALETTE_COLORS,
    );
    expect(r.seams[0]?.ok).toBe(false);
    expect(r.seams[0]?.ranges).toEqual([{ start: 6, end: 10 }]);
  });
});

describe('import-art CLI logic', () => {
  const root = join(tmpdir(), `gloamdeep-import-${process.pid}-${Date.now()}`);
  afterAll(() => rm(root, { recursive: true, force: true }));

  it('writes clean image, preview and updates the manifest', async () => {
    await mkdir(join(root, 'raw/foliage'), { recursive: true });
    await mkdir(join(root, 'raw/terrain'), { recursive: true });
    await writePng(join(root, 'raw/foliage/mushroom.png'), fakeAiImage(mushroom(), { seed: 71 }));
    await writePng(
      join(root, 'raw/terrain/soil.png'),
      fakeAiImage(texture(), { pitch: 8, seed: 72, background: 0x000000 }),
    );
    const manifest: ArtManifest = {
      version: 1,
      assets: [
        entryOf({
          id: 'mushroom',
          targetSize: { width: 16, height: 24 },
          raw: 'foliage/mushroom.png',
        }),
        entryOf({
          id: 'soil',
          category: 'terrain',
          raw: 'terrain/soil.png',
          targetSize: { width: 16, height: 16 },
          tileable: 'xy',
          anchor: 'top-left',
        }),
        entryOf({ id: 'ghost', raw: 'foliage/ghost.png' }),
        entryOf({ id: 'done', raw: 'foliage/done.png', status: 'approved' }),
      ],
    };
    const art = artPaths(root);
    await writeFile(art.manifest, JSON.stringify(manifest));

    const lines: string[] = [];
    const summary = await runImport(art, undefined, (l) => lines.push(l));
    expect(summary.ok).toBe(true);
    expect(summary.imported).toEqual(['mushroom', 'soil']);
    expect(summary.skipped).toEqual(['ghost', 'done']);
    expect(lines.some((l) => l.includes('ghost') && l.includes('missing'))).toBe(true);

    const clean = await readPng(join(root, 'clean/mushroom.png'));
    expect(diffCount(clean, mushroom())).toBe(0);
    const preview = await readPng(join(root, 'raw/foliage/mushroom.preview.png'));
    expect(preview.width).toBe(64);
    expect(preview.height).toBe(96);
    expect(existsSync(join(root, 'clean/soil.png'))).toBe(true);

    const saved = JSON.parse(await readFile(art.manifest, 'utf8')) as ArtManifest;
    expect(saved.assets.map((a) => a.status)).toEqual(['cleaned', 'cleaned', 'raw', 'approved']);

    const onlyTerrain = await runImport(art, 'terrain', () => undefined);
    expect(onlyTerrain.imported).toEqual(['soil']);
  });

  it('exits non-ok when an asset fails', async () => {
    const bad = join(root, 'bad');
    await mkdir(join(bad, 'raw'), { recursive: true });
    await writeFile(join(bad, 'raw/broken.png'), 'not a png');
    const art = artPaths(bad);
    await writeFile(
      art.manifest,
      JSON.stringify({ version: 1, assets: [entryOf({ id: 'broken', raw: 'broken.png' })] }),
    );
    const summary = await runImport(art, undefined, () => undefined);
    expect(summary.ok).toBe(false);
    expect(summary.failed).toEqual(['broken']);
  });
});

describe('checkSeams on grainy textures', () => {
  /** Per-pixel random speckle that tiles seamlessly (no structure to continue across edges). */
  function grain(size: number): RgbaImage {
    const img = createImage(size, size);
    const shades = [SOIL, SOIL_DARK, MOSS];
    let s = 7;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        s = (s * 1103515245 + 12345) & 0x7fffffff;
        setPixel(img, x, y, shades[s % 3]!);
      }
    }
    return img;
  }

  it('passes a grainy texture whose edges differ only as much as its interior does', () => {
    expect(checkSeams(grain(32), 'xy').every((s) => s.ok)).toBe(true);
  });

  it('still fails a grainy texture with a hard band across the wrap', () => {
    const t = grain(32);
    for (let y = 0; y < 32; y++) setPixel(t, 31, y, 0xffd88a);
    expect(checkSeams(t, 'x')[0]?.ok).toBe(false);
  });
});

describe('importImage on a realistic canvas', () => {
  /** Embeds a fake-AI image in a bigger magenta canvas at an offset that isn't a block multiple. */
  function onCanvas(img: RgbaImage, left: number, top: number, right: number, bottom: number) {
    const canvas = createImage(img.width + left + right, img.height + top + bottom);
    for (let y = 0; y < canvas.height; y++) {
      for (let x = 0; x < canvas.width; x++) setPixel(canvas, x, y, 0xff00ff);
    }
    blit(img, 0, 0, img.width, img.height, canvas, left, top);
    return canvas;
  }

  /** The mushroom with its transparent margin trimmed off (what AI output actually frames). */
  function mushroomTight(): RgbaImage {
    const m = mushroom();
    return trimAndAnchor(m, { width: m.width, height: m.height }, 'top-left').image;
  }

  it('finds the sprite inside a large canvas with an off-grid margin', () => {
    const original = mushroom();
    const raw = onCanvas(fakeAiImage(original, { pitch: [6, 7], seed: 31 }), 37, 53, 101, 89);
    const r = importImage(raw, entryOf({ targetSize: { width: 16, height: 24 } }), PALETTE_COLORS);
    expect(diffCount(r.image, original)).toBe(0);
    expect(r.warnings).toEqual([]);
  });

  it('keeps the sprite at its true size when the target frame is larger, anchored by the entry', () => {
    const original = mushroom();
    const raw = onCanvas(fakeAiImage(original, { pitch: 6.5, seed: 32 }), 20, 11, 60, 45);
    const r = importImage(
      raw,
      entryOf({ targetSize: { width: 24, height: 32 }, anchor: 'bottom-center' }),
      PALETTE_COLORS,
    );
    const expected = trimAndAnchor(original, { width: 24, height: 32 }, 'bottom-center').image;
    expect(r.image.width).toBe(24);
    expect(r.image.height).toBe(32);
    expect(diffCount(r.image, expected)).toBe(0);
  });

  it('handles a tightly framed sprite too', () => {
    const tight = mushroomTight();
    const raw = onCanvas(fakeAiImage(tight, { pitch: 8, seed: 33 }), 9, 14, 3, 30);
    const r = importImage(
      raw,
      entryOf({ targetSize: { width: tight.width, height: tight.height }, anchor: 'top-left' }),
      PALETTE_COLORS,
    );
    expect(diffCount(r.image, tight)).toBe(0);
  });
});

describe('importImage robustness', () => {
  function onMagenta(img: RgbaImage, left: number, top: number, right: number, bottom: number) {
    const canvas = createImage(img.width + left + right, img.height + top + bottom);
    for (let y = 0; y < canvas.height; y++) {
      for (let x = 0; x < canvas.width; x++) setPixel(canvas, x, y, 0xff00ff);
    }
    blit(img, 0, 0, img.width, img.height, canvas, left, top);
    return canvas;
  }

  it('ignores a stray speck far from the sprite and says so', () => {
    const original = mushroom();
    const raw = onMagenta(fakeAiImage(original, { pitch: 20, seed: 71 }), 60, 80, 70, 50);
    setPixel(raw, 5, 5, 0x23262e);
    setPixel(raw, 6, 5, 0x23262e);
    const r = importImage(raw, entryOf({ targetSize: { width: 16, height: 24 } }), PALETTE_COLORS);
    expect(diffCount(r.image, original)).toBe(0);
    expect(r.warnings.some((w) => w.includes('stray speck'))).toBe(true);
  });

  it('ignores a watermark-sized blob in a corner', () => {
    const original = mushroom();
    const raw = onMagenta(fakeAiImage(original, { pitch: 8, seed: 72 }), 20, 20, 90, 90);
    for (let y = raw.height - 14; y < raw.height - 4; y++) {
      for (let x = raw.width - 14; x < raw.width - 4; x++) setPixel(raw, x, y, 0xd6e0f0);
    }
    const r = importImage(raw, entryOf({ targetSize: { width: 16, height: 24 } }), PALETTE_COLORS);
    expect(diffCount(r.image, original)).toBe(0);
  });

  it('warns when a sheet does not match its grid (e.g. not cropped to it)', () => {
    const original = sheet([blob(ROSE, 6), blob(MOSS, 4), blob(STEM, 8), blob(SOIL, 5)]);
    const raw = onMagenta(fakeAiImage(original, { pitch: 8, seed: 73 }), 40, 0, 0, 0);
    const r = importImage(
      raw,
      entryOf({
        targetSize: { width: 8, height: 8 },
        grid: { columns: 2, rows: 2 },
        anchor: 'center',
      }),
      PALETTE_COLORS,
    );
    expect(r.warnings.some((w) => w.includes('differs from targetSize'))).toBe(true);
  });
});
