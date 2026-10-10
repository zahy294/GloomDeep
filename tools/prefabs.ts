/**
 * Prefab tooling (M11, plan 1.7): `npm run prefabs` writes the shared Tiled tileset
 * (src/data/prefabs/gloamdeep.tileset.json + a swatch image, one cell per tile) and any prefab map
 * that doesn't exist yet from its sketch. Maps are edited in Tiled after that; pass
 * `-- <key> --force` to regenerate one from its sketch, losing hand edits.
 */
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PALETTE } from '../src/data/palette';
import { TILES } from '../src/data/tiles';
import { createImage, setPixel, writePng } from './lib/image';
import { buildTileset, TILESET_COLUMNS, TILESET_FILE, TILESET_IMAGE } from './lib/prefabBuilder';
import { SKETCHES } from './lib/prefabSketches';

const DIR = 'src/data/prefabs';
const TILE = 16;

async function writeTilesetImage(path: string): Promise<void> {
  const rows = Math.ceil(TILES.length / TILESET_COLUMNS);
  const img = createImage(TILESET_COLUMNS * TILE, rows * TILE);
  for (const t of TILES) {
    if (!t.placeholderRamp) continue;
    const [dark, base, light] = PALETTE[t.placeholderRamp];
    const ox = (t.id % TILESET_COLUMNS) * TILE;
    const oy = Math.floor(t.id / TILESET_COLUMNS) * TILE;
    // Solid tiles fill their cell; everything else is a smaller swatch so it reads as an object.
    const inset = t.solid ? 0 : 3;
    for (let y = inset; y < TILE - inset; y++) {
      for (let x = inset; x < TILE - inset; x++) {
        const edge = x === inset || y === inset || x === TILE - inset - 1 || y === TILE - inset - 1;
        setPixel(img, ox + x, oy + y, edge ? dark : (x + y) % 5 === 0 ? light : base);
      }
    }
  }
  await writePng(path, img);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const force = args.includes('--force');
  const only = args.filter((a) => !a.startsWith('--'));
  writeFileSync(join(DIR, TILESET_FILE), `${JSON.stringify(buildTileset(), null, 1)}\n`);
  await writeTilesetImage(join(DIR, TILESET_IMAGE));
  for (const [key, sketch] of Object.entries(SKETCHES)) {
    if (only.length > 0 && !only.includes(key)) continue;
    const path = join(DIR, `${key}.json`);
    if (existsSync(path) && !force) {
      console.log(`${path} exists (edit it in Tiled; --force regenerates it from its sketch)`);
      continue;
    }
    writeFileSync(path, `${JSON.stringify(sketch().toTiled())}\n`);
    console.log(`wrote ${path}`);
  }
}

void main();
