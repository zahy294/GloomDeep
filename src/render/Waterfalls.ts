import type * as Phaser from 'phaser';
import { TILE_SIZE, WATER_FX } from '../config';
import { PALETTE } from '../data/palette';
import { tileId, TILES } from '../data/tiles';
import type { EventBus, SimEvents } from '../sim/events';
import type { World } from '../sim/world/World';
import { Depth } from './depth';

const FX = WATER_FX.waterfall;
const WATERFALL = tileId('waterfall');
const IS_WATERFALL = Uint8Array.from(TILES, (t) => (t.waterfall ? 1 : 0));
/** Tiles scanned beyond the view, so a fall entering the screen is already set up. */
const SCAN_MARGIN = 2;
const RUN_FIELDS = 3;
const SPRAY_TINT = PALETTE.cyan[3];
const MIST_TINT = PALETTE.mint[3];
/** Spray leaves the landing within this many pixels of the column's centre. */
const SPRAY_SPREAD_PX = 5;
/** Spray fans upward: Phaser angles are degrees, 270 is straight up. */
const SPRAY_ANGLE = { min: 235, max: 305 } as const;

/**
 * Falling-water columns (plan 2.7). Worldgen marks them with `waterfall` tiles; this finds the
 * runs inside the view, draws each as a scrolling tile sprite and emits spray and a little mist
 * where it lands. Rescans only when the view crosses a tile or a waterfall tile changes.
 */
export class Waterfalls {
  private readonly strips: Phaser.GameObjects.TileSprite[] = [];
  private readonly spray: Phaser.GameObjects.Particles.ParticleEmitter;
  private readonly mist: Phaser.GameObjects.Particles.ParticleEmitter;
  /** Per visible run: column, first row, last row. */
  private readonly runs = new Int32Array(FX.maxVisible * RUN_FIELDS);
  private readonly sprayCarry = new Float32Array(FX.maxVisible);
  private readonly mistCarry = new Float32Array(FX.maxVisible);
  private runCount = 0;
  private scanKey = -1;
  private dirty = true;
  private scroll = 0;
  private readonly unsubscribe: () => void;

  constructor(
    scene: Phaser.Scene,
    private readonly world: World,
    events: EventBus<SimEvents>,
    textureKey: string,
    sprayKey: string,
    mistKey: string,
  ) {
    for (let i = 0; i < FX.maxVisible; i++) {
      this.strips.push(
        scene.add
          .tileSprite(0, 0, TILE_SIZE, TILE_SIZE, textureKey)
          .setAlpha(FX.alpha)
          .setDepth(Depth.waterfalls)
          .setVisible(false),
      );
    }
    this.spray = scene.add
      .particles(0, 0, sprayKey, {
        emitting: false,
        lifespan: FX.sprayLifespanMs,
        speed: { min: FX.spraySpeedMin, max: FX.spraySpeedMax },
        angle: SPRAY_ANGLE,
        gravityY: FX.sprayGravity,
        alpha: { start: FX.sprayAlpha, end: 0 },
        tint: SPRAY_TINT,
        maxParticles: FX.maxParticles,
      })
      .setDepth(Depth.particles);
    this.mist = scene.add
      .particles(0, 0, mistKey, {
        emitting: false,
        lifespan: FX.mistLifespanMs,
        speedX: { min: -FX.mistSpeedX, max: FX.mistSpeedX },
        speedY: { min: -FX.mistRiseMax, max: -FX.mistRiseMin },
        scale: { start: FX.mistScale, end: FX.mistScale * FX.mistGrowth },
        alpha: { start: FX.mistAlpha, end: 0 },
        tint: MIST_TINT,
        maxParticles: FX.maxParticles,
      })
      .setDepth(Depth.particles);
    this.unsubscribe = events.on('tileChanged', (e) => {
      if (e.layer === 'fg' && (IS_WATERFALL[e.id] === 1 || IS_WATERFALL[e.previous] === 1)) {
        this.dirty = true;
      }
    });
  }

