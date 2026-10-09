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
import { CAMERA, CHUNK_RENDER, DEBUG, DISPLAY, TILE_SIZE, WORLD, WORLD_SIZES } from '../src/config';
import { DEPTH_LAYERS, LIQUID, SURFACE_BIOMES } from '../src/data/biomes';
import { itemId } from '../src/data/items';
import { TILES, tileId } from '../src/data/tiles';
import { viewSize } from '../src/render/integerScale';
import { Simulation } from '../src/sim/Simulation';
import { generateWorld } from '../src/workers/worldgen/generateWorld';
import type { GameProbe } from '../src/types/window';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
/** Built game to serve: `SHOT_DIST=dist-foo` serves a build made with `vite build --outDir`. */
const DIST = process.env.SHOT_DIST ?? 'dist';
const outDir = resolve(root, 'screenshots');
const VIEWPORT = { width: 1920, height: 1080 };
const TIMEOUT_MS = 20_000;
const CHUNK_PX = WORLD.chunkSize * TILE_SIZE;

interface Shot {
  name: string;
  query: string;
  /** Runs after the page loads and before the screenshot. Throw to fail the shot. */
  prepare: (page: Page) => Promise<void>;
  /** Browser viewport for this shot (default 1920×1080). */
  viewport?: { width: number; height: number };
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
const VIEW = viewSize(VIEWPORT.width, VIEWPORT.height, 1);
const ZOOM = VIEW.zoom;
const CANVAS_LEFT = (VIEWPORT.width - DISPLAY.width * ZOOM) / 2;
const CANVAS_TOP = (VIEWPORT.height - VIEW.height * ZOOM) / 2;

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

/** Presses the number key of the hotbar slot holding an item. */
async function selectItem(page: Page, item: number): Promise<void> {
  const p = (await probe(page)) as GameProbe;
  const slot = p.inventory.findIndex((s) => s?.itemId === item);
  check(slot >= 0 && slot < 10, `item ${item} is not in the hotbar`);
  await page.keyboard.press(`Digit${(slot + 1) % 10}`);
}

/** Waits until the probe satisfies a condition (the simulation applies UI commands next step). */
async function waitForProbe(page: Page, ok: (p: GameProbe) => boolean, what: string) {
  const deadline = Date.now() + TIMEOUT_MS;
  for (;;) {
    const p = (await probe(page)) as GameProbe;
    if (ok(p)) return p;
    check(Date.now() < deadline, `timed out waiting for ${what}`);
    await page.waitForTimeout(50);
  }
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

/**
 * Close-up around the player: the screen centre, lowered by the camera's surface lift (outdoors the
 * camera frames more forest above the player).
 */
const PLAYER_CLOSEUP = {
  x: VIEWPORT.width / 2 - 120,
  y: VIEWPORT.height / 2 - 110 + CAMERA.surfaceLift * ZOOM,
  width: 240,
  height: 160,
};

/** An open cave pocket in the debug world (src/sim/world/debugSpawn.ts). */
const CAVE = 'spot=cave';
const TORCH = tileId('torch');
/** Darkness check: cave air cells this far (tiles) from the player and any emissive tile. */
const DARK_CHECK = { radius: 18, awayFromPlayer: 6, awayFromGlow: 8, minSamples: 15 } as const;

const lightAt = async (page: Page, x: number, y: number): Promise<[number, number, number]> =>
  (await page.evaluate(([tx, ty]) => window.gloamdeep?.light(tx, ty) ?? null, [x, y] as const)) ?? [
    0, 0, 0,
  ];

/** Waits until the light grid has been computed a few times (the worker is asynchronous). */
async function waitForLight(page: Page): Promise<void> {
  await waitForPlayerReady(page);
  await page.waitForFunction(() => (window.gloamdeep?.probe()?.lightUpdates ?? 0) > 3, undefined, {
    timeout: TIMEOUT_MS,
  });
}

/**
 * The first of `offsets` (relative to x, y) where a tile can be placed on `layer`: empty there,
 * and touching a block or wall (BuildingSystem's support rule). Generated worlds vary, so shots
 * pick a valid spot instead of assuming fixed terrain.
 */
async function placeableNear(
  page: Page,
  x: number,
  y: number,
  layer: 'fg' | 'bg',
  offsets: readonly (readonly [number, number])[],
): Promise<[number, number]> {
  for (const [dx, dy] of offsets) {
    const tx = x + dx;
    const ty = y + dy;
    if ((await tileAt(page, tx, ty, layer)) !== 0) continue;
    if (layer === 'fg' && (await tileAt(page, tx, ty, 'bg')) > 0) return [tx, ty];
    for (const [nx, ny] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      if ((await tileAt(page, tx + nx, ty + ny)) > 0) return [tx, ty];
      if ((await tileAt(page, tx + nx, ty + ny, 'bg')) > 0) return [tx, ty];
    }
  }
  throw new Error(`nowhere to place a ${layer} tile near ${x},${y}`);
}

/** Title → world list. */
async function openWorldList(page: Page): Promise<void> {
  await waitForScreen(page, 'title');
  await page.mouse.click(VIEWPORT.width / 2, VIEWPORT.height / 2);
  await waitForScreen(page, 'worlds');
}

async function createWorld(page: Page, name: string, seed: number, size: string): Promise<void> {
  await page.fill('.new-world label:has-text("Name") input', name);
  await page.fill('.new-world label:has-text("Seed") input', String(seed));
  await page.click(`.new-world .sizes label:has-text("${size}")`);
  await page.click('.new-world button[type=submit]');
}

/** Foreground and wall ids in a 41×21 box around a tile, as one string to compare. */
const sampleTiles = (page: Page, cx: number, cy: number) =>
  page.evaluate(
    ([x0, y0]) => {
      const out: number[] = [];
      for (let y = y0 - 10; y <= y0 + 10; y++) {
        for (let x = x0 - 20; x <= x0 + 20; x++) {
          out.push(
            window.gloamdeep?.tile(x, y, 'fg') ?? -1,
            window.gloamdeep?.tile(x, y, 'bg') ?? -1,
          );
        }
      }
      return out.join(',');
    },
    [cx, cy] as const,
  );

/** One shot per surface biome (noon, on the surface) and per depth layer (in a cave there). */
const BIOME_SHOTS: Shot[] = [...SURFACE_BIOMES, ...DEPTH_LAYERS].map(({ key }) => ({
  name: `biome-${key}`,
  query: `?scene=game&ui=0&time=morning&biome=${key}`,
  prepare: async (page: Page) => {
    await waitForLight(page);
    // Underground, aim the lantern into the cave the way a player would look around.
    if (DEPTH_LAYERS.some((l) => l.key === key)) {
      await page.mouse.move(VIEWPORT.width * 0.3, VIEWPORT.height * 0.45);
    }
    await page.waitForTimeout(2000); // particles, mist and the biome blend settle
  },
}));

/**
 * The shallowest open surface cell of each liquid in the debug world (`?scene=game` without a seed),
 * found by generating the same world here, so the liquid shots don't hard-code coordinates.
 */
function liquidSpots(): Record<'water' | 'lava', string> {
  const size = WORLD_SIZES.medium;
  const { world } = Simulation.fromGenerated(
    generateWorld(size.width, size.height, DEBUG.defaultSeed),
  );
  const find = (type: number): string => {
    let best: { x: number; y: number; depth: number } | null = null;
    for (let y = 1; y < world.height; y++) {
      for (let x = 0; x < world.width; x++) {
        const i = y * world.width + x;
        if (world.liquidType[i] !== type || world.liquidType[i - world.width] !== 0) continue;
        // Room for the player above the pool (the x/y override pushes the feet up until clear).
        if ([1, 2, 3].some((dy) => world.isSolid(x, y - dy))) continue;
        const depth = y - (world.skyline[x] ?? 0);
        if (!best || depth < best.depth) best = { x, y, depth };
      }
    }
    if (!best) throw new Error(`no liquid of type ${type} in the debug world`);
    return `x=${best.x}&y=${best.y}`;
  };
  return { water: find(LIQUID.water), lava: find(LIQUID.lava) };
}

const LIQUID_SPOTS = liquidSpots();

const LIQUID_SHOTS: Shot[] = (['water', 'lava'] as const).map((liquid) => ({
  name: `liquid-${liquid}`,
  // High quality: still pools show their reflection.
  query: `?scene=game&ui=0&time=noon&quality=high&${LIQUID_SPOTS[liquid]}`,
  prepare: async (page) => {
    await waitForLight(page);
    await page.mouse.move(VIEWPORT.width / 2, VIEWPORT.height * 0.6); // lantern at the pool
    await page.waitForTimeout(400);
  },
}));

const GRASS = tileId('elderglade_grass');
const PLANKS = tileId('elderwood_planks');
const SOIL_ITEM = itemId('forest_soil');
const PLANKS_ITEM = itemId('elderwood_planks');
const TORCH_ITEM = itemId('torch');
const FLARE_ITEM = itemId('flare');
const WORKBENCH_ITEM = itemId('workbench');
const WORKBENCH = tileId('workbench');
const LIVING_WOOD_ITEM = itemId('living_wood');
const ELDER_PICK_ITEM = itemId('elderwood_pickaxe');

/**
 * Ad-hoc shots from the command line, e.g.
 * `SHOT_EXTRA="dawn-glade|?scene=game&time=dawn&ui=0;mire|?scene=game&biome=weeping_mire"`.
 * Each waits for the light grid, then waits `SHOT_WAIT_MS` (default 600) for effects to settle.
 */
const EXTRA_SHOTS: Shot[] = (process.env.SHOT_EXTRA ?? '')
  .split(';')
  .filter((entry) => entry.includes('|'))
  .map((entry) => {
    const [name = 'extra', query = ''] = entry.split('|');
    return {
      name,
      query,
      prepare: async (page: Page) => {
        await waitForLight(page);
        await page.waitForTimeout(Number(process.env.SHOT_WAIT_MS ?? 600));
      },
    };
  });

/** Waits for the light grid, then lets particles, mist and blends settle. */
const settled = (ms: number) => async (page: Page) => {
  await waitForLight(page);
  await page.waitForTimeout(ms);
};

/**
 * M5 "Done when": the Elderglade at sunrise and through the day (light shafts, mist, motes,
 * swaying grass), weather, and water.
 */
const FOREST_SHOTS: Shot[] = [
  { name: 'forest-sunrise', query: '?scene=game&ui=0&time=dawn', prepare: settled(2500) },
  { name: 'forest-morning', query: '?scene=game&ui=0&time=morning', prepare: settled(2500) },
  { name: 'forest-sunset', query: '?scene=game&ui=0&time=sunset', prepare: settled(2500) },
  { name: 'forest-night', query: '?scene=game&ui=0&time=night', prepare: settled(2500) },
  { name: 'forest-rain', query: '?scene=game&ui=0&time=noon&rain=1', prepare: settled(2500) },
  {
    name: 'forest-waterfall',
    query: '?scene=game&ui=0&time=noon&spot=waterfall',
    prepare: settled(2000),
  },
];

/** An open cave pocket in the Gloam Heart (bottom layer, thick Gloam). */
const GLOAM_CAVE = 'biome=gloam_heart&spot=cave';
/** A cave in the Ember Roots: patchy Gloam on rock you can read. */
const EMBER_CAVE = 'biome=ember_roots&spot=cave';

/** Total Gloam in a square of tiles around (x, y). */
async function gloamAround(page: Page, x: number, y: number, r: number): Promise<number> {
  return page.evaluate(
    ([cx, cy, radius]) => {
      let sum = 0;
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          sum += Math.max(0, window.gloamdeep?.gloam(cx + dx, cy + dy) ?? 0);
        }
      }
      return sum;
    },
    [x, y, r] as const,
  );
}

