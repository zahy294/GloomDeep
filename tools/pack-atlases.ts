/**
 * Packs approved art (plus placeholders for everything else) into assets/packed/, the only art
 * the game loads: tiles.png, walls.png, cracks.png, sprites.png/json, pack.json, preview/.
 *
 *   npm run art:pack [--art dir] [--out dir]
 */
import { packAtlases } from './lib/pack';
import { parseArtArgs } from './lib/manifest';

const { art, out } = parseArtArgs(process.argv.slice(2));
const { info, warnings } = await packAtlases({ art, outDir: out });
for (const w of warnings) console.warn(`warning: ${w}`);
const approvedTiles = Object.values(info.tiles).filter((s) => s === 'approved').length;
const approvedSprites = Object.values(info.sprites).filter((s) => s === 'approved').length;
console.log(
  `Packed to ${out}: ${approvedTiles}/${Object.keys(info.tiles).length} tiles and ` +
    `${approvedSprites}/${Object.keys(info.sprites).length} sprites approved, the rest placeholders.`,
);
