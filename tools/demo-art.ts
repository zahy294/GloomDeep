/**
 * End-to-end demo of the art pipeline (M2b "Done when") without touching the real art/ folder:
 * draws two small true-pixel assets, turns them into fake "Nano Banana" output, then runs the real
 * tools on a throwaway art root in the OS temp dir:
 *
 *   import-art → gen-autotiles → (demo-only approval) → pack-atlases --out <dir>
 *
 *   npx tsx tools/demo-art.ts <outDir>      (tools/shot.ts uses dist/packed-demo)
 *
 * The demo approves its own soil texture so the packed game shows it; real art is only ever
 * approved by the user (CLAUDE.md).
 */
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { ArtManifest } from '../src/data/artManifest';
import { PALETTE, type RampName } from '../src/data/palette';
import { hash3 } from './lib/placeholderAtlas';
import { fakeAiImage } from './lib/fakeAiImage';
import { createImage, setPixel, writePng, type RgbaImage } from './lib/image';
import { artPaths, REPO_ROOT } from './lib/manifest';

const SOIL_SIZE = 32;

/** A 16×24 glowing teal mushroom: cap, gills, pale stem, 1px dark outline of its own colours. */
function mushroom(): RgbaImage {
  const img = createImage(16, 24);
  const paint = (x: number, y: number, ramp: RampName, shade: 0 | 1 | 2 | 3) =>
    setPixel(img, x, y, PALETTE[ramp][shade]);
  for (let y = 2; y < 11; y++) {
    const half = Math.round(7 * Math.sqrt(1 - ((y - 10) / 8.5) ** 2));
    for (let x = 8 - half; x < 8 + half; x++) {
      const edge = x === 8 - half || x === 7 + half || y === 2;
      paint(x, y, 'cyan', edge ? 0 : y < 5 && x < 8 ? 3 : 2);
    }
  }
  for (let x = 2; x < 14; x++) paint(x, 10, 'cyan', x % 3 === 0 ? 1 : 0);
  for (let y = 11; y < 24; y++) {
    for (let x = 6; x < 10; x++) {
      const edge = x === 6 || x === 9 || y === 23;
      paint(x, y, 'moonSilver', edge ? 0 : x === 7 ? 3 : 2);
    }
  }
  paint(5, 5, 'mint', 3);
  paint(10, 4, 'mint', 3);
  paint(9, 7, 'mint', 3);
  return img;
}

/** A seamless soil texture: base tone, speckles and small stones that wrap around the edges. */
function soil(): RgbaImage {
  const img = createImage(SOIL_SIZE, SOIL_SIZE);
  for (let y = 0; y < SOIL_SIZE; y++) {
    for (let x = 0; x < SOIL_SIZE; x++) {
      const h = hash3(x, y, 7, 0x5eed);
      const roll = h & 0xff;
      const shade = roll < 24 ? 0 : roll < 64 ? 2 : roll < 72 ? 3 : 1;
      setPixel(img, x, y, PALETTE.soil[shade]);
    }
  }
  for (const [sx, sy] of [
    [3, 5],
    [19, 2],
    [27, 17],
    [10, 24],
    [30, 30],
  ] as const) {
    for (let dy = 0; dy < 2; dy++) {
      for (let dx = 0; dx < 3; dx++) {
        const shade = dy === 0 && dx === 0 ? 2 : 1;
        setPixel(img, (sx + dx) % SOIL_SIZE, (sy + dy) % SOIL_SIZE, PALETTE.stone[shade]);
      }
    }
  }
  return img;
}

const outDir = resolve(process.argv[2] ?? resolve(REPO_ROOT, 'dist/packed-demo'));
const art = artPaths(await mkdtemp(join(tmpdir(), 'gloamdeep-demo-art-')));

await writePng(
  join(art.raw, 'foliage/demo_mushroom.png'),
  fakeAiImage(mushroom(), { pitch: [6, 7], seed: 11 }),
);
await writePng(
  join(art.raw, 'terrain/demo_soil.png'),
  fakeAiImage(soil(), { pitch: 6.5, seed: 12, background: -1 }),
);
const manifest: ArtManifest = {
  version: 1,
  assets: [
    {
      id: 'demo_mushroom',
      category: 'foliage',
      raw: 'foliage/demo_mushroom.png',
      targetSize: { width: 16, height: 24 },
      anchor: 'bottom-center',
      source: { kind: 'procedural' },
      status: 'raw',
    },
    {
      id: 'demo_soil',
      category: 'terrain',
      raw: 'terrain/demo_soil.png',
      targetSize: { width: SOIL_SIZE, height: SOIL_SIZE },
      anchor: 'top-left',
      source: { kind: 'procedural' },
      status: 'raw',
      tileable: 'xy',
      material: 'forest_soil',
    },
  ],
};
await writeFile(art.manifest, JSON.stringify(manifest, null, 2));

const run = (script: string, ...args: string[]) =>
  execFileSync(
    process.execPath,
    [resolve(REPO_ROOT, 'node_modules/tsx/dist/cli.mjs'), script, ...args],
    {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    },
  );

process.stdout.write(run('tools/import-art.ts', '--art', art.root));
process.stdout.write(run('tools/gen-autotiles.ts', '--art', art.root));

// Demo-only approval inside the throwaway art root, so the pack uses the generated soil.
const cleaned = JSON.parse(await readFile(art.manifest, 'utf8')) as ArtManifest;
for (const entry of cleaned.assets) if (entry.id === 'demo_soil') entry.status = 'approved';
await writeFile(art.manifest, JSON.stringify(cleaned, null, 2));

process.stdout.write(run('tools/pack-atlases.ts', '--art', art.root, '--out', outDir));
await rm(art.root, { recursive: true, force: true }); // the throwaway art root
console.log(`demo pack: ${outDir}`);
