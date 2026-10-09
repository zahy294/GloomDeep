import { chromium } from 'playwright';
import { preview } from 'vite';
const server = await preview({ root: process.argv[2], preview: { port: 4322 }, logLevel: 'warn' });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
for (const q of ['low', 'medium', 'high']) {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await page.goto(server.resolvedUrls.local[0] + `?scene=game&time=morning&ui=0&quality=${q}`);
  await page.waitForFunction(() => (window.gloamdeep?.probe()?.steps ?? 0) > 30, undefined, { timeout: 30000 });
  await page.waitForTimeout(1500);
  await page.evaluate(() => window.gloamdeep.resetFrameStats());
  const r = await page.evaluate(() => new Promise((res) => { const t = []; const f = (x) => { t.push(x); if (t.length < 120) requestAnimationFrame(f); else res(t); }; requestAnimationFrame(f); }));
  const d = r.slice(1).map((x, i) => x - r[i]);
  const p = await page.evaluate(() => window.gloamdeep.probe());
  console.log(q, 'fps', (1000 * d.length / d.reduce((a, b) => a + b, 0)).toFixed(1), 'cpu avg', p.frameCpuAvgMs.toFixed(2), 'max', p.frameCpuMaxMs.toFixed(2), 'drawCalls', p.drawCalls ?? '?');
  await page.close();
}
await browser.close(); server.httpServer.close();
