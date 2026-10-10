/**
 * Screenshots for the README (docs/screenshots/, committed): the title and loading screens, the
 * biomes and landmarks, the four bosses, Dimming nights and the Heartlight. Builds first, runs the
 * built game headless (like `npm run shot`) and writes palette-compressed PNGs.
 *
 *   npm run shots:readme
 */
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium, type Page } from 'playwright';
import sharp from 'sharp';
import { preview } from 'vite';
import { tileId } from '../src/data/tiles';

const VIEWPORT = { width: 1920, height: 1080 };
const TIMEOUT_MS = 90000;
const outDir = resolve('docs/screenshots');
const HEART_NODE = tileId('heart_node');
const HEART_NODE_LIT = tileId('heart_node_lit');
/** Root-lamps lit for the Gloam Heart shot (of six). */
const HEART_LAMPS_LIT = 4;
/** The boot loading bar is gone in a blink: hold the art back this long to catch it. */
const LOADING_DELAY_MS = 6000;

interface ReadmeShot {
  name: string;
  query: string;
  prepare: (page: Page) => Promise<void>;
}

const probe = (page: Page) => page.evaluate(() => window.gloamdeep?.probe() ?? null);

async function waitFor(page: Page, ok: string): Promise<void> {
  await page.waitForFunction(ok, undefined, { timeout: TIMEOUT_MS });
}

/** The world runs, the light grid has been computed, and things have settled a moment. */
async function ready(page: Page, settleMs = 2500): Promise<void> {
  await waitFor(page, '(window.gloamdeep?.probe()?.lightUpdates ?? 0) > 3');
  await page.waitForTimeout(settleMs);
}

async function bossState(page: Page, state: string): Promise<void> {
  await waitFor(page, `window.gloamdeep?.probe()?.boss?.state === '${state}'`);
}

const BEATEN_THREE = 'moth_matriarch,mire_sovereign,hollow_warden';

