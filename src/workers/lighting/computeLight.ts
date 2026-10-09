import { LIGHT } from '../../config';
import { LIGHTS, lightByKey, type LightDef } from '../../data/lights';
import { TILES } from '../../data/tiles';
import { hash2 } from '../../sim/random';
import type { LightJob, LightResult } from './lightJob';

// Flicker is visual tuning, not gameplay: two sines (slow sway + fast shimmer) so fire does not
// look mechanical. Speeds are radians per second; the mix weights sum to 1 so the factor stays
// within [1 - flicker, 1].
const FLICKER_SLOW_SPEED = 5.3;
const FLICKER_FAST_SPEED = 13.7;
const FLICKER_SLOW_WEIGHT = 0.65;
const FLICKER_FAST_WEIGHT = 0.35;
const FLICKER_FAST_PHASE_SCALE = 5.1;
const TWO_PI = Math.PI * 2;
const RAY_STEP = 0.5;
const MAX_VALUE = 255;
const TILE_ID_COUNT = 65536;
const FLICKER_SEED = 0;
const PULSE_SEED = 0x9e37;

// Per-channel falloff tables. Water (M9) will dim red/green more than blue by changing only these
// three assignments.
// The bucket queue relies on every step losing light (a 0 falloff would re-queue into the bucket
// being walked and stall the spread), so falloffs must be at least 1.
if (LIGHT.airFalloff < 1 || LIGHT.solidFalloff < 1) throw new Error('LIGHT falloffs must be >= 1');
const fallR = new Uint8Array(TILE_ID_COUNT).fill(LIGHT.airFalloff);
const fallG = new Uint8Array(TILE_ID_COUNT).fill(LIGHT.airFalloff);
const fallB = new Uint8Array(TILE_ID_COUNT).fill(LIGHT.airFalloff);
const solidTile = new Uint8Array(TILE_ID_COUNT);
/** Index into LIGHTS per tile id, or -1. */
const tileLight = new Int16Array(TILE_ID_COUNT).fill(-1);
for (let id = 0; id < TILES.length; id++) {
  const def = TILES[id]!;
  if (def.solid) {
    solidTile[id] = 1;
    fallR[id] = LIGHT.solidFalloff;
    fallG[id] = LIGHT.solidFalloff;
    fallB[id] = LIGHT.solidFalloff;
  }
  if (def.lightFalloff !== undefined) {
    if (def.lightFalloff < 1) throw new Error(`Tile ${def.key}: lightFalloff must be >= 1`);
    fallR[id] = def.lightFalloff;
    fallG[id] = def.lightFalloff;
    fallB[id] = def.lightFalloff;
  }
  if (def.light) tileLight[id] = LIGHTS.indexOf(lightByKey(def.light));
}

// Scratch buffers, grown to the largest job seen and reused.
let capacity = 0;
let nodeCell = new Int32Array(0);
let nodeNext = new Int32Array(0);
const bucketHead = new Int32Array(MAX_VALUE + 1);

function ensureCapacity(cells: number): void {
  if (cells <= capacity) return;
  capacity = cells;
  // Each cell is queued once as an initial value and at most once per improving neighbour.
  nodeCell = new Int32Array(cells * 5);
  nodeNext = new Int32Array(cells * 5);
}

function clamp(v: number): number {
  return v < 0 ? 0 : v > MAX_VALUE ? MAX_VALUE : Math.round(v);
}

function seed(job: LightJob, i: number, r: number, g: number, b: number): void {
  const rr = clamp(r);
  const gg = clamp(g);
  const bb = clamp(b);
  if (rr > job.outR[i]!) job.outR[i] = rr;
  if (gg > job.outG[i]!) job.outG[i] = gg;
  if (bb > job.outB[i]!) job.outB[i] = bb;
}

/** Shared with the glow pass so halos flicker in step with the light they belong to. */
export function flickerFactor(flicker: number, time: number, x: number, y: number): number {
  if (flicker <= 0) return 1;
  const phase = hash2(x, y, FLICKER_SEED) * TWO_PI;
  const wave =
    FLICKER_SLOW_WEIGHT * Math.sin(time * FLICKER_SLOW_SPEED + phase) +
    FLICKER_FAST_WEIGHT * Math.sin(time * FLICKER_FAST_SPEED + phase * FLICKER_FAST_PHASE_SCALE);
  return 1 - flicker * (0.5 + 0.5 * wave);
}

