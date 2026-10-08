/**
 * Opens the built game in headless Chromium and saves screenshots to screenshots/.
 * Run via `npm run shot` (which builds first). The shot list grows as visual milestones land.
 */
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type Page } from 'playwright';
import { preview } from 'vite';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = resolve(root, 'screenshots');
const VIEWPORT = { width: 1920, height: 1080 };
const TIMEOUT_MS = 15_000;

interface Shot {
  name: string;
  query: string;
  /** Runs after the page loads and before the screenshot. */
  prepare: (page: Page) => Promise<void>;
}

async function waitForScreen(page: Page, screen: string): Promise<void> {
  await page.waitForFunction((s) => window.gloamdeep?.bridge.state.screen === s, screen, {
    timeout: TIMEOUT_MS,
  });
}

/** Proves the fixed-timestep simulation is actually running in the Game scene. */
async function waitForSimSteps(page: Page): Promise<void> {
  await page.waitForFunction(() => (window.gloamdeep?.simSteps() ?? 0) > 30, undefined, {
    timeout: TIMEOUT_MS,
  });
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
      await waitForSimSteps(page);
    },
  },
  {
    name: 'game-no-ui',
    query: '?scene=game&ui=0',
    prepare: async (page) => {
      await waitForScreen(page, 'game');
      await waitForSimSteps(page);
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
      const file = resolve(outDir, `${shot.name}.png`);
      await page.screenshot({ path: file });
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

if (errors.length) {
  console.error('Page errors:\n' + errors.join('\n'));
  failed = true;
}
process.exit(failed ? 1 : 0);
