import { GLOAM, LENS_FX } from '../../config';
import { TILES } from '../../data/tiles';
import type { EventBus, SimEvents } from '../events';
import { hash2 } from '../random';
import { AIR, type World } from '../world/World';
import { inCone, type Cone } from './lanternCone';

/** A rectangle of tiles (absolute coordinates). */
export interface TileRect {
  x0: number;
  y0: number;
  width: number;
  height: number;
}

/** Solid blocks hold Gloam; so does a background wall with nothing solid in front. */
const SOLID = Uint8Array.from(TILES, (t) => (t.solid ? 1 : 0));
/** Placing one of these (a light source) burns the Gloam around it at once. */
const EMITS = Uint8Array.from(TILES, (t) => (t.light ? 1 : 0));
const MAX = 255;
const ROUNDING_SEED = 0x6c0a;

export function canHoldGloam(world: World, i: number): boolean {
  return SOLID[world.fg[i] ?? AIR] === 1 || (world.bg[i] ?? AIR) !== AIR;
}

/**
 * The Gloam (plan 1.4, plan 3.4 GloamSystem): a level 0–255 per cell (world.gloam) that creeps
 * through darkness and burns away in light. Rule 7: it reads the light grid, so it only changes
 * where the grid is current — the region the light system last wrote around the camera.
 *
 * Each tick, on a snapshot of the region:
 * - light ≥ GLOAM.cleanseLight: loses Gloam in proportion to the light (more in a Crimson cone);
 * - light ≤ GLOAM.darkLight: gains Gloam in proportion to the strongest Gloam on it or next to it,
 *   if that is at least GLOAM.spreadMin — so the Gloam grows where it is and creeps outwards.
 * Fractional changes are rounded up or down by a position/tick hash, so slow rates still move and
 * the result stays deterministic.
 */
export class GloamSystem {
  private timer = 0;
  private tick = 0;
  private scratch = new Uint8Array(0);
  private readonly updated: TileRect = { x0: 0, y0: 0, width: 0, height: 0 };
  private readonly unsubscribe: (() => void)[];

  constructor(
    private readonly world: World,
    private readonly events: EventBus<SimEvents>,
  ) {
    this.unsubscribe = [
      events.on('tileChanged', ({ x, y }) => {
        const i = world.index(x, y);
        if ((world.gloam[i] ?? 0) > 0 && !canHoldGloam(world, i)) {
          world.gloam[i] = 0;
          this.emit(x, y, 1, 1);
        }
      }),
      events.on('tilePlaced', ({ x, y, id, layer }) => {
        if (layer === 'fg' && EMITS[id] === 1) this.burst(x, y, GLOAM.burstRadius);
      }),
    ];
  }

  destroy(): void {
    for (const off of this.unsubscribe) off();
  }

  /**
   * `region`: where the light grid is current (null before the first light update).
   * `crimson`: the cone of a lit Crimson lens, or null.
   */
  update(dt: number, region: TileRect | null, crimson: Cone | null): void {
    this.timer += dt;
    const step = 1 / GLOAM.tickHz;
    if (this.timer < step || !region || region.width <= 0 || region.height <= 0) return;
    this.timer -= step;
    if (this.timer > step) this.timer = 0; // never queue up ticks after a stall
    this.tick++;
    this.run(region, step, crimson);
  }

  /** Burns Gloam in a circle at once (a light was placed): full strength at the centre. */
  burst(cx: number, cy: number, radius: number): void {
    const { world } = this;
    let changed = false;
    for (let y = cy - radius; y <= cy + radius; y++) {
      for (let x = cx - radius; x <= cx + radius; x++) {
        if (!world.inBounds(x, y)) continue;
        const d = Math.hypot(x - cx, y - cy);
        if (d > radius) continue;
        const i = world.index(x, y);
        const g = world.gloam[i] ?? 0;
        if (g === 0) continue;
        world.gloam[i] = Math.max(0, Math.round(g - GLOAM.burstStrength * (1 - d / radius)));
        changed = true;
      }
    }
    if (changed) this.emit(cx - radius, cy - radius, radius * 2 + 1, radius * 2 + 1);
  }

  private run(region: TileRect, dt: number, crimson: Cone | null): void {
    const { world } = this;
    const { x0, y0, width, height } = region;
    const W = world.width;
    const cells = width * height;
    if (this.scratch.length < cells) this.scratch = new Uint8Array(cells);
    const before = this.scratch;
    for (let y = 0; y < height; y++) {
      const from = (y0 + y) * W + x0;
      before.set(world.gloam.subarray(from, from + width), y * width);
    }
    const at = (x: number, y: number): number => {
      // Inside the region read the snapshot (no sweep-direction bias); outside, the world.
      if (x >= x0 && x < x0 + width && y >= y0 && y < y0 + height) {
        return before[(y - y0) * width + (x - x0)] ?? 0;
      }
      return world.inBounds(x, y) ? (world.gloam[y * W + x] ?? 0) : 0;
    };

    let changed = false;
    for (let y = y0; y < y0 + height; y++) {
      for (let x = x0; x < x0 + width; x++) {
        const i = y * W + x;
        const g = before[(y - y0) * width + (x - x0)] ?? 0;
        if (!canHoldGloam(world, i)) {
          if (g !== 0) {
            world.gloam[i] = 0;
            changed = true;
          }
          continue;
        }
        const light = Math.max(world.lightR[i] ?? 0, world.lightG[i] ?? 0, world.lightB[i] ?? 0);
        let delta: number;
        const burning = crimson !== null && light >= LENS_FX.coneMinLight && inCone(crimson, x, y);
        if (light >= GLOAM.cleanseLight || burning) {
          if (g === 0) continue;
          delta =
            -(GLOAM.cleansePerSecond * (light / MAX) + (burning ? GLOAM.crimsonBurnPerSecond : 0)) *
            dt;
        } else if (light <= GLOAM.darkLight) {
          const source = Math.max(g, at(x - 1, y), at(x + 1, y), at(x, y - 1), at(x, y + 1));
          if (source < GLOAM.spreadMin || g >= MAX) continue;
          delta = GLOAM.growPerSecond * (source / MAX) * dt;
        } else {
          continue;
        }
        const next = g + roundRandomly(delta, x, y, this.tick);
        const clamped = next < 0 ? 0 : next > MAX ? MAX : next;
        if (clamped !== g) {
          world.gloam[i] = clamped;
          changed = true;
        }
      }
    }
    if (changed) this.emit(x0, y0, width, height);
  }

  private emit(x0: number, y0: number, width: number, height: number): void {
    const u = this.updated;
    u.x0 = x0;
    u.y0 = y0;
    u.width = width;
    u.height = height;
    this.events.emit('gloamUpdated', u);
  }
}

/** Rounds to an integer, up with probability equal to the fraction (deterministic per cell/tick). */
function roundRandomly(value: number, x: number, y: number, tick: number): number {
  const whole = Math.floor(value);
  return whole + (hash2(x, y, ROUNDING_SEED + tick) < value - whole ? 1 : 0);
}