/** Bioluminescent breathing in [1 - depth, 1], each tile at its own phase. */
export function pulseFactor(def: LightDef, time: number, x: number, y: number): number {
  if (!def.pulse) return 1;
  const phase = hash2(x, y, PULSE_SEED) * TWO_PI;
  const wave = Math.sin((time / def.pulse.period) * TWO_PI + phase);
  return 1 - def.pulse.depth * (0.5 + 0.5 * wave);
}

/** Full strength within `near` tiles of the player, fading to `min` at `far` (runes). */
export function proximityFactor(
  def: LightDef,
  x: number,
  y: number,
  focusX: number,
  focusY: number,
): number {
  const p = def.proximity;
  if (!p) return 1;
  const d = Math.hypot(x + 0.5 - focusX, y + 0.5 - focusY);
  const t = d <= p.near ? 1 : d >= p.far ? 0 : (p.far - d) / (p.far - p.near);
  return p.min + (1 - p.min) * t;
}

/**
 * Brightness of an emissive tile right now (flicker × pulse × proximity). Shared with the glow
 * pass so halos breathe, flicker and wake in step with the light they belong to.
 */
export function emissiveFactor(
  def: LightDef,
  time: number,
  x: number,
  y: number,
  focusX: number,
  focusY: number,
): number {
  return (
    flickerFactor(def.flicker, time, x, y) *
    pulseFactor(def, time, x, y) *
    proximityFactor(def, x, y, focusX, focusY)
  );
}

function seedSun(job: LightJob): void {
  const { width, height, y0, skyline, canopyTop, canopyShade } = job;
  if (job.sunR <= 0 && job.sunG <= 0 && job.sunB <= 0) return;
  for (let cx = 0; cx < width; cx++) {
    const rows = Math.min(height, skyline[cx]! - y0);
    const shadeFrom = canopyTop[cx]! - y0;
    const shade = canopyShade[cx]!;
    for (let cy = 0; cy < rows; cy++) {
      const s = cy < shadeFrom ? 1 : shade; // dappled light below a leaf canopy
      seed(job, cy * width + cx, job.sunR * s, job.sunG * s, job.sunB * s);
    }
  }
}

function seedTiles(job: LightJob): void {
  const { width, height, x0, y0, fg } = job;
  const n = width * height;
  for (let i = 0; i < n; i++) {
    const li = tileLight[fg[i]!]!;
    if (li < 0) continue;
    const def = LIGHTS[li]!;
    const cx = i % width;
    const cy = (i - cx) / width;
    const strength =
      Math.min(MAX_VALUE, def.radius * LIGHT.airFalloff) *
      emissiveFactor(def, job.time, x0 + cx, y0 + cy, job.focusX, job.focusY);
    seed(
      job,
      i,
      (def.color[0] * strength) / MAX_VALUE,
      (def.color[1] * strength) / MAX_VALUE,
      (def.color[2] * strength) / MAX_VALUE,
    );
  }
}

function seedPoints(job: LightJob): void {
  const { points, x0, y0, width, height } = job;
  for (let p = 0; p + 5 < points.length; p += 6) {
    const cx = Math.floor(points[p]!) - x0;
    const cy = Math.floor(points[p + 1]!) - y0;
    if (cx < 0 || cy < 0 || cx >= width || cy >= height) continue;
    const strength = Math.min(MAX_VALUE, points[p + 5]! * LIGHT.airFalloff);
    seed(
      job,
      cy * width + cx,
      (points[p + 2]! * strength) / MAX_VALUE,
      (points[p + 3]! * strength) / MAX_VALUE,
      (points[p + 4]! * strength) / MAX_VALUE,
    );
  }
}

