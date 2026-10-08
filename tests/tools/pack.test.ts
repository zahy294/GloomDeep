import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PLACEHOLDER_ATLAS, TILE_SIZE } from '../../src/config';
import type {
  ArtManifest,
  ArtManifestEntry,
  PackInfo,
  PreviewInfo,
  SpriteAtlasInfo,
} from '../../src/data/artManifest';
import { PALETTE } from '../../src/data/palette';
import { SPRITE_ASSETS } from '../../src/data/spriteAssets';
import { TILES } from '../../src/data/tiles';
import { FRAME_COUNT, FRAMES_PER_TILE, frameBase } from '../../src/sim/world/autotile';
import { generateAutotiles } from '../../tools/lib/autotileGen';
import { createImage, getAlpha, getRgb, readPng, setPixel, writePng } from '../../tools/lib/image';
import type { RgbaImage } from '../../tools/lib/image';
import { artPaths } from '../../tools/lib/manifest';
import {
  buildCracksAtlas,
  buildPlaceholderAtlas,
  type Atlas,
} from '../../tools/lib/placeholderAtlas';
import { darkenColor, packAtlases } from '../../tools/lib/pack';

const COLUMNS = PLACEHOLDER_ATLAS.columns;
const opts = { tileSize: TILE_SIZE, ...PLACEHOLDER_ATLAS };
const player = SPRITE_ASSETS.find((s) => s.id === 'player-parts')!;
const mossId = TILES.find((t) => t.key === 'moss')!.id;

let root: string;
let artRoot: string;
let placeholderDir: string;
let outDir: string;

const asImage = (a: Atlas): RgbaImage => ({ width: a.width, height: a.height, data: a.data });

function sheetFor(frames: number, fw: number, fh: number, colour: (i: number) => number) {
  const img = createImage(frames * fw, fh);
  for (let i = 0; i < frames; i++) {
    for (let y = 0; y < fh; y++)
      for (let x = 0; x < fw; x++) setPixel(img, i * fw + x, y, colour(i));
  }
  return img;
}

function mossBase(): RgbaImage {
  const img = createImage(32, 32);
  for (let y = 0; y < 32; y++) {
    for (let x = 0; x < 32; x++) setPixel(img, x, y, PALETTE.moss[1 + ((x + y * 3) % 3)]!);
  }
  return img;
}

function mossEntry(status: ArtManifestEntry['status']): ArtManifestEntry {
  return {
    id: 'moss-texture',
    category: 'terrain',
    raw: 'terrain/moss.png',
    anchor: 'top-left',
    source: { kind: 'hand' },
    status,
    material: 'moss',
    tileable: 'xy',
  };
}

async function setup(manifest: ArtManifest, withSet: boolean) {
  await mkdir(resolve(artRoot, 'clean', 'autotiles'), { recursive: true });
  await writeFile(resolve(artRoot, 'manifest.json'), JSON.stringify(manifest));
  if (withSet) {
    await writePng(
      resolve(artRoot, 'clean', 'autotiles', 'moss.png'),
      generateAutotiles(mossBase()),
    );
  }
  await writePng(resolve(artRoot, 'clean', 'moss-texture.png'), mossBase());
}

const run = () => packAtlases({ art: artPaths(artRoot), outDir, placeholderDir });
const frameRegion = (img: RgbaImage, frame: number) => {
  const x = (frame % COLUMNS) * TILE_SIZE;
  const y = Math.floor(frame / COLUMNS) * TILE_SIZE;
  return Array.from({ length: TILE_SIZE * TILE_SIZE }, (_, i) =>
    getRgb(img, x + (i % TILE_SIZE), y + Math.floor(i / TILE_SIZE)),
  );
};

