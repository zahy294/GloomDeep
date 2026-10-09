import { LIGHT, TILE_SIZE } from '../../config';
import { lensByKey } from '../../data/lenses';
import { lightByKey, type LightDef } from '../../data/lights';
import { TILES } from '../../data/tiles';
import type { LightBackend, LightJob, LightResult } from '../../workers/lighting/lightJob';
import type { DaySample } from '../dayCycle';
import type { Player } from '../entities/Player';
import type { EventBus, SimEvents } from '../events';
import type { ActionState } from '../input';
import type { World } from '../world/World';
import { lanternLit } from './LanternSystem';

/** Where on the player the lantern's cone starts (px from the feet-centre, facing right). */
export const LANTERN_HAND = { x: 4, y: -18 } as const;
const LANTERN_GLOW = lightByKey('lantern_glow');
const PLAYER_AURA = lightByKey('player_aura');
/** Per tile id: the light of a glowing decoration (brightens when touched), else null. */
const TOUCH_LIGHT: readonly (LightDef | null)[] = TILES.map((t) =>
  t.decor && t.light ? lightByKey(t.light) : null,
);
const POINT_FLOATS = 6;

/** Sunlight colour and strength, 0–255 per channel. */
export type SunLight = Pick<DaySample, 'sunR' | 'sunG' | 'sunB'>;

interface Rect {
  x0: number;
  y0: number;
  width: number;
  height: number;
}

export interface LightStats {
  updates: number;
  /** Compute time of the last job and an exponential moving average (ms). */
  lastMs: number;
  avgMs: number;
}

/**
 * Keeps the light grid (world.lightR/G/B) up to date around the player's view (plan 2.3, rule 7:
 * lighting is gameplay data). At LIGHT.updateHz it gathers the region's tiles, the sunlight, the
 * lantern and other dynamic lights into a job for the backend (a Web Worker in the game, inline in
 * tests) and, when the result comes back, writes the inner part of the region into the world.
 * Only one job is in flight at a time.
 */
export class LightSystem {
  readonly stats: LightStats = { updates: 0, lastMs: 0, avgMs: 0 };
  private timer = Infinity; // first step submits immediately
  private inFlight = false;
  /** Seconds the current job has been waiting for its result. */
  private waited = 0;
  private nextId = 1;
  /** The inner (written-back) rectangle of the job in flight. */
  private pendingInner: Rect = { x0: 0, y0: 0, width: 0, height: 0 };
  /** Result buffers come back from the backend and are reused for the next job. */
  private spare: { r: Uint8Array; g: Uint8Array; b: Uint8Array } | null = null;
  private readonly updatedPayload = { x0: 0, y0: 0, width: 0, height: 0 };
  /** Glowing decorations the player touched recently: tile index → seconds of boost left. */
  private readonly touched = new Map<number, number>();

  constructor(
    private readonly world: World,
    private readonly events: EventBus<SimEvents>,
    private readonly backend: LightBackend,
  ) {}

  /** `day`: the sunlight to use (the day cycle after weather: overcast rain, lightning). */
  update(dt: number, time: number, day: SunLight, player: Player, input: ActionState): void {
    this.updateTouched(dt, player);
    this.timer += dt;
    if (this.inFlight) {
      this.waited += dt;
      if (this.waited < LIGHT.jobTimeoutSeconds) return;
      // The backend never answered (e.g. the worker died): drop the job and try again.
      this.inFlight = false;
    }
    if (this.timer < 1 / LIGHT.updateHz) return;
    this.timer = 0;
    this.submit(time, day, player, input);
  }