/** Marches from the origin to the target cell centre; the target's own cell never blocks. */
function rayBlocked(
  job: LightJob,
  ox: number,
  oy: number,
  dx: number,
  dy: number,
  dist: number,
  targetX: number,
  targetY: number,
): boolean {
  const steps = Math.ceil(dist / RAY_STEP);
  for (let s = 1; s < steps; s++) {
    const t = s / steps;
    const cx = Math.floor(ox + dx * t) - job.x0;
    const cy = Math.floor(oy + dy * t) - job.y0;
    if (cx === targetX && cy === targetY) continue;
    if (cx < 0 || cy < 0 || cx >= job.width || cy >= job.height) continue;
    if (solidTile[job.fg[cy * job.width + cx]!]) return true;
  }
  return false;
}

function seedCone(job: LightJob): void {
  const cone = job.cone;
  if (!cone || cone.range <= 0) return;
  const { x0, y0, width, height } = job;
  const minX = Math.max(0, Math.floor(cone.x - cone.range) - x0);
  const maxX = Math.min(width - 1, Math.floor(cone.x + cone.range) - x0);
  const minY = Math.max(0, Math.floor(cone.y - cone.range) - y0);
  const maxY = Math.min(height - 1, Math.floor(cone.y + cone.range) - y0);
  const cosHalf = Math.cos(cone.halfAngle);
  for (let cy = minY; cy <= maxY; cy++) {
    for (let cx = minX; cx <= maxX; cx++) {
      const dx = x0 + cx + 0.5 - cone.x;
      const dy = y0 + cy + 0.5 - cone.y;
      const dist = Math.hypot(dx, dy);
      if (dist > cone.range) continue;
      if (dist > 1e-6 && (dx * cone.dirX + dy * cone.dirY) / dist < cosHalf) continue;
      if (dist > 0 && rayBlocked(job, cone.x, cone.y, dx, dy, dist, cx, cy)) continue;
      const k = 1 - dist / cone.range;
      seed(job, cy * width + cx, cone.r * k, cone.g * k, cone.b * k);
    }
  }
}

/**
 * Bucket-queue Dijkstra for one channel: cells settle in order of decreasing light, so the result
 * equals the max over all paths of (seed - summed falloff). Stale queue entries are skipped.
 */
function flood(out: Uint8Array, fall: Uint8Array, fg: Uint16Array, width: number, n: number): void {
  bucketHead.fill(-1);
  let nodes = 0;
  for (let i = 0; i < n; i++) {
    const v = out[i]!;
    if (v === 0) continue;
    nodeCell[nodes] = i;
    nodeNext[nodes] = bucketHead[v]!;
    bucketHead[v] = nodes++;
  }
  for (let v = MAX_VALUE; v > 0; v--) {
    let node = bucketHead[v]!;
    while (node >= 0) {
      const i = nodeCell[node]!;
      node = nodeNext[node]!;
      if (out[i] !== v) continue;
      const cx = i % width;
      for (let d = 0; d < 4; d++) {
        let j: number;
        if (d === 0) {
          if (cx === 0) continue;
          j = i - 1;
        } else if (d === 1) {
          if (cx === width - 1) continue;
          j = i + 1;
        } else if (d === 2) {
          j = i - width;
          if (j < 0) continue;
        } else {
          j = i + width;
          if (j >= n) continue;
        }
        const nv = v - fall[fg[j]!]!;
        if (nv > out[j]!) {
          out[j] = nv;
          nodeCell[nodes] = j;
          nodeNext[nodes] = bucketHead[nv]!;
          bucketHead[nv] = nodes++;
        }
      }
    }
  }
}

/** Fills the output buffers with the initial source values only (no spreading). */
export function seedLight(job: LightJob): void {
  const n = job.width * job.height;
  job.outR.fill(0, 0, n);
  job.outG.fill(0, 0, n);
  job.outB.fill(0, 0, n);
  seedSun(job);
  seedTiles(job);
  seedPoints(job);
  seedCone(job);
}

export function computeLight(job: LightJob): LightResult {
  const start = performance.now();
  const { width, height } = job;
  const n = width * height;
  ensureCapacity(n);
  seedLight(job);

  flood(job.outR, fallR, job.fg, width, n);
  flood(job.outG, fallG, job.fg, width, n);
  flood(job.outB, fallB, job.fg, width, n);

  return {
    id: job.id,
    x0: job.x0,
    y0: job.y0,
    width,
    height,
    r: job.outR,
    g: job.outG,
    b: job.outB,
    computeMs: performance.now() - start,
  };
}
