/**
 * Packages the built game for itch.io (M13): `release/gloamdeep-html5.zip` with index.html at its
 * root, ready to upload as an HTML5 game ("This file will be played in the browser"). Run
 * `npm run package:itch` (it builds first). With butler logged in, push instead with:
 *
 *   butler push dist <itch-user>/<game>:html5
 *
 * Uses Windows' bsdtar (it writes .zip by extension), or `zip` elsewhere.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const dist = resolve('dist');
if (!existsSync(join(dist, 'index.html'))) throw new Error('dist/ is missing: run npm run build');
const out = resolve('release');
mkdirSync(out, { recursive: true });
const zip = join(out, 'gloamdeep-html5.zip');
rmSync(zip, { force: true });
if (process.platform === 'win32') {
  // Windows' own bsdtar (not Git's GNU tar, which can't write zip files).
  const tar = join(process.env.SystemRoot ?? 'C:/Windows', 'System32', 'tar.exe');
  // Top-level names, not '.', so entries have no './' prefix (itch wants index.html at the root).
  execFileSync(tar, ['-a', '-c', '-f', zip, '-C', dist, ...readdirSync(dist)], {
    stdio: 'inherit',
  });
} else {
  execFileSync('zip', ['-q', '-r', zip, '.'], { cwd: dist, stdio: 'inherit' });
}
const MB = 1024 * 1024;
console.log(`Wrote ${zip} (${(statSync(zip).size / MB).toFixed(1)} MB)`);