/** M7: the Gloam, the lenses and flares. */
const GLOAM_SHOTS: Shot[] = [
  {
    // Thick Gloam veins on the rock of the deepest layer.
    name: 'gloam-heart',
    query: `?scene=game&time=noon&ui=0&${GLOAM_CAVE}`,
    prepare: async (page) => {
      await waitForLight(page);
      await page.waitForTimeout(800);
      const p = (await probe(page)) as GameProbe;
      const px = Math.floor(p.playerX / TILE_SIZE);
      const py = Math.round(p.playerY / TILE_SIZE);
      const total = await gloamAround(page, px, py, 14);
      check(total > 255 * 100, `expected thick Gloam in the Gloam Heart, got ${total}`);
      report.push(`gloam heart: ${Math.round(total / 255)} cells' worth of Gloam within 14 tiles`);
    },
  },
  {
    // M7 "Done when": lighting it pushes the Gloam back (a torch placed in the dark).
    name: 'gloam-pushback',
    query: `?scene=game&time=noon&kit=lenses&${EMBER_CAVE}`,
    prepare: async (page) => {
      await waitForLight(page);
      await page.keyboard.press('KeyF'); // lantern off: only the torch lights it
      await page.waitForTimeout(1500);
      const p = (await probe(page)) as GameProbe;
      const px = Math.floor(p.playerX / TILE_SIZE);
      const row = Math.round(p.playerY / TILE_SIZE) - 1;
      await selectItem(page, TORCH_ITEM);
      const offsets = [5, 4, 6, 3, -4, -5, -3, -6].flatMap((d) =>
        [0, -1, 1, -2].map((dy) => [d, dy] as const),
      );
      const [tx, ty] = await placeableNear(page, px, row, 'fg', offsets);
      const before = await gloamAround(page, tx, ty, 4);
      await holdOnTile(page, tx, ty, 'right', async () => (await tileAt(page, tx, ty)) === TORCH);
      await page.mouse.move(VIEWPORT.width / 2, VIEWPORT.height / 5);
      await page.waitForTimeout(3000);
      const after = await gloamAround(page, tx, ty, 4);
      check(before > 0, 'no Gloam around the torch spot to push back');
      check(after < before * 0.3, `Gloam around the torch went ${before} → ${after}`);
      report.push(
        `gloam pushback: torch at ${tx},${ty}; Gloam within 4 tiles ${before} → ${after}`,
      );
    },
  },
  {
    // The Crimson lens burns the Gloam in its cone.
    name: 'lens-crimson',
    query: `?scene=game&time=noon&kit=lenses&${EMBER_CAVE}`,
    prepare: async (page) => {
      await waitForLight(page);
      await page.keyboard.press('KeyQ'); // azure
      await page.waitForTimeout(150);
      await page.keyboard.press('KeyQ'); // crimson
      const p = (await probe(page)) as GameProbe;
      const px = Math.floor(p.playerX / TILE_SIZE);
      const py = Math.round(p.playerY / TILE_SIZE) - 2;
      await pointAtTile(page, px + 7, py + 2);
      await page.waitForTimeout(2000);
      const lens = await page.textContent('.hud');
      check(lens?.includes('Crimson') === true, `HUD shows "${lens}"`);
    },
  },
  {
    // Flares: thrown light in a dark cave.
    name: 'flare-dark-cave',
    query: `?scene=game&time=noon&kit=lenses&ui=0&${CAVE}`,
    prepare: async (page) => {
      await waitForLight(page);
      await page.keyboard.press('KeyF');
      await selectItem(page, FLARE_ITEM);
      const p = (await probe(page)) as GameProbe;
      const px = Math.floor(p.playerX / TILE_SIZE);
      const py = Math.round(p.playerY / TILE_SIZE) - 2;
      await pointAtTile(page, px + 8, py - 3);
      await page.mouse.down({ button: 'right' });
      await page.waitForTimeout(100);
      await page.mouse.up({ button: 'right' });
      await page.mouse.move(VIEWPORT.width / 2, VIEWPORT.height / 5);
      await page.waitForTimeout(2500);
      const end = (await probe(page)) as GameProbe;
      check(countOf(end, FLARE_ITEM) === 19, 'no flare was thrown');
    },
  },
];

