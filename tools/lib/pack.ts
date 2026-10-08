/**
 * Packs approved art and placeholders into the files the game loads (plan 2.9.6, last paragraph).
 * Unapproved assets never reach tiles/walls/sprites; the output is always a complete set.
 */
import { existsSync } from 'node:fs';
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PLACEHOLDER_ATLAS, TILE_SIZE } from '../../src/config';
import type {
  ArtManifest,
  ArtManifestEntry,
  PackInfo,
  PreviewInfo,
  SpriteAtlasInfo,
} from '../../src/data/artManifest';
import { PALETTE, RAMP_NAMES, type Ramp } from '../../src/data/palette';
import { SPRITE_ASSETS } from '../../src/data/spriteAssets';
import { TILES, tileId } from '../../src/data/tiles';
import { FRAMES_PER_TILE, FRAME_COUNT, frameBase } from '../../src/sim/world/autotile';
import { autotileSetSize } from './autotileGen';
import { rgbToOklab, nearestColor } from './color';
import { blit, createImage, getAlpha, getRgb, readPng, setPixel, writePng } from './image';
import type { RgbaImage } from './image';
import { REPO_ROOT, type ArtPaths } from './manifest';

export const DEFAULT_PLACEHOLDER_DIR = resolve(REPO_ROOT, 'assets/placeholder');

/** Gap between packed sprite frames, so filtering never bleeds neighbours in. */
const SPRITE_PADDING = 1;
const SPRITE_ATLAS_WIDTH = 512;

export interface PackOptions {
  art: ArtPaths;
  outDir: string;
  placeholderDir?: string;
  /** Manifest to use; read from `art.manifest` if omitted (a missing file counts as empty). */
  manifest?: ArtManifest;
}

export interface PackResult {
  info: PackInfo;
  sprites: SpriteAtlasInfo;
  preview: PreviewInfo;
  warnings: string[];
}

const RAMPS: readonly Ramp[] = RAMP_NAMES.map((name) => PALETTE[name]);
const PALETTE_FLAT: readonly number[] = RAMPS.flat();
const PALETTE_LAB = PALETTE_FLAT.map(rgbToOklab);

/** One step darker within its palette ramp (darkest stays); non-palette colours snap first. */
export function darkenColor(rgb: number): number {
  const snapped = PALETTE_FLAT.includes(rgb)
    ? rgb
    : nearestColor(rgb, PALETTE_FLAT, PALETTE_LAB).color;
  for (const ramp of RAMPS) {
    const i = ramp.indexOf(snapped);
    if (i >= 0) return ramp[Math.max(0, i - 1)] ?? snapped;
  }
  return snapped;
}

/** Copies `frames` frames of an autotile set into the tile atlas at frames `base`.. */
function copyFrames(
  src: RgbaImage,
  dst: RgbaImage,
  base: number,
  columns: number,
  tileSize: number,
  map?: (rgb: number) => number,
): void {
  const frames = autotileSetSize().frames;
  if (frames !== FRAMES_PER_TILE) throw new Error('Autotile set does not match FRAMES_PER_TILE.');
  for (let k = 0; k < frames; k++) {
    const sx = (k % columns) * tileSize;
    const sy = Math.floor(k / columns) * tileSize;
    const f = base + k;
    const dx = (f % columns) * tileSize;
    const dy = Math.floor(f / columns) * tileSize;
    blit(src, sx, sy, tileSize, tileSize, dst, dx, dy);
    if (!map) continue;
    for (let y = 0; y < tileSize; y++) {
      for (let x = 0; x < tileSize; x++) {
        if (getAlpha(dst, dx + x, dy + y) === 0) continue;
        setPixel(dst, dx + x, dy + y, map(getRgb(dst, dx + x, dy + y)));
      }
    }
  }
}

async function readOptional(path: string): Promise<RgbaImage | null> {
  return existsSync(path) ? readPng(path) : null;
}

async function readManifestOrEmpty(art: ArtPaths): Promise<ArtManifest> {
  if (!existsSync(art.manifest)) return { version: 1, assets: [] };
  return JSON.parse(await readFile(art.manifest, 'utf8')) as ArtManifest;
}

