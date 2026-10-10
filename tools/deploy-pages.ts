/**
 * Publishes the built game (dist/) to GitHub Pages (M13): the contents of dist/ become the only
 * commit of the `gh-pages` branch on `origin`, force-pushed. Run `npm run deploy:pages` (it builds
 * first). The site is served from https://<user>.github.io/<repo>/ — the build uses relative paths
 * (vite base './'), so it works from any folder.
 */
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const dist = resolve('dist');
if (!existsSync(join(dist, 'index.html'))) throw new Error('dist/ is missing: run npm run build');
const git = (args: string[], cwd: string) =>
  execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'inherit'] })
    .toString()
    .trim();

const remote = git(['remote', 'get-url', 'origin'], process.cwd());
const head = git(['rev-parse', '--short', 'HEAD'], process.cwd());
const dir = mkdtempSync(join(tmpdir(), 'gloamdeep-pages-'));
try {
  cpSync(dist, dir, { recursive: true });
  // No Jekyll processing: serve files as they are (some names start with an underscore).
  writeFileSync(join(dir, '.nojekyll'), '');
  git(['init', '-q', '-b', 'gh-pages'], dir);
  git(['add', '-A'], dir);
  git(
    [
      '-c',
      'user.name=Gloamdeep deploy',
      '-c',
      'user.email=deploy@localhost',
      'commit',
      '-q',
      '-m',
      `Deploy ${head}`,
    ],
    dir,
  );
  git(['push', '-q', '--force', remote, 'gh-pages'], dir);
  console.log(`Pushed dist/ (from ${head}) to ${remote} gh-pages`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
