/**
 * Suggests a ~64-colour palette (16 ramps x 4 shades) from art/reference/style-reference.png.
 * Writes palette-suggestion.json and palette.png next to it; never touches src/data/palette.ts.
 *
 *   npm run art:palette [--art dir]
 */
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { extractPalette, paletteSwatches, rampsToJson } from './lib/extractPalette';
import { readPng, writePng } from './lib/image';
import { parseArtArgs } from './lib/manifest';

const { art } = parseArtArgs(process.argv.slice(2));
const source = resolve(art.reference, 'style-reference.png');
const ramps = extractPalette(await readPng(source));
if (ramps.length === 0) throw new Error(`${source}: no opaque pixels`);

await writeFile(
  resolve(art.reference, 'palette-suggestion.json'),
  JSON.stringify(rampsToJson(ramps), null, 2) + '\n',
);
await writePng(resolve(art.reference, 'palette.png'), paletteSwatches(ramps));
const total = ramps.reduce((n, r) => n + r.length, 0);
console.log(
  `Suggested ${ramps.length} ramps (${total} colours) in ${art.reference}.\n` +
    'Review palette.png, then paste the ramps from palette-suggestion.json into src/data/palette.ts.',
);