function slice(sheet: RgbaImage, fw: number, fh: number, count: number): RgbaImage[] {
  const columns = Math.max(1, Math.floor(sheet.width / fw));
  const frames: RgbaImage[] = [];
  for (let i = 0; i < count; i++) {
    const frame = createImage(fw, fh);
    blit(sheet, (i % columns) * fw, Math.floor(i / columns) * fh, fw, fh, frame, 0, 0);
    frames.push(frame);
  }
  return frames;
}

function nextPowerOfTwo(n: number): number {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

export async function packAtlases(options: PackOptions): Promise<PackResult> {
  const { art, outDir } = options;
  const placeholderDir = options.placeholderDir ?? DEFAULT_PLACEHOLDER_DIR;
  const manifest = options.manifest ?? (await readManifestOrEmpty(art));
  const warnings: string[] = [];
  const columns = PLACEHOLDER_ATLAS.columns;
  const tileSize = TILE_SIZE;

  // Third-party art (source "pack") must record its license before it can ship (plan 2.9.3,
  // CLAUDE.md "Art"); unlicensed approved entries stay out of the game with a warning.
  const unlicensed = new Set(
    manifest.assets
      .filter(
        (e) => e.status === 'approved' && e.source.kind === 'pack' && !e.source.license?.trim(),
      )
      .map((e) => e.id),
  );
  for (const id of unlicensed) {
    warnings.push(
      `${id}: approved but source "pack" has no license; left out (add source.license)`,
    );
  }
  const approved = (e: ArtManifestEntry) => e.status === 'approved' && !unlicensed.has(e.id);
  const tiles = await readPng(resolve(placeholderDir, 'tiles.png'));
  const walls = await readPng(resolve(placeholderDir, 'walls.png'));
  const expectedRows = Math.ceil(FRAME_COUNT / columns);
  if (tiles.width !== columns * tileSize || tiles.height < expectedRows * tileSize) {
    throw new Error(
      'assets/placeholder/tiles.png does not match the atlas layout; re-run art:placeholder.',
    );
  }

  const info: PackInfo = { tiles: {}, sprites: {} };
  for (const tile of TILES) if (tile.id !== 0) info.tiles[tile.key] = 'placeholder';

  // Terrain: approved + generated autotile set.
  for (const entry of manifest.assets) {
    if (entry.category !== 'terrain' || !approved(entry) || !entry.material) continue;
    const id = TILES.find((t) => t.key === entry.material)?.id;
    if (id === undefined || id === 0) {
      warnings.push(`${entry.id}: unknown material "${entry.material}"`);
      continue;
    }
    const setPath = resolve(art.autotiles, `${entry.material}.png`);
    const set = await readOptional(setPath);
    if (!set) {
      warnings.push(`${entry.id}: no autotile set at ${setPath}; run art:autotiles`);
      continue;
    }
    copyFrames(set, tiles, frameBase(tileId(entry.material)), columns, tileSize);
    copyFrames(set, walls, frameBase(id), columns, tileSize, darkenColor);
    info.tiles[entry.material] = 'approved';
  }

  // Cracks.
  const crackEntry = manifest.assets.find((e) => e.id === 'cracks' && approved(e));
  const crackPath = crackEntry
    ? resolve(art.clean, 'cracks.png')
    : resolve(placeholderDir, 'cracks.png');
  const cracks = await readPng(crackPath);

  // Sprites.
  const sprites: SpriteAtlasInfo = { frames: {} };
  const placed: { id: string; frames: RgbaImage[] }[] = [];
  for (const def of SPRITE_ASSETS) {
    const entry = manifest.assets.find((e) => e.id === def.id && approved(e));
    let sheet: RgbaImage | null = null;
    info.sprites[def.id] = 'placeholder';
    if (entry) {
      sheet = await readOptional(resolve(art.clean, `${def.id}.png`));
      if (sheet) {
        info.sprites[def.id] = 'approved';
        const capacity =
          Math.floor(sheet.width / def.frameWidth) * Math.floor(sheet.height / def.frameHeight);
        if (capacity < def.frames) {
          warnings.push(
            `${def.id}: sheet holds ${capacity} frames, ${def.frames} expected; the rest are blank`,
          );
        }
      } else warnings.push(`${def.id}: approved but art/clean/${def.id}.png is missing`);
    }
    if (!sheet) {
      sheet = await readOptional(resolve(placeholderDir, def.placeholder));
      if (!sheet)
        warnings.push(`${def.id}: placeholder ${def.placeholder} missing; using blank frames`);
    }
    const frames = sheet
      ? slice(sheet, def.frameWidth, def.frameHeight, def.frames)
      : Array.from({ length: def.frames }, () => createImage(def.frameWidth, def.frameHeight));
    placed.push({ id: def.id, frames });
  }

  // Shelf packing, row by row.
  const rects: { frame: RgbaImage; x: number; y: number }[] = [];
  let cx = SPRITE_PADDING;
  let cy = SPRITE_PADDING;
  let rowHeight = 0;
  for (const { id, frames } of placed) {
    const list: SpriteAtlasInfo['frames'][string] = [];
    for (const frame of frames) {
      if (cx + frame.width + SPRITE_PADDING > SPRITE_ATLAS_WIDTH) {
        cx = SPRITE_PADDING;
        cy += rowHeight + SPRITE_PADDING;
        rowHeight = 0;
      }
      rects.push({ frame, x: cx, y: cy });
      list.push({ x: cx, y: cy, width: frame.width, height: frame.height });
      cx += frame.width + SPRITE_PADDING;
      rowHeight = Math.max(rowHeight, frame.height);
    }
    sprites.frames[id] = list;
  }
  const atlas = createImage(SPRITE_ATLAS_WIDTH, nextPowerOfTwo(cy + rowHeight + SPRITE_PADDING));
  for (const r of rects) blit(r.frame, 0, 0, r.frame.width, r.frame.height, atlas, r.x, r.y);

  // Preview assets for the art-test scene.
  await rm(resolve(outDir, 'preview'), { recursive: true, force: true });
  await mkdir(resolve(outDir, 'preview'), { recursive: true });
  const preview: PreviewInfo = { assets: [], hasStyleReference: false };
  for (const entry of manifest.assets) {
    if (entry.status !== 'cleaned' && entry.status !== 'approved') continue;
    const terrain = entry.category === 'terrain' && entry.material;
    const from = terrain
      ? resolve(art.autotiles, `${entry.material}.png`)
      : resolve(art.clean, `${entry.id}.png`);
    if (!existsSync(from)) {
      warnings.push(`${entry.id}: no cleaned image at ${from}; left out of the preview`);
      continue;
    }
    const file = `${entry.id}.png`;
    await copyFile(from, resolve(outDir, 'preview', file));
    const size = terrain
      ? { width: tileSize, height: tileSize }
      : (entry.targetSize ?? (await readPng(from)));
    preview.assets.push({
      id: entry.id,
      category: entry.category,
      status: entry.status,
      file,
      frameWidth: size.width,
      frameHeight: size.height,
      anchor: entry.anchor,
      ...(entry.material ? { material: entry.material } : {}),
    });
  }
  const reference = resolve(art.reference, 'style-reference.png');
  if (existsSync(reference)) {
    await copyFile(reference, resolve(outDir, 'preview', 'style-reference.png'));
    preview.hasStyleReference = true;
  }

  await mkdir(outDir, { recursive: true });
  await writePng(resolve(outDir, 'tiles.png'), tiles);
  await writePng(resolve(outDir, 'walls.png'), walls);
  await writePng(resolve(outDir, 'cracks.png'), cracks);
  await writePng(resolve(outDir, 'sprites.png'), atlas);
  const json = (value: unknown) => JSON.stringify(value, null, 2) + '\n';
  await writeFile(resolve(outDir, 'sprites.json'), json(sprites));
  await writeFile(resolve(outDir, 'pack.json'), json(info));
  await writeFile(resolve(outDir, 'preview', 'preview.json'), json(preview));

  return { info, sprites, preview, warnings };
}
