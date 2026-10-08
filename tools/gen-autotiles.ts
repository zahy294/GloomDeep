/**
 * Generates the 47-shape x 3-variation autotile set for each terrain asset from its cleaned
 * seamless base texture: art/clean/<id>.png -> art/clean/autotiles/<material>.png (+ 4x preview).
 *
 *   npm run art:autotiles [material] [--art dir]
 */
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { generateAutotiles } from './lib/autotileGen';
import { readPng, upscale, writePng } from './lib/image';
import { parseArtArgs, readManifest } from './lib/manifest';

const PREVIEW_SCALE = 4;

const { art, positional } = parseArtArgs(process.argv.slice(2));
const wanted = positional[0];
const manifest = await readManifest(art);
let generated = 0;
for (const entry of manifest.assets) {
  if (entry.category !== 'terrain' || !entry.material) continue;
  if (entry.status !== 'cleaned' && entry.status !== 'approved') continue;
  if (wanted && wanted !== entry.material && wanted !== entry.id) continue;
  const source = resolve(art.clean, `${entry.id}.png`);
  if (!existsSync(source)) {
    console.warn(`skip ${entry.id}: ${source} not found`);
    continue;
  }
  const set = generateAutotiles(await readPng(source));
  await writePng(resolve(art.autotiles, `${entry.material}.png`), set);
  await writePng(
    resolve(art.autotiles, `${entry.material}.preview.png`),
    upscale(set, PREVIEW_SCALE),
  );
  console.log(`autotiles ${entry.material} <- ${entry.id}`);
  generated++;
}
if (generated === 0) console.log('No terrain assets to generate.');
