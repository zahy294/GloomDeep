/**
 * Opens the built game in headless Chromium, saves screenshots to screenshots/ and runs a few
 * behaviour checks (movement, chunk pop-in). Run via `npm run shot` (which builds first).
 */
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type Page } from 'playwright';
import { preview } from 'vite';
import { CHUNK_RENDER, TILE_SIZE, WORLD } from '../src/config';
import type { GameProbe } from '../src/types/window';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = resolve(root, 'screenshots');
const VIEWPORT = { width: 1920, height: 1080 };
const TIMEOUT_MS = 20_000;
const CHUNK_PX = WORLD.chunkSize * TILE_SIZE;

interface Shot {
  name: string;
  query: string;
  /** Runs after the page loads and before the screenshot. Throw to fail the shot. */
  prepare: (page: Page) => Promise<void>;
}

async function waitForScreen(page: Page, screen: string): Promise<void> {
  await page.waitForFunction((s) => window.gloamdeep?.bridge.state.screen === s, screen, {
    timeout: TIMEOUT_MS,
  });
}

const probe = (page: Page) => page.evaluate(() => window.gloamdeep?.probe() ?? null);

/** Waits until the simulation runs and the player has landed. */
async function waitForPlayerReady(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const p = window.gloamdeep?.probe();
      return !!p && p.steps > 30 && p.onGround;
    },
    undefined,
    { timeout: TIMEOUT_MS },
  );
}

async function holdKey(page: Page, key: string, ms: number): Promise<void> {
  await page.keyboard.down(key);
  await page.waitForTimeout(ms);
  await page.keyboard.up(key);
}

function check(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

const report: string[] = [];
const RUN_TIMEOUT_MS = 40_000;

/** Records requestAnimationFrame timestamps in the page, to measure real frame pacing. */
async function startFrameRecorder(page: Page): Promise<void> {
  await page.evaluate(`(() => {
    const times = (window.__frameTimes = []);
    window.__recording = true;
    const tick = (t) => { times.push(t); if (window.__recording) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  })()`);
}

async function stopFrameRecorder(page: Page): Promise<{ fps: number; p95: number; max: number }> {
  const times = (await page.evaluate(
    'window.__recording = false; window.__frameTimes',
  )) as number[];
  const deltas = times
    .slice(1)
    .map((t, i) => t - (times[i] ?? t))
    .sort((x, y) => x - y);
  const total = deltas.reduce((sum, d) => sum + d, 0);
  return {
    fps: deltas.length ? (1000 * deltas.length) / total : 0,
    p95: deltas[Math.floor(deltas.length * 0.95)] ?? 0,
    max: deltas[deltas.length - 1] ?? 0,
  };
}

const SHOTS: Shot[] = [
  { name: 'title', query: '', prepare: (page) => waitForScreen(page, 'title') },
  {
    name: 'title-click-to-game',
    query: '',
    prepare: async (page) => {
      await waitForScreen(page, 'title');
      await page.mouse.click(VIEWPORT.width / 2, VIEWPORT.height / 2);
      await waitForScreen(page, 'game');
      await waitForPlayerReady(page);
    },
  },
  {
    name: 'game-spawn',
    query: '?scene=game&ui=0',
    prepare: waitForPlayerReady,
  },
  {
    name: 'game-debug-overlay',
    query: '?scene=game&debug=1',
    prepare: async (page) => {
      await waitForPlayerReady(page);
      await page.waitForSelector('.debug-overlay', { timeout: TIMEOUT_MS });
    },
  },
  {
    name: 'game-cave',
    query: '?scene=game&ui=0&x=2374&y=453',
    prepare: waitForPlayerReady,
  },
  {
    name: 'game-run-and-jump',
    query: '?scene=game&ui=0',
    prepare: async (page) => {
      await waitForPlayerReady(page);
      const start = (await probe(page)) as GameProbe;

      // Jump: the player must leave the ground and come back.
      await holdKey(page, 'Space', 250);
      await page.waitForTimeout(100);
      const midJump = (await probe(page)) as GameProbe;
      check(midJump.playerY < start.playerY - 2 * TILE_SIZE, 'jump did not rise 2+ tiles');

      // Run west far enough to cross a chunk edge and leave the eastern chunks behind: chunk 16
      // (x >= 16 * CHUNK_PX) unloads once the view + preload margin no longer reaches it.
      // Jump now and then so 2-tile bumps don't stop the run.
      const target = 16 * CHUNK_PX - 1100;
      await startFrameRecorder(page);
      await page.keyboard.down('KeyA');
      const deadline = Date.now() + RUN_TIMEOUT_MS;
      while (((await probe(page))?.playerX ?? 0) > target) {
        check(Date.now() < deadline, 'run west timed out (blocked by terrain?)');
        await holdKey(page, 'Space', 120);
        await page.waitForTimeout(600);
      }
      await page.keyboard.up('KeyA');
      await page.waitForTimeout(400);
      const pacing = await stopFrameRecorder(page);
      const end = (await probe(page)) as GameProbe;

      check(
        end.lateChunkLoads === 0,
        `${end.lateChunkLoads} chunk(s) entered the view unpreloaded`,
      );
      check(end.chunkUnloads > 0, 'no chunk was unloaded after leaving it behind');
      check(end.chunksLoaded <= CHUNK_RENDER.poolSize, `${end.chunksLoaded} chunks loaded`);
      report.push(
        `run: ${((start.playerX - end.playerX) / TILE_SIZE).toFixed(0)} tiles west; chunks: ` +
          `${end.chunksLoaded} loaded, ${end.chunkUnloads} unloaded, ${end.lateChunkLoads} late loads; ` +
          `CPU/frame avg ${end.frameCpuAvgMs.toFixed(2)} ms, max ${end.frameCpuMaxMs.toFixed(2)} ms`,
        `frame pacing (headless SwiftShader, not representative of real GPUs): ` +
          `${pacing.fps.toFixed(1)} FPS avg, p95 frame ${pacing.p95.toFixed(1)} ms, worst ${pacing.max.toFixed(1)} ms`,
      );
    },
  },
];

const server = await preview({
  root,
  preview: { port: 4317, strictPort: false },
  logLevel: 'warn',
});
const baseUrl = server.resolvedUrls?.local[0];
if (!baseUrl) throw new Error('Vite preview did not report a URL');

const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const errors: string[] = [];
let failed = false;

try {
  await mkdir(outDir, { recursive: true });
  for (const shot of SHOTS) {
    const page = await browser.newPage({ viewport: VIEWPORT });
    page.on('pageerror', (err) => errors.push(`[${shot.name}] ${err.message}`));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(`[${shot.name}] console: ${msg.text()}`);
    });
    try {
      await page.goto(new URL(shot.query, baseUrl).href);
      await shot.prepare(page);
      await page.screenshot({ path: resolve(outDir, `${shot.name}.png`) });
      console.log(`saved screenshots/${shot.name}.png`);
    } catch (err) {
      failed = true;
      console.error(`FAILED ${shot.name}: ${(err as Error).message}`);
    } finally {
      await page.close();
    }
  }
} finally {
  await browser.close();
  await new Promise<void>((done) => server.httpServer.close(() => done()));
}

for (const line of report) console.log(line);
if (errors.length) {
  console.error('Page errors:\n' + errors.join('\n'));
  failed = true;
}
process.exit(failed ? 1 : 0);
