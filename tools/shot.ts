/**
 * Opens the built game in headless Chromium, saves screenshots to screenshots/ and runs a few
 * behaviour checks (movement, chunk loading, mining/building). Run via `npm run shot` (which builds first).
 */
import { execFileSync } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type Page } from 'playwright';
import { preview } from 'vite';
import { CHUNK_RENDER, DISPLAY, TILE_SIZE, WORLD } from '../src/config';
import { itemId } from '../src/data/items';
import { tileId } from '../src/data/tiles';
import { integerZoom } from '../src/render/integerScale';
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
  /** Screenshot only this region (viewport pixels). */
  clip?: { x: number; y: number; width: number; height: number };
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

/** Canvas zoom for the shot viewport (device pixel ratio 1), and its letterbox offset. */
const ZOOM = integerZoom(VIEWPORT.width, VIEWPORT.height, 1);
const CANVAS_LEFT = (VIEWPORT.width - DISPLAY.width * ZOOM) / 2;
const CANVAS_TOP = (VIEWPORT.height - DISPLAY.height * ZOOM) / 2;

/** Moves the real mouse over the centre of a world tile. */
async function pointAtTile(page: Page, tx: number, ty: number): Promise<void> {
  const p = (await probe(page)) as GameProbe;
  await page.mouse.move(
    CANVAS_LEFT + ((tx + 0.5) * TILE_SIZE - p.cameraX) * ZOOM,
    CANVAS_TOP + ((ty + 0.5) * TILE_SIZE - p.cameraY) * ZOOM,
  );
}

const tileAt = (page: Page, x: number, y: number, layer: 'fg' | 'bg' = 'fg') =>
  page.evaluate(([tx, ty, l]) => window.gloamdeep?.tile(tx, ty, l) ?? -1, [x, y, layer] as const);

function countOf(p: GameProbe, item: number): number {
  return p.inventory.reduce((n, s) => n + (s && s.itemId === item ? s.count : 0), 0);
}

/** Holds a mouse button on a tile until `done` holds, or fails after a timeout. */
async function holdOnTile(
  page: Page,
  tx: number,
  ty: number,
  button: 'left' | 'right',
  done: () => Promise<boolean>,
): Promise<void> {
  await pointAtTile(page, tx, ty);
  await page.mouse.down({ button });
  const deadline = Date.now() + 5000;
  try {
    while (!(await done())) {
      check(Date.now() < deadline, `${button} click on tile ${tx},${ty} had no effect`);
      await page.waitForTimeout(50);
    }
  } finally {
    await page.mouse.up({ button });
  }
}
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

/** 4× close-up around the screen centre, where the camera keeps the player. */
const PLAYER_CLOSEUP = {
  x: VIEWPORT.width / 2 - 120,
  y: VIEWPORT.height / 2 - 110,
  width: 240,
  height: 160,
};