beforeEach(async () => {
  root = await mkdtemp(resolve(tmpdir(), 'gloam-pack-'));
  artRoot = resolve(root, 'art');
  placeholderDir = resolve(root, 'placeholder');
  outDir = resolve(root, 'out');
  await mkdir(resolve(placeholderDir, 'sprites'), { recursive: true });
  await writePng(
    resolve(placeholderDir, 'tiles.png'),
    asImage(buildPlaceholderAtlas(TILES, opts, 'tiles')),
  );
  await writePng(
    resolve(placeholderDir, 'walls.png'),
    asImage(buildPlaceholderAtlas(TILES, opts, 'walls')),
  );
  await writePng(resolve(placeholderDir, 'cracks.png'), asImage(buildCracksAtlas(opts)));
  await writePng(
    resolve(placeholderDir, player.placeholder),
    sheetFor(player.frames, player.frameWidth, player.frameHeight, (i) => 0x101010 * (i + 1)),
  );
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('packAtlases', () => {
  it('with only placeholders reproduces them and keeps frame 0 transparent', async () => {
    await setup({ version: 1, assets: [] }, false);
    const result = await run();
    const packed = await readPng(resolve(outDir, 'tiles.png'));
    const placeholder = await readPng(resolve(placeholderDir, 'tiles.png'));
    expect(Buffer.from(packed.data).equals(Buffer.from(placeholder.data))).toBe(true);
    expect(
      Buffer.from((await readPng(resolve(outDir, 'walls.png'))).data).equals(
        Buffer.from((await readPng(resolve(placeholderDir, 'walls.png'))).data),
      ),
    ).toBe(true);
    for (let y = 0; y < TILE_SIZE; y++) {
      for (let x = 0; x < TILE_SIZE; x++) expect(getAlpha(packed, x, y)).toBe(0);
    }
    expect(Object.values(result.info.tiles).every((s) => s === 'placeholder')).toBe(true);
    expect(result.info.sprites['player-parts']).toBe('placeholder');
    expect(result.preview.assets).toEqual([]);
    expect(FRAME_COUNT).toBeGreaterThan(0);
  });

  it('replaces exactly the approved tile frames', async () => {
    await setup({ version: 1, assets: [mossEntry('approved')] }, true);
    const result = await run();
    expect(result.info.tiles['moss']).toBe('approved');
    expect(result.info.tiles['stone']).toBe('placeholder');
    const packed = await readPng(resolve(outDir, 'tiles.png'));
    const placeholder = await readPng(resolve(placeholderDir, 'tiles.png'));
    const set = await readPng(resolve(artRoot, 'clean', 'autotiles', 'moss.png'));
    const base = frameBase(mossId);
    for (let f = 0; f < FRAME_COUNT; f++) {
      const inMoss = f >= base && f < base + FRAMES_PER_TILE;
      const expected = inMoss ? frameRegion(set, f - base) : frameRegion(placeholder, f);
      expect(frameRegion(packed, f)).toEqual(expected);
    }
  });

  it('derives walls one ramp step darker for approved tiles', async () => {
    await setup({ version: 1, assets: [mossEntry('approved')] }, true);
    await run();
    const walls = await readPng(resolve(outDir, 'walls.png'));
    const tiles = await readPng(resolve(outDir, 'tiles.png'));
    const f = frameBase(mossId) + 46 * 3 + 1;
    const x = (f % COLUMNS) * TILE_SIZE + 8;
    const y = Math.floor(f / COLUMNS) * TILE_SIZE + 8;
    expect(getRgb(walls, x, y)).toBe(darkenColor(getRgb(tiles, x, y)));
    expect(getRgb(walls, x, y)).not.toBe(getRgb(tiles, x, y));
  });

  it('does not use cleaned-but-unapproved art for tiles, but previews it', async () => {
    await setup({ version: 1, assets: [mossEntry('cleaned')] }, true);
    const result = await run();
    expect(result.info.tiles['moss']).toBe('placeholder');
    const packed = await readPng(resolve(outDir, 'tiles.png'));
    const placeholder = await readPng(resolve(placeholderDir, 'tiles.png'));
    expect(Buffer.from(packed.data).equals(Buffer.from(placeholder.data))).toBe(true);
    expect(result.preview.assets.map((a) => a.id)).toEqual(['moss-texture']);
    expect(existsSync(resolve(outDir, 'preview', 'moss-texture.png'))).toBe(true);
  });

  it('writes preview.json for cleaned and approved entries only', async () => {
    const raw: ArtManifestEntry = {
      ...mossEntry('raw'),
      id: 'other',
      material: undefined,
      category: 'item',
    };
    delete raw.material;
    await setup({ version: 1, assets: [mossEntry('approved'), raw] }, true);
    await mkdir(resolve(artRoot, 'reference'), { recursive: true });
    await writePng(resolve(artRoot, 'reference', 'style-reference.png'), mossBase());
    await run();
    const preview = JSON.parse(
      await readFile(resolve(outDir, 'preview', 'preview.json'), 'utf8'),
    ) as PreviewInfo;
    expect(preview.assets).toHaveLength(1);
    expect(preview.assets[0]).toMatchObject({
      id: 'moss-texture',
      status: 'approved',
      material: 'moss',
      frameWidth: 16,
    });
    expect(preview.hasStyleReference).toBe(true);
    expect(existsSync(resolve(outDir, 'preview', 'style-reference.png'))).toBe(true);
  });

  it('packs sprite frames pixel-exact with padding, and approved sheets override placeholders', async () => {
    const entry: ArtManifestEntry = {
      id: 'player-parts',
      category: 'player',
      raw: 'player/parts.png',
      anchor: 'bottom-center',
      source: { kind: 'hand' },
      status: 'approved',
    };
    await setup({ version: 1, assets: [entry] }, false);
    await writePng(
      resolve(artRoot, 'clean', 'player-parts.png'),
      sheetFor(player.frames, player.frameWidth, player.frameHeight, (i) => 0xff0000 + i),
    );
    const result = await run();
    expect(result.info.sprites['player-parts']).toBe('approved');
    const atlas = await readPng(resolve(outDir, 'sprites.png'));
    const json = JSON.parse(
      await readFile(resolve(outDir, 'sprites.json'), 'utf8'),
    ) as SpriteAtlasInfo;
    const frames = json.frames['player-parts']!;
    expect(frames).toHaveLength(player.frames);
    frames.forEach((r, i) => {
      expect(r.width).toBe(player.frameWidth);
      expect(getRgb(atlas, r.x, r.y)).toBe(0xff0000 + i);
      expect(getRgb(atlas, r.x + r.width - 1, r.y + r.height - 1)).toBe(0xff0000 + i);
      expect(getAlpha(atlas, r.x - 1, r.y)).toBe(0);
      expect(getAlpha(atlas, r.x, r.y - 1)).toBe(0);
    });
    const pack = JSON.parse(await readFile(resolve(outDir, 'pack.json'), 'utf8')) as PackInfo;
    expect(pack.sprites['player-parts']).toBe('approved');
  });

  it('uses the placeholder sprite sheet otherwise, and blank frames with a warning if missing', async () => {
    await setup({ version: 1, assets: [] }, false);
    let result = await run();
    const atlas = await readPng(resolve(outDir, 'sprites.png'));
    const r = result.sprites.frames['player-parts']![2]!;
    expect(getRgb(atlas, r.x, r.y)).toBe(0x303030);
    await rm(resolve(placeholderDir, 'sprites'), { recursive: true });
    result = await run();
    expect(result.warnings.join('\n')).toContain('player-parts');
    expect(result.sprites.frames['player-parts']).toHaveLength(player.frames);
  });

  it('leaves out approved third-party art that has no license, with a warning', async () => {
    const bought = { ...mossEntry('approved'), source: { kind: 'pack' as const } };
    await setup({ version: 1, assets: [bought] }, true);
    const unlicensed = await run();
    expect(unlicensed.info.tiles['moss']).toBe('placeholder');
    expect(unlicensed.warnings.some((w) => w.includes('no license'))).toBe(true);

    const licensed = { ...bought, source: { kind: 'pack' as const, license: 'CC0' } };
    await setup({ version: 1, assets: [licensed] }, true);
    expect((await run()).info.tiles['moss']).toBe('approved');
  });

  it('is deterministic', async () => {
    await setup({ version: 1, assets: [mossEntry('approved')] }, true);
    await run();
    const first = await readFile(resolve(outDir, 'tiles.png'));
    const firstJson = await readFile(resolve(outDir, 'sprites.json'), 'utf8');
    await run();
    expect((await readFile(resolve(outDir, 'tiles.png'))).equals(first)).toBe(true);
    expect(await readFile(resolve(outDir, 'sprites.json'), 'utf8')).toBe(firstJson);
  });
});

describe('darkenColor', () => {
  it('steps down the ramp, keeps the darkest, and snaps off-palette colours first', () => {
    expect(darkenColor(PALETTE.stone[2])).toBe(PALETTE.stone[1]);
    expect(darkenColor(PALETTE.stone[0])).toBe(PALETTE.stone[0]);
    const nearStone = PALETTE.stone[3] + 0x010101;
    expect(darkenColor(nearStone)).toBe(PALETTE.stone[2]);
  });
});