  /** `density` scales the spray and mist (the quality setting). */
  update(
    view: { x: number; y: number; width: number; height: number },
    dt: number,
    density: number,
  ): void {
    this.rescan(view);
    this.scroll = (this.scroll + FX.fallSpeed * dt) % TILE_SIZE;
    for (let i = 0; i < FX.maxVisible; i++) {
      const strip = this.strips[i];
      if (!strip) continue;
      if (i >= this.runCount) {
        strip.setVisible(false);
        continue;
      }
      const column = this.runs[i * RUN_FIELDS] ?? 0;
      const top = this.runs[i * RUN_FIELDS + 1] ?? 0;
      const bottom = this.runs[i * RUN_FIELDS + 2] ?? 0;
      const height = (bottom - top + 1) * TILE_SIZE;
      strip
        .setPosition((column + 0.5) * TILE_SIZE, top * TILE_SIZE + height / 2)
        .setSize(TILE_SIZE, height)
        .setVisible(true);
      // Whole pixels keep the streaks crisp; a texture moving down means the offset shrinks.
      strip.tilePositionY = -Math.floor(this.scroll);
      this.emitAtLanding(i, column, (bottom + 1) * TILE_SIZE, dt, density);
    }
  }

  destroy(): void {
    this.unsubscribe();
    for (const strip of this.strips) strip.destroy();
    this.spray.destroy();
    this.mist.destroy();
  }

  private emitAtLanding(
    slot: number,
    column: number,
    y: number,
    dt: number,
    density: number,
  ): void {
    const x = (column + 0.5) * TILE_SIZE;
    const sprayN = this.take(this.sprayCarry, slot, FX.sprayPerSecond * density * dt);
    for (let n = 0; n < sprayN; n++) {
      this.spray.emitParticleAt(
        x + (Math.random() * 2 - 1) * SPRAY_SPREAD_PX,
        y - FX.sprayLiftPx,
        1,
      );
    }
    const mistN = this.take(this.mistCarry, slot, FX.mistPerSecond * density * dt);
    for (let n = 0; n < mistN; n++) {
      this.mist.emitParticleAt(x + (Math.random() * 2 - 1) * SPRAY_SPREAD_PX, y - FX.mistLiftPx, 1);
    }
  }

  /** Whole particles due now, keeping the fraction for the next frame. */
  private take(carry: Float32Array, slot: number, amount: number): number {
    const total = (carry[slot] ?? 0) + amount;
    const whole = Math.floor(total);
    carry[slot] = total - whole;
    return whole;
  }

  /** Finds the falls in view when the view's tile rectangle (or a fall tile) changed. */
  private rescan(view: { x: number; y: number; width: number; height: number }): void {
    const { world } = this;
    const x0 = Math.max(0, Math.floor(view.x / TILE_SIZE) - SCAN_MARGIN);
    const y0 = Math.max(0, Math.floor(view.y / TILE_SIZE) - SCAN_MARGIN);
    const x1 = Math.min(
      world.width - 1,
      Math.floor((view.x + view.width) / TILE_SIZE) + SCAN_MARGIN,
    );
    const y1 = Math.min(
      world.height - 1,
      Math.floor((view.y + view.height) / TILE_SIZE) + SCAN_MARGIN,
    );
    const key = ((x0 * 73856093) ^ (y0 * 19349663) ^ (x1 * 83492791) ^ (y1 * 2654435761)) | 0;
    if (!this.dirty && key === this.scanKey) return;
    this.dirty = false;
    this.scanKey = key;
    this.runCount = 0;
    for (let x = x0; x <= x1 && this.runCount < FX.maxVisible; x++) {
      for (let y = y0; y <= y1; y++) {
        if (world.get(x, y) !== WATERFALL) continue;
        let top = y;
        while (top > 0 && world.get(x, top - 1) === WATERFALL) top--;
        let bottom = y;
        while (bottom < world.height - 1 && world.get(x, bottom + 1) === WATERFALL) bottom++;
        const at = this.runCount * RUN_FIELDS;
        this.runs[at] = x;
        this.runs[at + 1] = top;
        this.runs[at + 2] = bottom;
        this.runCount++;
        break; // one fall per column
      }
    }
  }
}
