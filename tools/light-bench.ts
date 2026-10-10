/**
 * Light-job benchmark (plan 2.10: "light update ≤ 4 ms"): runs the worker's `computeLight` on a
 * region the size the game uses (the view plus its border and margin) with more and more torches,
 * in open air at night, at noon, and in a cave, and reports the median and worst time per job.
 *
 *   npm run bench:light
 */
import { LIGHT } from '../src/config';
import { tileId } from '../src/data/tiles';
import { computeLight } from '../src/workers/lighting/computeLight';
import type { LightJob } from '../src/workers/lighting/lightJob';

const W = LIGHT.innerWidth + LIGHT.margin * 2;
const H = LIGHT.innerHeight + LIGHT.margin * 2;
const N = W * H;
const STONE = tileId('stone');
const TORCH = tileId('torch');
const WARMUP = 30;
const RUNS = 200;
const GROUND_ROW = Math.floor(H * 0.6);
/** Sunlight at or above this is daytime (labels only). */
const DAYLIGHT = 128;

type Terrain = 'open' | 'cave';

/** A region: open air over a stone floor, or solid stone with winding tunnels (a cave system). */
function terrain(kind: Terrain): Uint16Array {
  const fg = new Uint16Array(N);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (kind === 'open') fg[i] = y >= GROUND_ROW ? STONE : 0;
      else {
        const tunnel = Math.abs(Math.sin(x / 7) * 9 + Math.cos(y / 5) * 6) < 4 || y % 13 < 3;
        fg[i] = tunnel ? 0 : STONE;
      }
    }
  }
  return fg;
}

/** Puts a torch in every `spacing`-th open cell (row and column); returns how many. */
function placeTorches(fg: Uint16Array, spacing: number): number {
  if (spacing <= 0) return 0;
  let count = 0;
  for (let y = 0; y < H; y += spacing) {
    for (let x = 0; x < W; x += spacing) {
      const i = y * W + x;
      if (fg[i] !== 0) continue;
      fg[i] = TORCH;
      count++;
    }
  }
  return count;
}

function job(fg: Uint16Array, kind: Terrain, sun: number, time: number): LightJob {
  const skyline = new Int32Array(W).fill(kind === 'open' ? GROUND_ROW : 0);
  return {
    id: 1,
    x0: 0,
    y0: 0,
    width: W,
    height: H,
    fg,
    skyline,
    canopyTop: new Int32Array(W).fill(H),
    canopyShade: new Float32Array(W).fill(1),
    sunR: sun,
    sunG: sun,
    sunB: sun,
    // The player's own glow and a handful of moving lights (wisp, flares).
    points: Float32Array.from([W / 2, H / 2, 255, 196, 120, 5, 20, 20, 170, 230, 255, 5]),
    cone: {
      x: W / 2,
      y: H / 2,
      dirX: 1,
      dirY: 0,
      range: 14,
      halfAngle: 0.42,
      r: 255,
      g: 190,
      b: 110,
    },
    time,
    focusX: W / 2,
    focusY: H / 2,
    outR: new Uint8Array(N),
    outG: new Uint8Array(N),
    outB: new Uint8Array(N),
  };
}

function bench(kind: Terrain, sun: number, spacing: number): void {
  const fg = terrain(kind);
  const torches = placeTorches(fg, spacing);
  const times: number[] = [];
  for (let r = 0; r < WARMUP + RUNS; r++) {
    const ms = computeLight(job(fg, kind, sun, r / 30)).computeMs;
    if (r >= WARMUP) times.push(ms);
  }
  times.sort((a, b) => a - b);
  const median = times[Math.floor(times.length / 2)] ?? 0;
  const p95 = times[Math.floor(times.length * 0.95)] ?? 0;
  const worst = times[times.length - 1] ?? 0;
  const label = `${kind === 'open' ? (sun >= DAYLIGHT ? 'open, noon ' : 'open, night') : 'cave       '}`;
  console.log(
    `${label}  torches ${String(torches).padStart(5)}  median ${median.toFixed(2)} ms  ` +
      `p95 ${p95.toFixed(2)} ms  worst ${worst.toFixed(2)} ms`,
  );
}

console.log(`Region ${W}×${H} = ${N} cells (view + border + margin), ${RUNS} jobs each`);
for (const [kind, sun] of [
  ['open', 40],
  ['open', 255],
  ['cave', 0],
] as const) {
  // No torches, then sparse to every-other-cell.
  for (const spacing of [0, 12, 6, 4, 2]) bench(kind, sun, spacing);
}
