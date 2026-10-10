/**
 * Performance check (plan 2.10, M13): opens demanding scenes in the built game (`npm run perf`
 * builds first) and reports draw calls, light-update time and simulation+render CPU per frame
 * from the F3 overlay, plus the download size. Headless Chromium renders with SwiftShader (CPU),
 * so FPS here is not representative of a real GPU; draw calls and CPU times are.
 *
 *   npm run perf
 */
import { readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';
import { preview } from 'vite';

const SCENES: readonly { name: string; query: string }[] = [
  { name: 'surface noon', query: '?scene=game&time=noon' },
  { name: 'surface night, rain', query: '?scene=game&time=night&rain=1' },
  { name: 'cave', query: '?scene=game&spot=cave&time=night' },
  { name: 'Canopyhold night', query: '?scene=game&spot=canopyhold&time=night' },
  { name: 'Dimming night', query: '?scene=game&dimming=1' },
  {
    name: 'Gloam Heart fight',
    query:
      '?scene=game&boss=gloam_heart&bossphase=1&kit=boss&beaten=moth_matriarch,mire_sovereign,hollow_warden',
  },
];
const SETTLE_MS = 6000;
const SAMPLE_MS = 4000;
const SAMPLES = 8;

function folderBytes(dir: string): number {
  let total = 0;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const s = statSync(p);
    total += s.isDirectory() ? folderBytes(p) : s.size;
  }
  return total;
}

const dist = resolve('dist');
const server = await preview({ preview: { port: 4318, strictPort: false }, logLevel: 'warn' });
const base = server.resolvedUrls?.local[0];
if (!base) throw new Error('no preview URL');
const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const MB = 1024 * 1024;
console.log(`dist/: ${(folderBytes(dist) / MB).toFixed(1)} MB on disk`);
try {
  for (const scene of SCENES) {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    let bytes = 0;
    page.on('response', (r) => {
      const len = Number(r.headers()['content-length'] ?? 0);
      if (Number.isFinite(len)) bytes += len;
    });
    await page.goto(new URL(`${scene.query}&spawns=0&debug=1`, base).href);
    await page.waitForFunction(() => (window.gloamdeep?.probe()?.steps ?? 0) > 60, undefined, {
      timeout: 60000,
    });
    await page.waitForTimeout(SETTLE_MS);
    const draws: number[] = [];
    let cpu = 0;
    let cpuMax = 0;
    let light = 0;
    for (let i = 0; i < SAMPLES; i++) {
      await page.waitForTimeout(SAMPLE_MS / SAMPLES);
      const d = await page.evaluate(() => window.gloamdeep?.bridge.state.debug ?? null);
      const p = await page.evaluate(() => window.gloamdeep?.probe() ?? null);
      if (d?.drawCalls !== null && d?.drawCalls !== undefined) draws.push(d.drawCalls);
      cpu = d?.frameCpuAvgMs ?? cpu;
      cpuMax = Math.max(cpuMax, d?.frameCpuMaxMs ?? 0);
      light = p?.lightAvgMs ?? light;
    }
    const maxDraws = draws.length > 0 ? Math.max(...draws) : -1;
    console.log(
      `${scene.name}: draw calls max ${maxDraws}, light update avg ${light.toFixed(2)} ms, ` +
        `frame CPU avg ${cpu.toFixed(2)} ms (worst ${cpuMax.toFixed(1)} ms), downloaded ${(bytes / MB).toFixed(1)} MB`,
    );
    await page.close();
  }
} finally {
  await browser.close();
  await new Promise<void>((done) => server.httpServer.close(() => done()));
}