const GRASS = tileId('elderglade_grass');
const PLANKS = tileId('elderwood_planks');
const SOIL_ITEM = itemId('forest_soil');
const PLANKS_ITEM = itemId('elderwood_planks');

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
    // M2 "Done when": digging and building respond, edges join after edits, mined blocks reach
    // the hotbar.
    name: 'game-mine-and-build',
    query: '?scene=game',
    prepare: async (page) => {
      await waitForPlayerReady(page);
      const start = (await probe(page)) as GameProbe;
      const px = Math.floor(start.playerX / TILE_SIZE);
      const ground = Math.round(start.playerY / TILE_SIZE);
      check((await tileAt(page, px + 2, ground)) === GRASS, 'expected grass beside the spawn');

      // Mine a 3-wide, 2-deep pit to the right; the soil must fly into the inventory.
      for (const [dx, dy] of [
        [2, 0],
        [3, 0],
        [4, 0],
        [2, 1],
        [3, 1],
        [4, 1],
      ] as const) {
        await holdOnTile(
          page,
          px + dx,
          ground + dy,
          'left',
          async () => (await tileAt(page, px + dx, ground + dy)) === 0,
        );
      }
      // Every drop must fly into the inventory: 3 grass + 3 soil tiles all drop forest soil.
      await page.waitForFunction(() => window.gloamdeep?.probe()?.drops === 0, undefined, {
        timeout: TIMEOUT_MS,
      });
      const dug = (await probe(page)) as GameProbe;
      check(countOf(dug, SOIL_ITEM) === 6, `expected 6 soil, got ${countOf(dug, SOIL_ITEM)}`);

      // Build: planks (hotbar slot 1) as a little pillar left of the player, then a wall behind it.
      await page.keyboard.press('Digit1');
      const planksBefore = countOf(start, PLANKS_ITEM);
      for (const dy of [1, 2, 3]) {
        await holdOnTile(
          page,
          px - 3,
          ground - dy,
          'right',
          async () => (await tileAt(page, px - 3, ground - dy)) === PLANKS,
        );
      }
      await page.keyboard.down('Shift');
      for (const dy of [1, 2, 3]) {
        await holdOnTile(
          page,
          px - 4,
          ground - dy,
          'right',
          async () => (await tileAt(page, px - 4, ground - dy, 'bg')) === PLANKS,
        );
      }
      await page.keyboard.up('Shift');
      await page.mouse.move(VIEWPORT.width / 2, VIEWPORT.height / 4);
      await page.waitForTimeout(300);

      const end = (await probe(page)) as GameProbe;
      check(countOf(end, PLANKS_ITEM) === planksBefore - 6, 'placing did not use 6 planks');
      report.push(
        `mine/build: dug 6 tiles → ${countOf(end, SOIL_ITEM)} soil in inventory; placed 3 planks + 3 plank walls`,
      );
    },
  },
  {
    name: 'game-inventory-open',
    query: '?scene=game',
    prepare: async (page) => {
      await waitForPlayerReady(page);
      await page.keyboard.press('KeyE');
      await page.waitForSelector('.inventory-panel', { timeout: TIMEOUT_MS });
    },
  },
  {
    // M2b: the player is drawn from parts and animated in code. Close-ups mid-stride and mid-swing.
    name: 'player-parts-walking',
    query: '?scene=game&ui=0',
    clip: PLAYER_CLOSEUP,
    prepare: async (page) => {
      await waitForPlayerReady(page);
      await page.keyboard.down('KeyD');
      await page.waitForTimeout(450);
    },
  },
  {
    name: 'player-parts-mining',
    query: '?scene=game&ui=0',
    clip: PLAYER_CLOSEUP,
    prepare: async (page) => {
      await waitForPlayerReady(page);
      const p = (await probe(page)) as GameProbe;
      await pointAtTile(
        page,
        Math.floor(p.playerX / TILE_SIZE) + 2,
        Math.round(p.playerY / TILE_SIZE),
      );
      await page.mouse.down();
      await page.waitForTimeout(220);
    },
  },
  {
    name: 'art-test-mushroom-day',
    query: '?scene=art-test&pack=packed-demo&id=demo_mushroom&time=day',
    prepare: (page) => waitForScreen(page, 'art-test'),
  },
  {
    name: 'art-test-mushroom-night',
    query: '?scene=art-test&pack=packed-demo&id=demo_mushroom&time=night',
    prepare: (page) => waitForScreen(page, 'art-test'),
  },
  {
    name: 'art-test-soil-autotiles',
    query: '?scene=art-test&pack=packed-demo&id=demo_soil&time=day',
    prepare: (page) => waitForScreen(page, 'art-test'),
  },
  {
    // The whole game running on the demo pack: forest soil now uses the generated autotile set.
    name: 'game-demo-pack-soil',
    query: '?scene=game&ui=0&pack=packed-demo',
    prepare: waitForPlayerReady,
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
      await page.evaluate(() => window.gloamdeep?.resetFrameStats());
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
          `streaming CPU/frame avg ${end.frameCpuAvgMs.toFixed(2)} ms, max ${end.frameCpuMaxMs.toFixed(2)} ms`,
        `frame pacing (headless SwiftShader, not representative of real GPUs): ` +
          `${pacing.fps.toFixed(1)} FPS avg, p95 frame ${pacing.p95.toFixed(1)} ms, worst ${pacing.max.toFixed(1)} ms`,
      );
    },
  },
];

// Art pipeline demo (M2b): fake AI images → import → autotiles → pack, into dist/packed-demo.
process.stdout.write(
  execFileSync(
    process.execPath,
    [
      resolve(root, 'node_modules/tsx/dist/cli.mjs'),
      'tools/demo-art.ts',
      resolve(root, 'dist/packed-demo'),
    ],
    { cwd: root, encoding: 'utf8' },
  ),
);

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
      await page.screenshot({ path: resolve(outDir, `${shot.name}.png`), clip: shot.clip });
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
