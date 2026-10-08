/**
 * Generates placeholder art from the master palette so the game always runs without real art.
 * Output: assets/placeholder/tiles.png + tiles.json (served by Vite from the assets/ public dir).
 *
 *   npm run art:placeholder
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { PLACEHOLDER_ATLAS, TILE_SIZE } from '../src/config';
import { TILES } from '../src/data/tiles';
import { buildPlaceholderAtlas } from './lib/placeholderAtlas';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = resolve(root, 'assets/placeholder');

const atlas = buildPlaceholderAtlas(TILES, { tileSize: TILE_SIZE, ...PLACEHOLDER_ATLAS });

await mkdir(outDir, { recursive: true });
await sharp(Buffer.from(atlas.data), {
  raw: { width: atlas.width, height: atlas.height, channels: 4 },
})
  .png()
  .toFile(resolve(outDir, 'tiles.png'));

const meta = { tileSize: atlas.tileSize, columns: atlas.columns, frames: atlas.frames };
await writeFile(resolve(outDir, 'tiles.json'), JSON.stringify(meta, null, 2) + '\n');

console.log(
  `Placeholder tile atlas: ${atlas.width}×${atlas.height}, ${TILES.length} tiles → assets/placeholder/`,
);