  private submit(time: number, day: SunLight, player: Player, input: ActionState): void {
    const { world } = this;
    const body = player.body;
    const feetX = body.x + body.width / 2;
    const feetY = body.y + body.height;
    const focusX = Number.isFinite(input.focusX) ? input.focusX : feetX;
    const focusY = Number.isFinite(input.focusY) ? input.focusY : feetY - body.height / 2;

    const inner = clampRect(
      {
        x0: Math.round(focusX / TILE_SIZE - LIGHT.innerWidth / 2),
        y0: Math.round(focusY / TILE_SIZE - LIGHT.innerHeight / 2),
        width: LIGHT.innerWidth,
        height: LIGHT.innerHeight,
      },
      world,
    );
    const region = clampRect(
      {
        x0: inner.x0 - LIGHT.margin,
        y0: inner.y0 - LIGHT.margin,
        width: inner.width + LIGHT.margin * 2,
        height: inner.height + LIGHT.margin * 2,
      },
      world,
    );
    const cells = region.width * region.height;

    const fg = new Uint16Array(cells);
    for (let y = 0; y < region.height; y++) {
      const from = (region.y0 + y) * world.width + region.x0;
      fg.set(world.fg.subarray(from, from + region.width), y * region.width);
    }
    const skyline = world.skyline.slice(region.x0, region.x0 + region.width);
    const canopyTop = world.canopyTop.slice(region.x0, region.x0 + region.width);
    const canopyShade = world.canopyShade.slice(region.x0, region.x0 + region.width);

    const lit = lanternLit(player);
    const handX = feetX + LANTERN_HAND.x * player.facing;
    const handY = feetY + LANTERN_HAND.y;
    const points = new Float32Array((2 + this.touched.size) * POINT_FLOATS);
    let p = 0;
    const addPoint = (x: number, y: number, color: readonly number[], radius: number) => {
      points.set([x, y, color[0] ?? 0, color[1] ?? 0, color[2] ?? 0, radius], p);
      p += POINT_FLOATS;
    };
    addPoint(
      feetX / TILE_SIZE,
      (feetY - body.height / 2) / TILE_SIZE,
      PLAYER_AURA.color,
      PLAYER_AURA.radius,
    );
    if (lit)
      addPoint(handX / TILE_SIZE, handY / TILE_SIZE, LANTERN_GLOW.color, LANTERN_GLOW.radius);
    for (const [index, left] of this.touched) {
      const light = TOUCH_LIGHT[world.fg[index] ?? 0];
      if (!light) continue;
      const boost = 1 + (LIGHT.touchRadiusBoost - 1) * (left / LIGHT.touchSeconds);
      const x = index % world.width;
      addPoint(x + 0.5, (index - x) / world.width + 0.5, light.color, light.radius * boost);
    }
    const lens = lensByKey(player.lens);
    const dx = input.aimX - handX;
    const dy = input.aimY - handY;
    const length = Math.hypot(dx, dy) || 1;

    const out =
      this.spare && this.spare.r.length >= cells
        ? this.spare
        : { r: new Uint8Array(cells), g: new Uint8Array(cells), b: new Uint8Array(cells) };
    this.spare = null;

    const job: LightJob = {
      id: this.nextId++,
      ...region,
      fg,
      skyline,
      canopyTop,
      canopyShade,
      sunR: day.sunR,
      sunG: day.sunG,
      sunB: day.sunB,
      points: points.subarray(0, p),
      cone: lit
        ? {
            x: handX / TILE_SIZE,
            y: handY / TILE_SIZE,
            dirX: dx / length,
            dirY: dy / length,
            range: lens.range,
            halfAngle: lens.halfAngle,
            r: lens.color[0],
            g: lens.color[1],
            b: lens.color[2],
          }
        : null,
      time,
      focusX: feetX / TILE_SIZE,
      focusY: (feetY - body.height / 2) / TILE_SIZE,
      outR: out.r,
      outG: out.g,
      outB: out.b,
    };
    this.pendingInner = inner;
    this.inFlight = true;
    this.waited = 0;
    this.backend.submit(job, (result) => this.receive(result));
  }

  /** Glowing plants the player's body overlaps brighten, then fade back over LIGHT.touchSeconds. */
  private updateTouched(dt: number, player: Player): void {
    for (const [index, left] of this.touched) {
      if (left <= dt) this.touched.delete(index);
      else this.touched.set(index, left - dt);
    }
    const { world } = this;
    const b = player.body;
    const tx1 = Math.floor((b.x + b.width - 1e-4) / TILE_SIZE);
    const ty1 = Math.floor((b.y + b.height - 1e-4) / TILE_SIZE);
    for (let ty = Math.floor(b.y / TILE_SIZE); ty <= ty1; ty++) {
      for (let tx = Math.floor(b.x / TILE_SIZE); tx <= tx1; tx++) {
        if (!world.inBounds(tx, ty)) continue;
        const index = ty * world.width + tx;
        if (TOUCH_LIGHT[world.fg[index] ?? 0]) this.touched.set(index, LIGHT.touchSeconds);
      }
    }
  }

  private receive(result: LightResult): void {
    if (!this.inFlight) return; // a late answer to an abandoned job
    this.inFlight = false;
    this.spare = { r: result.r, g: result.g, b: result.b };
    const { world } = this;
    // Only the inner part is trustworthy: the margin lacks light from beyond the region's edge.
    const inner = intersect(this.pendingInner, result);
    for (let y = inner.y0; y < inner.y0 + inner.height; y++) {
      const src = (y - result.y0) * result.width + (inner.x0 - result.x0);
      const dst = y * world.width + inner.x0;
      world.lightR.set(result.r.subarray(src, src + inner.width), dst);
      world.lightG.set(result.g.subarray(src, src + inner.width), dst);
      world.lightB.set(result.b.subarray(src, src + inner.width), dst);
    }
    this.stats.updates++;
    this.stats.lastMs = result.computeMs;
    this.stats.avgMs =
      this.stats.updates === 1 ? result.computeMs : this.stats.avgMs * 0.9 + result.computeMs * 0.1;
    Object.assign(this.updatedPayload, inner);
    this.events.emit('lightUpdated', this.updatedPayload);
  }
}

function clampRect(r: Rect, world: World): Rect {
  const x0 = Math.max(0, r.x0);
  const y0 = Math.max(0, r.y0);
  const x1 = Math.min(world.width, r.x0 + r.width);
  const y1 = Math.min(world.height, r.y0 + r.height);
  return { x0, y0, width: Math.max(0, x1 - x0), height: Math.max(0, y1 - y0) };
}

function intersect(a: Rect, b: Rect): Rect {
  const x0 = Math.max(a.x0, b.x0);
  const y0 = Math.max(a.y0, b.y0);
  const x1 = Math.min(a.x0 + a.width, b.x0 + b.width);
  const y1 = Math.min(a.y0 + a.height, b.y0 + b.height);
  return { x0, y0, width: Math.max(0, x1 - x0), height: Math.max(0, y1 - y0) };
}