const SHOTS: Shot[] = [
  ...EXTRA_SHOTS,
  ...FOREST_SHOTS,
  ...BIOME_SHOTS,
  ...LIQUID_SHOTS,
  ...GLOAM_SHOTS,
  { name: 'title', query: '', prepare: (page) => waitForScreen(page, 'title') },
  {
    // M4: the title leads to the world list (with an empty IndexedDB: no worlds yet).
    name: 'worlds-empty',
    query: '',
    prepare: async (page) => {
      await waitForScreen(page, 'title');
      await page.mouse.click(VIEWPORT.width / 2, VIEWPORT.height / 2);
      await waitForScreen(page, 'worlds');
      await page.waitForSelector('.new-world', { timeout: TIMEOUT_MS });
    },
  },
  {
    // M4 "Done when": creating a world shows progress and finishes in under 15 s (large world).
    name: 'worlds-created-large',
    query: '',
    prepare: async (page) => {
      await openWorldList(page);
      const started = Date.now();
      await createWorld(page, 'Shot world', 7, 'Large');
      await page.waitForFunction(
        () => (window.gloamdeep?.bridge.state.generation?.progress ?? 0) > 0.15,
        undefined,
        { timeout: TIMEOUT_MS },
      );
      await page.screenshot({ path: resolve(outDir, 'worlds-generating.png') });
      await waitForScreen(page, 'game');
      const seconds = (Date.now() - started) / 1000;
      check(seconds < 15, `creating a large world took ${seconds.toFixed(1)} s (limit 15 s)`);
      report.push(`create large world (6400×1800) → game: ${seconds.toFixed(1)} s`);
      await waitForPlayerReady(page);
    },
  },
  {
    // M4 "Done when": quitting and reloading restores the world exactly (in the real browser,
    // through IndexedDB and the gzip save format).
    name: 'save-reload-restored',
    // Low quality: a behaviour check, and software rendering keeps the sim at full speed there.
    query: '?ui=1&quality=low&kit=build',
    prepare: async (page) => {
      await openWorldList(page);
      await createWorld(page, 'Save test', 42, 'Small');
      await waitForScreen(page, 'game');
      await waitForPlayerReady(page);

      // Change the world: walk right, dig a tile beside the player, place a plank wall.
      await holdKey(page, 'KeyD', 400);
      await page.waitForFunction(() => window.gloamdeep?.probe()?.onGround, undefined, {
        timeout: TIMEOUT_MS,
      });
      const p = (await probe(page)) as GameProbe;
      const px = Math.floor(p.playerX / TILE_SIZE);
      const ground = Math.round(p.playerY / TILE_SIZE);
      await holdOnTile(page, px + 2, ground, 'left', async () => {
        return (await tileAt(page, px + 2, ground)) === 0;
      });
      await selectItem(page, PLANKS_ITEM);
      await page.keyboard.down('Shift');
      const [wx, wy] = await placeableNear(page, px, ground, 'bg', [
        [-2, -1],
        [-3, -1],
        [-2, -2],
        [2, -1],
        [3, -1],
        [-1, 1],
      ]);
      await holdOnTile(page, wx, wy, 'right', async () => {
        return (await tileAt(page, wx, wy, 'bg')) === PLANKS;
      });
      await page.keyboard.up('Shift');
      await page.waitForTimeout(300);

      // Let every drop land in the inventory first, so the saved state is at rest.
      await page.waitForFunction(() => window.gloamdeep?.probe()?.drops === 0, undefined, {
        timeout: TIMEOUT_MS,
      });
      await page.keyboard.press('Escape');
      await page.waitForSelector('text=Save & quit', { timeout: TIMEOUT_MS });
      const before = (await probe(page)) as GameProbe;
      const tilesBefore = await sampleTiles(page, px, ground);
      await page.click('text=Save & quit');
      await waitForScreen(page, 'worlds');

      await page.reload();
      await openWorldList(page);
      await page.waitForSelector('.world-row', { timeout: TIMEOUT_MS });
      await page.click('.world-row button:text-is("Play")');
      await waitForScreen(page, 'game');
      await waitForPlayerReady(page);
      const after = (await probe(page)) as GameProbe;
      const tilesAfter = await sampleTiles(page, px, ground);

      check(
        after.playerX === before.playerX && after.playerY === before.playerY,
        `player moved across save/reload: ${before.playerX},${before.playerY} → ${after.playerX},${after.playerY}`,
      );
      check(tilesAfter === tilesBefore, 'tiles around the player differ after reload');
      check(
        JSON.stringify(after.inventory) === JSON.stringify(before.inventory),
        'inventory differs after reload',
      );
      check((await tileAt(page, px + 2, ground)) === 0, 'dug tile came back after reload');
      report.push(
        `save → reload: player at ${after.playerX},${after.playerY} (unchanged), ` +
          `41×21 tiles and walls around it and the inventory identical`,
      );
    },
  },
  {
    // A windowed 1080p browser (~950 px tall): rows are cropped to keep the ×2 zoom.
    name: 'windowed-1080p-crop',
    query: '?scene=game&time=noon',
    viewport: { width: 1920, height: 950 },
    prepare: async (page) => {
      await waitForPlayerReady(page);
      const size = await page.evaluate(() => {
        const canvas = document.querySelector('canvas');
        const rect = canvas?.getBoundingClientRect();
        return { w: canvas?.width, h: canvas?.height, cssW: rect?.width, cssH: rect?.height };
      });
      const expected = viewSize(1920, 950, 1);
      check(
        size.w === DISPLAY.width && size.h === expected.height && size.cssW === 1920,
        `expected a 960×${expected.height} canvas at ×2, got ${JSON.stringify(size)}`,
      );
      report.push(`windowed 1080p: ×${expected.zoom}, ${size.w}×${size.h} game pixels`);
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
    query: '?scene=game&kit=build',
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

      // Build: planks as a little pillar left of the player, then a wall behind it.
      await selectItem(page, PLANKS_ITEM);
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
    // M6: by hand you can't break stone, and the game says which pickaxe it needs.
    name: 'game-needs-pickaxe',
    query: `?scene=game&time=noon&${CAVE}`,
    prepare: async (page) => {
      await waitForLight(page);
      const p = (await probe(page)) as GameProbe;
      const px = Math.floor(p.playerX / TILE_SIZE);
      const ground = Math.round(p.playerY / TILE_SIZE);
      // Any tile within reach that needs a pickaxe (stone, ore...).
      let target: [number, number] | null = null;
      for (let r = 1; r <= 4 && !target; r++) {
        for (let dy = -r; dy <= r && !target; dy++) {
          for (let dx = -r; dx <= r && !target; dx++) {
            const id = await tileAt(page, px + dx, ground + dy);
            if ((TILES[id]?.tier ?? 0) >= 1) target = [px + dx, ground + dy];
          }
        }
      }
      check(target !== null, 'no pickaxe-tier tile beside the cave spawn');
      const [tx, ty] = target ?? [0, 0];
      await pointAtTile(page, tx, ty);
      await page.mouse.down();
      await page.waitForSelector('.notice', { timeout: TIMEOUT_MS });
      await page.waitForTimeout(1500);
      await page.mouse.up();
      const hard = await tileAt(page, tx, ty);
      check((TILES[hard]?.tier ?? 0) >= 1, 'a pickaxe-tier tile broke by hand');
      const text = await page.textContent('.notice');
      check(text?.startsWith('Needs ') === true, `notice said "${text}"`);
      report.push(`needs pickaxe: ${TILES[hard]?.name} holds by hand for 1.5 s, notice "${text}"`);
    },
  },
  {
    // M6: the crafting screen with real mouse input — place a workbench, craft planks by hand and
    // a pickaxe at the bench, drag a stack to another slot; ends on a tooltip.
    name: 'game-inventory-crafting',
    query: '?scene=game&time=noon&kit=crafting',
    prepare: async (page) => {
      await waitForPlayerReady(page);
      const start = (await probe(page)) as GameProbe;
      const px = Math.floor(start.playerX / TILE_SIZE);
      const ground = Math.round(start.playerY / TILE_SIZE);
      await selectItem(page, WORKBENCH_ITEM);
      // On flat ground beside the player; a grass tuft there is fine (placing replaces it).
      let spot: [number, number] | null = null;
      for (const dx of [2, 3, -2, -3, 4, -4]) {
        const here = await tileAt(page, px + dx, ground - 1);
        const below = await tileAt(page, px + dx, ground);
        if ((here === 0 || TILES[here]?.decor) && TILES[below]?.solid) {
          spot = [px + dx, ground - 1];
          break;
        }
      }
      check(spot !== null, 'no flat ground beside the spawn for the workbench');
      const [bx, by] = spot ?? [0, 0];
      await holdOnTile(
        page,
        bx,
        by,
        'right',
        async () => (await tileAt(page, bx, by)) === WORKBENCH,
      );
      await page.mouse.move(VIEWPORT.width / 2, VIEWPORT.height / 5);
      await page.keyboard.press('KeyE');
      await page.waitForSelector('.crafting-panel', { timeout: TIMEOUT_MS });

      // Shift-click crafts all the living wood into planks.
      const planks = page.locator('.recipe.ready', { hasText: 'Elderwood Planks' }).first();
      await planks.locator('button').click({ modifiers: ['Shift'] });
      const wood = countOf(start, LIVING_WOOD_ITEM);
      await waitForProbe(
        page,
        (p) => countOf(p, PLANKS_ITEM) === wood * 4 && countOf(p, LIVING_WOOD_ITEM) === 0,
        `${wood * 4} planks`,
      );
      // The workbench is in reach, so its recipes are listed.
      await page.locator('.crafting-search').fill('pick');
      const pick = page.locator('.recipe.ready', { hasText: 'Elderwood Pickaxe' });
      await pick.locator('button').click();
      await waitForProbe(page, (p) => countOf(p, ELDER_PICK_ITEM) === 2, 'a second pickaxe');
      await page.locator('.crafting-search').fill('');

      // Drag and drop: slot 1 → slot 25.
      const slots = page.locator('.inventory-grid .slot');
      const from = await slots.nth(0).boundingBox();
      const to = await slots.nth(25).boundingBox();
      check(from !== null && to !== null, 'inventory slots not found');
      const moved = ((await probe(page)) as GameProbe).inventory[0];
      if (from && to) {
        await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
        await page.mouse.down();
        await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 6 });
        await page.mouse.up();
      }
      await waitForProbe(
        page,
        (p) => p.inventory[0] === null && JSON.stringify(p.inventory[25]) === JSON.stringify(moved),
        'the dragged stack in slot 26',
      );
      // Hover the pickaxe for its tooltip.
      const end = (await probe(page)) as GameProbe;
      const pickSlot = end.inventory.findIndex((s) => s?.itemId === ELDER_PICK_ITEM);
      await slots.nth(pickSlot).hover();
      await page.waitForSelector('.tooltip', { timeout: TIMEOUT_MS });
      report.push(
        `crafting: ${wood} living wood → ${wood * 4} planks, a pickaxe at the workbench, ` +
          `dragged slot 1 → 26, tooltip shown`,
      );
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
    query: '?scene=game&ui=0&kit=build',
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
  // M3 lighting: day, sunset and night on the surface; a dark cave lit by torches.
  {
    name: 'light-noon',
    query: '?scene=game&time=noon',
    prepare: waitForLight,
  },
  {
    name: 'light-sunset',
    query: '?scene=game&time=sunset&ui=0',
    prepare: async (page) => {
      await waitForLight(page);
      const p = (await probe(page)) as GameProbe;
      const sky = await lightAt(
        page,
        Math.floor(p.playerX / TILE_SIZE),
        Math.floor(p.playerY / TILE_SIZE) - 6,
      );
      check(sky[0] > sky[2] * 1.5, `sunset light should be warm, got rgb ${sky.join(',')}`);
      report.push(`sunset surface light rgb ${sky.join(',')}`);
    },
  },
  {
    name: 'light-night-lantern',
    query: '?scene=game&time=night&ui=0',
    prepare: async (page) => {
      await waitForLight(page);
      await page.mouse.move(VIEWPORT.width * 0.75, VIEWPORT.height * 0.55);
      await page.waitForTimeout(300);
    },
  },
  {
    name: 'light-cave-dark',
    query: `?scene=game&time=noon&ui=0&${CAVE}`,
    prepare: async (page) => {
      await waitForLight(page);
      await page.keyboard.press('KeyF'); // lantern off
      await page.waitForTimeout(400);
      const p = (await probe(page)) as GameProbe;
      // Away from the player (who keeps a faint aura, plan 2.1) and from glowing plants and
      // crystals (bioluminescence), the cave must be dark.
      const px = Math.floor(p.playerX / TILE_SIZE);
      const py = Math.floor(p.playerY / TILE_SIZE) - 1;
      const R = DARK_CHECK.radius;
      const region = await page.evaluate(
        ([x0, y0, size]) => {
          const g = window.gloamdeep;
          const tiles: number[] = [];
          const light: number[] = [];
          for (let y = y0; y < y0 + size; y++) {
            for (let x = x0; x < x0 + size; x++) {
              tiles.push(g?.tile(x, y, 'fg') ?? -1);
              light.push(Math.max(...(g?.light(x, y) ?? [0, 0, 0])));
            }
          }
          return { tiles, light };
        },
        [px - R, py - R, 2 * R + 1] as const,
      );
      const size = 2 * R + 1;
      const emissive: [number, number][] = [];
      region.tiles.forEach((id, i) => {
        if (TILES[id]?.light) emissive.push([i % size, Math.floor(i / size)]);
      });
      let samples = 0;
      let brightest = 0;
      region.tiles.forEach((id, i) => {
        const x = i % size;
        const y = Math.floor(i / size);
        if (id !== 0 || Math.hypot(x - R, y - R) < DARK_CHECK.awayFromPlayer) return;
        if (emissive.some(([ex, ey]) => Math.hypot(ex - x, ey - y) < DARK_CHECK.awayFromGlow)) {
          return;
        }
        samples++;
        brightest = Math.max(brightest, region.light[i] ?? 0);
      });
      check(samples >= DARK_CHECK.minSamples, `only ${samples} cave cells away from light`);
      check(brightest < 24, `cave should be dark away from light, brightest ${brightest}`);
      report.push(
        `cave light away from the player and glowing plants, lantern off: max ${brightest} over ${samples} cells`,
      );
    },
  },
  {
    // The lantern's cone lights the cave where you aim (it's dark there with the lantern off).
    name: 'light-cave-lantern',
    query: `?scene=game&time=noon&ui=0&${CAVE}`,
    prepare: async (page) => {
      await waitForLight(page);
      const p = (await probe(page)) as GameProbe;
      const tx = Math.floor(p.playerX / TILE_SIZE) - 7;
      const ty = Math.floor(p.playerY / TILE_SIZE) - 2;
      await pointAtTile(page, tx, ty);
      await page.waitForTimeout(400);
      const lit = await lightAt(page, tx, ty);
      check(
        lit[1] > 60,
        `the lantern cone should light the cave where it points, got rgb ${lit.join(',')}`,
      );
      report.push(`cave lit by the lantern 7 tiles away: rgb ${lit.join(',')}`);
    },
  },
  {
    name: 'light-cave-torches',
    query: `?scene=game&time=noon&ui=0&${CAVE}`,
    prepare: async (page) => {
      await waitForLight(page);
      await page.keyboard.press('KeyF'); // lantern off: torches only
      await selectItem(page, TORCH_ITEM);
      const p = (await probe(page)) as GameProbe;
      const px = Math.floor(p.playerX / TILE_SIZE);
      const row = Math.round(p.playerY / TILE_SIZE) - 1;
      // Two torches, one each side if the cave allows (else both on one side), 2–6 tiles out.
      const side = (dir: number) =>
        [4, 3, 5, 2, 6].flatMap((d) => [0, -1, 1, -2, -3].map((dy) => [dir * d, dy] as const));
      const torches: [number, number][] = [];
      for (const offsets of [side(-1), [...side(1), ...side(-1)]]) {
        const [tx, ty] = await placeableNear(page, px, row, 'fg', offsets);
        await holdOnTile(page, tx, ty, 'right', async () => (await tileAt(page, tx, ty)) === TORCH);
        torches.push([tx, ty]);
      }
      await page.mouse.move(VIEWPORT.width / 2, VIEWPORT.height / 5);
      await page.waitForTimeout(500);
      const [litX, litY] = torches[1] ?? [px, row];
      const lit = await lightAt(page, litX, litY);
      check(lit[1] > 100, `a torch should light the cave, got rgb ${lit.join(',')}`);
      const end = (await probe(page)) as GameProbe;
      check(
        end.lightAvgMs < 4,
        `light update averaged ${end.lightAvgMs.toFixed(2)} ms (budget 4 ms)`,
      );
      report.push(
        `cave torch light rgb ${lit.join(',')}; light update avg ${end.lightAvgMs.toFixed(2)} ms over ${end.lightUpdates} updates`,
      );
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
    query: `?scene=game&ui=0&${CAVE}`,
    prepare: waitForPlayerReady,
  },
  {
    name: 'game-run-and-jump',
    // Low quality: this checks chunk streaming, and software rendering keeps up there.
    query: '?scene=game&ui=0&quality=low',
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

// Art pipeline demo (M2b): fake AI images → import → autotiles → pack, into <dist>/packed-demo.
process.stdout.write(
  execFileSync(
    process.execPath,
    [
      resolve(root, 'node_modules/tsx/dist/cli.mjs'),
      'tools/demo-art.ts',
      resolve(root, DIST, 'packed-demo'),
    ],
    { cwd: root, encoding: 'utf8' },
  ),
);

const server = await preview({
  root,
  build: { outDir: DIST },
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
  // `SHOT_ONLY=name1,name2 npm run shot` reruns just those shots.
  const only = process.env.SHOT_ONLY?.split(',');
  for (const shot of SHOTS.filter((s) => !only || only.includes(s.name))) {
    const page = await browser.newPage({ viewport: shot.viewport ?? VIEWPORT });
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