const SHOTS: ReadmeShot[] = [
  {
    name: 'title',
    query: '',
    prepare: async (page) => {
      await waitFor(page, "window.gloamdeep?.bridge.state.screen === 'title'");
      await page.waitForTimeout(2500); // fireflies drift in
    },
  },
  {
    name: 'loading',
    query: '',
    prepare: async (page) => {
      // The route below holds the packed art back, so the loading bar stays up.
      await page.waitForTimeout(LOADING_DELAY_MS / 2);
    },
  },
  {
    name: 'world-generation',
    query: '',
    prepare: async (page) => {
      await waitFor(page, "window.gloamdeep?.bridge.state.screen === 'title'");
      await page.mouse.click(VIEWPORT.width / 2, VIEWPORT.height / 2);
      await page.waitForSelector('.new-world', { timeout: TIMEOUT_MS });
      await page.locator('.sizes label', { hasText: 'Large' }).click();
      await page.locator('button', { hasText: 'Create' }).click();
      await waitFor(page, '(window.gloamdeep?.bridge.state.generation?.progress ?? 0) > 0.4');
    },
  },
  {
    name: 'elderglade',
    query: '?scene=game&ui=0&time=morning&biome=elderglade',
    prepare: (page) => ready(page),
  },
  {
    name: 'moonpetal-vale-night',
    query: '?scene=game&ui=0&time=night&biome=moonpetal_vale',
    prepare: (page) => ready(page),
  },
  {
    // Beside the Mire Sovereign's pool, on the Mire's surface (not inside the arena).
    name: 'weeping-mire',
    query: '?scene=game&ui=0&time=morning&arena=mire_sovereign',
    prepare: (page) => ready(page),
  },
  ...['glowcap_grottos', 'rootdeep', 'moonstone_hollows', 'ember_roots'].map((key): ReadmeShot => ({
    name: key.replace(/_/g, '-'),
    query: `?scene=game&ui=0&time=morning&biome=${key}`,
    prepare: async (page) => {
      await ready(page, 500);
      // Aim the lantern into the cave the way a player looks around.
      await page.mouse.move(VIEWPORT.width * 0.3, VIEWPORT.height * 0.45);
      await page.waitForTimeout(2000);
    },
  })),
  {
    name: 'village',
    query: '?scene=game&time=sunset&ui=0&spot=village',
    prepare: (page) => ready(page, 6000), // the villagers move in
  },
  {
    name: 'canopyhold',
    query: '?scene=game&time=noon&ui=0&spot=canopyhold',
    prepare: (page) => ready(page, 4000),
  },
  {
    name: 'canopyhold-festival',
    query: '?scene=game&ui=0&spot=canopyhold&festival=1',
    prepare: (page) => ready(page, 5000),
  },
  {
    name: 'trade-road-caravan',
    query: '?scene=game&time=sunset&ui=0&spot=road&road=lit',
    prepare: (page) => ready(page, 4000),
  },
  {
    name: 'rootdeep-citadel',
    query: '?scene=game&time=noon&ui=0&spot=citadel&reclaim=gate_ward,lantern_market',
    prepare: (page) => ready(page, 4000),
  },
  {
    name: 'ward',
    query: '?scene=game&time=noon&ui=0&spot=ward',
    prepare: (page) => ready(page),
  },
  {
    name: 'boss-moth-matriarch-intro',
    query: '?scene=game&time=noon&boss=moth_matriarch&kit=boss',
    prepare: async (page) => {
      await bossState(page, 'intro');
      await page.waitForTimeout(1100);
    },
  },
  {
    name: 'boss-moth-matriarch',
    query: '?scene=game&time=noon&boss=moth_matriarch&bossphase=1&kit=boss',
    prepare: async (page) => {
      await ready(page, 500);
      await page.mouse.move(VIEWPORT.width / 2, VIEWPORT.height / 3);
      await page.waitForTimeout(3500);
    },
  },
  {
    name: 'boss-mire-sovereign',
    query: '?scene=game&time=dusk&boss=mire_sovereign&bossphase=1&kit=boss',
    prepare: async (page) => {
      await ready(page, 500);
      // Catch it risen out of the water, not submerged.
      await waitFor(
        page,
        "(() => { const b = window.gloamdeep?.probe()?.boss; return !!b && b.state === 'fight' && b.status !== 'Beneath the dark water'; })()",
      );
      await page.waitForTimeout(600);
    },
  },
  {
    name: 'boss-hollow-warden',
    query: '?scene=game&time=noon&boss=hollow_warden&bossphase=0&kit=boss',
    prepare: async (page) => {
      await ready(page, 500);
      await page.mouse.move(VIEWPORT.width * 0.42, VIEWPORT.height * 0.15);
      await page.waitForTimeout(2500);
    },
  },
  {
    name: 'boss-gloam-heart',
    query: `?scene=game&boss=gloam_heart&bossphase=1&kit=boss&beaten=${BEATEN_THREE}`,
    prepare: async (page) => {
      await ready(page, 500);
      // Relight most of the root-lamps, so the chamber and the Heart can be seen.
      await page.evaluate(
        ([node, lit, count]) => {
          type World = {
            width: number;
            height: number;
            get(x: number, y: number): number;
            set(x: number, y: number, id: number): void;
          };
          const scene = window.gloamdeep?.game.scene.getScene('Game') as unknown as {
            simulation: { world: World; bosses: { active: { bounds: Record<string, number> } } };
          } | null;
          const sim = scene?.simulation;
          const b = sim?.bosses.active?.bounds;
          if (!sim || !b) return;
          let n = 0;
          for (let y = b.y0 ?? 0; y <= (b.y1 ?? 0) && n < count; y++) {
            for (let x = b.x0 ?? 0; x <= (b.x1 ?? 0) && n < count; x++) {
              if (sim.world.get(x, y) === node) {
                sim.world.set(x, y, lit);
                n++;
              }
            }
          }
        },
        [HEART_NODE, HEART_NODE_LIT, HEART_LAMPS_LIT] as const,
      );
      await page.waitForTimeout(3500);
    },
  },
  {
    name: 'heartlight',
    query: `?scene=game&ui=0&boss=gloam_heart&beaten=${BEATEN_THREE},gloam_heart`,
    prepare: (page) => ready(page, 3000),
  },
  {
    name: 'dimming-night',
    query: '?scene=game&dimming=1',
    prepare: (page) => ready(page, 3000),
  },
  {
    name: 'photo-mode',
    query: '?scene=game&time=sunset',
    prepare: async (page) => {
      await ready(page, 500);
      await page.keyboard.press('p');
      await page.waitForSelector('.photo-panel', { timeout: TIMEOUT_MS });
      await page.locator('button', { hasText: 'Dream' }).click();
      await page.waitForTimeout(800);
    },
  },
  {
    name: 'guide',
    query: '?scene=game&time=noon',
    prepare: async (page) => {
      await ready(page, 500);
      await page.keyboard.press('h');
      await page.waitForSelector('.guide-panel', { timeout: TIMEOUT_MS });
      await page.locator('button', { hasText: 'Bosses and the way down' }).click();
    },
  },
];

await mkdir(outDir, { recursive: true });
const server = await preview({ preview: { port: 4319, strictPort: false }, logLevel: 'warn' });
const base = server.resolvedUrls?.local[0];
if (!base) throw new Error('no preview URL');
const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const only = process.env.SHOT_ONLY?.split(',');
let failed = false;
try {
  for (const shot of SHOTS.filter((s) => !only || only.includes(s.name))) {
    const page = await browser.newPage({ viewport: VIEWPORT });
    if (shot.name === 'loading') {
      // Hold back only the sprite atlas, so the bar is caught part-way.
      await page.route('**/packed/sprites*', async (route) => {
        await new Promise((done) => setTimeout(done, LOADING_DELAY_MS));
        await route.continue();
      });
    }
    try {
      const query = shot.query ? `${shot.query}&spawns=0` : '?spawns=0';
      await page.goto(new URL(query, base).href);
      await shot.prepare(page);
      const png = await page.screenshot();
      // Palette PNG: pixel art keeps its look at a fraction of the size.
      await sharp(png)
        .png({ palette: true, quality: 90, compressionLevel: 9 })
        .toFile(resolve(outDir, `${shot.name}.png`));
      const p = await probe(page);
      console.log(
        `saved docs/screenshots/${shot.name}.png${p?.boss ? ` (${p.boss.key} ${p.boss.state})` : ''}`,
      );
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
process.exit(failed ? 1 : 0);
