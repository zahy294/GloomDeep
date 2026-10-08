/**
 * Generates placeholder art from the master palette so the game always runs without real art.
 * Output in assets/placeholder/: tiles.png (foreground blob atlas), walls.png (background walls),
 * cracks.png (4 mining stages) and tiles.json (layout metadata).
 *
 *   npm run art:placeholder
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { AUTOTILE, PLACEHOLDER_ATLAS, TILE_SIZE } from '../src/config';
import { TILES } from '../src/data/tiles';
import { FRAMES_PER_TILE } from '../src/sim/world/autotile';
import {
  CRACK_STAGES,
  buildCracksAtlas,
  buildPlaceholderAtlas,
  type Atlas,
} from './lib/placeholderAtlas';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = resolve(root, 'assets/placeholder');
const opts = { tileSize: TILE_SIZE, ...PLACEHOLDER_ATLAS };

async function writePng(name: string, atlas: Atlas): Promise<void> {
  await sharp(Buffer.from(atlas.data), {
    raw: { width: atlas.width, height: atlas.height, channels: 4 },
  })
    .png()
    .toFile(resolve(outDir, name));
}

const tiles = buildPlaceholderAtlas(TILES, opts, 'tiles');
const walls = buildPlaceholderAtlas(TILES, opts, 'walls');
const cracks = buildCracksAtlas(opts);

await mkdir(outDir, { recursive: true });
await writePng('tiles.png', tiles);
await writePng('walls.png', walls);
await writePng('cracks.png', cracks);

const meta = {
  tileSize: TILE_SIZE,
  columns: PLACEHOLDER_ATLAS.columns,
  framesPerTile: FRAMES_PER_TILE,
  variations: AUTOTILE.variations,
  frameCount: tiles.frameCount,
  crackStages: CRACK_STAGES,
};
await writeFile(resolve(outDir, 'tiles.json'), JSON.stringify(meta, null, 2) + '\n');

console.log(
  `Placeholder atlases: ${tiles.width}x${tiles.height}, ${tiles.frameCount} frames → assets/placeholder/`,
);
