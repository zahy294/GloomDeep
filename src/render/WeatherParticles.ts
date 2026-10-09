import type * as Phaser from 'phaser';
import { TILE_SIZE, WEATHER_FX } from '../config';
import { PARTICLE_FRAME } from '../data/spriteAssets';
import { TILES } from '../data/tiles';
import type { World } from '../sim/world/World';
import { Depth } from './depth';
import { spriteFrame } from './spriteFrames';
import type { VisualState } from './VisualState';
import {
  particleTarget,
  rainDrift,
  rainFallSeconds,
  rainSpawnRange,
  rainTargetCount,
  streakRotation,
} from './weatherMath';

const Kind = { rain: 0, splash: 1, leaf: 2, petal: 3, drip: 4 } as const;
type KindId = (typeof Kind)[keyof typeof Kind];
const KIND_COUNT = 5;
const KINDS: readonly KindId[] = [Kind.rain, Kind.splash, Kind.leaf, Kind.petal, Kind.drip];
const KIND_FRAME: readonly number[] = [
  PARTICLE_FRAME.raindrop,
  PARTICLE_FRAME.raindrop,
  PARTICLE_FRAME.leaf,
  PARTICLE_FRAME.petal,
  PARTICLE_FRAME.raindrop,
];
const CAPS: readonly number[] = [
  WEATHER_FX.caps.rain,
  WEATHER_FX.caps.splash,
  WEATHER_FX.caps.leaf,
  WEATHER_FX.caps.petal,
  WEATHER_FX.caps.drip,
];
const TWO_PI = Math.PI * 2;
/** Leaf canopy tiles: not solid, but they stop most rain and drop leaves and drips. */
const CANOPY = Uint8Array.from(TILES, (t) => (t.sunTransmit !== undefined && !t.solid ? 1 : 0));

/**
 * Rain, splashes, drips from leaf canopies, falling leaves and petals (plan 2.0, 2.4), drawn in the
 * Game scene at the particle depth so the light map darkens them with the world. A fixed pool of
 * plain images (one texture, so one draw call) driven from typed arrays: drops die where they hit
 * a solid tile or a leaf canopy, which a Phaser emitter's per-particle callbacks would make no
 * cheaper. Purely visual; reads the world and `VisualState`, writes nothing back.
 */
export class WeatherParticles {
  private readonly images: Phaser.GameObjects.Image[] = [];
  private readonly start = new Int32Array(KIND_COUNT);
  private readonly alive: Uint8Array;
  private readonly x: Float32Array;
  private readonly y: Float32Array;
  private readonly vx: Float32Array;
  private readonly vy: Float32Array;
  private readonly age: Float32Array;
  private readonly life: Float32Array;
  /** Random 0..1 per particle: decides canopy stops, flutter phase, spin direction. */
  private readonly seed: Float32Array;
  private readonly liveCount = new Int32Array(KIND_COUNT);
  private readonly cursor = new Int32Array(KIND_COUNT);
  private readonly carry = new Float32Array(KIND_COUNT);
  private readonly range = { min: 0, max: 0 };
  private readonly cell = { x: 0, y: 0 };

  constructor(
    scene: Phaser.Scene,
    private readonly world: World,
    textureKey: string,
  ) {
    let total = 0;
    for (let k = 0; k < KIND_COUNT; k++) {
      this.start[k] = total;
      total += CAPS[k] ?? 0;
    }
    this.alive = new Uint8Array(total);
    this.x = new Float32Array(total);
    this.y = new Float32Array(total);
    this.vx = new Float32Array(total);
    this.vy = new Float32Array(total);
    this.age = new Float32Array(total);
    this.life = new Float32Array(total);
    this.seed = new Float32Array(total);
    for (let k = 0; k < KIND_COUNT; k++) {
      const frame = spriteFrame('particles', KIND_FRAME[k] ?? 0);
      for (let i = 0; i < (CAPS[k] ?? 0); i++) {
        this.images.push(
          scene.add.image(0, 0, textureKey, frame).setDepth(Depth.particles).setVisible(false),
        );
      }
    }
  }

  /** Particles alive per kind, for the debug overlay and tests. */
  get stats(): { rain: number; splash: number; leaf: number; petal: number; drip: number } {
    return {
      rain: this.liveCount[Kind.rain] ?? 0,
      splash: this.liveCount[Kind.splash] ?? 0,
      leaf: this.liveCount[Kind.leaf] ?? 0,
      petal: this.liveCount[Kind.petal] ?? 0,
      drip: this.liveCount[Kind.drip] ?? 0,
    };
  }

  update(dt: number, visual: VisualState): void {
    const density = visual.features.particleDensity;
    const raining = visual.rain > WEATHER_FX.rain.minIntensity && !visual.underwater;
    if (raining) {
      this.spawnRain(dt, visual, density);
      this.spawnDrips(dt, visual, density);
    }
    this.spawnDrifters(dt, visual, Kind.leaf, 'leaf', density);
    this.spawnDrifters(dt, visual, Kind.petal, 'petal', density);
    this.step(dt, visual);
  }

  destroy(): void {
    for (const image of this.images) image.destroy();
    this.images.length = 0;
  }

  // --- Spawning ----------------------------------------------------------------------------

  private spawnRain(dt: number, visual: VisualState, density: number): void {
    const { view, wind } = visual;
    const cfg = WEATHER_FX.rain;
    const target = rainTargetCount(visual.rain, visual.outdoors, density);
    const seconds = rainFallSeconds(view.height);
    this.carry[Kind.rain] = (this.carry[Kind.rain] ?? 0) + (target / seconds) * dt;
    const drift = rainDrift(wind);
    rainSpawnRange(view.x, view.width, drift, seconds, cfg.marginPx, this.range);
    const top = view.y - cfg.marginPx;
    while ((this.carry[Kind.rain] ?? 0) >= 1) {
      this.carry[Kind.rain]! -= 1;
      if ((this.liveCount[Kind.rain] ?? 0) >= target) continue;
      const x = this.range.min + Math.random() * (this.range.max - this.range.min);
      const seed = Math.random();
      if (this.skyBlocked(x, top, seed)) continue;
      const i = this.claim(Kind.rain);
      if (i < 0) return;
      const speed = 1 + (Math.random() * 2 - 1) * cfg.fallSpeedJitter;
      this.x[i] = x;
      this.y[i] = top + Math.random() * cfg.spawnJitterPx;
      this.vx[i] = drift * speed;
      this.vy[i] = cfg.fallSpeed * speed;
      this.seed[i] = seed;
      this.life[i] = Infinity;
      const image = this.images[i];
      if (image) {
        image.setScale(1, cfg.streakScale).setAlpha(cfg.alpha);
        image.rotation = streakRotation(this.vx[i] ?? 0, this.vy[i] ?? 1);
      }
    }
  }

  /** Whether a drop starting at (x, y) would be underground or under a canopy that stops it. */
  private skyBlocked(x: number, y: number, seed: number): boolean {
    const { world } = this;
    const tx = Math.floor(x / TILE_SIZE);
    if (tx < 0 || tx >= world.width) return true;
    if (y >= world.groundRow(tx) * TILE_SIZE) return true;
    const canopy = world.canopyTop[tx] ?? world.height;
    return y >= canopy * TILE_SIZE && seed < WEATHER_FX.rain.canopyStopChance;
  }

  /** Occasional drops letting go of leaf undersides while it rains. */
  private spawnDrips(dt: number, visual: VisualState, density: number): void {
    const cfg = WEATHER_FX.drip;
    const rate = cfg.perSecond * visual.rain * visual.outdoors * density;
    this.carry[Kind.drip] = (this.carry[Kind.drip] ?? 0) + rate * dt;
    while ((this.carry[Kind.drip] ?? 0) >= 1) {
      this.carry[Kind.drip]! -= 1;
      if (!this.pickCanopyUnderside(visual, 0)) continue;
      const i = this.claim(Kind.drip);
      if (i < 0) return;
      this.x[i] = (this.cell.x + cfg.xMin + Math.random() * cfg.xSpan) * TILE_SIZE;
      this.y[i] = (this.cell.y + 1) * TILE_SIZE;
      this.vx[i] = 0;
      this.vy[i] = 0;
      this.seed[i] = 0;
      this.life[i] = Infinity;
      const image = this.images[i];
      if (image) {
        image.setScale(1, 1).setAlpha(cfg.alpha);
        image.rotation = 0;
      }
    }
  }

  /** Leaves fall from leaf canopies; petals blow in across the top of the view. */
  private spawnDrifters(
    dt: number,
    visual: VisualState,
    kind: 2 | 3,
    rule: 'leaf' | 'petal',
    density: number,
  ): void {
    const cfg = kind === Kind.leaf ? WEATHER_FX.leaf : WEATHER_FX.petal;
    const target = Math.min(
      CAPS[kind] ?? 0,
      particleTarget(visual.weights, rule, visual) * density,
    );
    if ((this.liveCount[kind] ?? 0) >= target) return;
    // Steady trickle once full; a bigger deficit (arriving somewhere new) refills faster.
    const deficit = target - (this.liveCount[kind] ?? 0);
    const rate = Math.max(
      target / (cfg.lifeSeconds * WEATHER_FX.steadyLifeFraction),
      deficit / WEATHER_FX.fillSeconds,
    );
    this.carry[kind] = (this.carry[kind] ?? 0) + rate * dt;
    const { view } = visual;
    while ((this.carry[kind] ?? 0) >= 1) {
      this.carry[kind]! -= 1;
      if ((this.liveCount[kind] ?? 0) >= target) continue;
      let x: number;
      let y: number;
      if (kind === Kind.leaf) {
        if (this.pickCanopyUnderside(visual, WEATHER_FX.leaf.marginPx)) {
          x = (this.cell.x + Math.random()) * TILE_SIZE;
          y = (this.cell.y + 1) * TILE_SIZE;
        } else {
          // No canopy on screen: leaves still drift down from one high above (a giant tree).
          x = view.x + Math.random() * view.width;
          y = view.y - Math.random() * WEATHER_FX.leaf.marginPx * WEATHER_FX.leaf.highSpawnFraction;
          if (!this.canopyOverhead(x, view.y)) continue;
        }
      } else {
        x = view.x + Math.random() * view.width;
        y =
          view.y -
          WEATHER_FX.petal.spawnAbovePx +
          Math.random() * view.height * WEATHER_FX.petal.spawnBandFraction;
      }
      const i = this.claim(kind);
      if (i < 0) return;
      this.x[i] = x;
      this.y[i] = y;
      this.vx[i] = 0;
      this.vy[i] = cfg.fallSpeed * (1 + (Math.random() * 2 - 1) * cfg.fallSpeedJitter);
      this.seed[i] = Math.random();
      this.life[i] =
        cfg.lifeSeconds * (WEATHER_FX.lifeScale.min + Math.random() * WEATHER_FX.lifeScale.spread);
      this.images[i]?.setScale(1, 1);
    }
  }

  /** Whether column x has leaf canopy above row `y` (px) with open air between it and `y`. */
  private canopyOverhead(x: number, y: number): boolean {
    const { world } = this;
    const tx = Math.floor(x / TILE_SIZE);
    if (tx < 0 || tx >= world.width) return false;
    const canopy = world.canopyTop[tx] ?? world.height;
    return canopy < world.height && canopy * TILE_SIZE < y && y < world.groundRow(tx) * TILE_SIZE;
  }

  /**
   * Finds a random leaf-canopy tile near the view with open air under it (written to `cell`).
   * A few random probes per call keeps it cheap; canopies are common where leaves are wanted.
   */
  private pickCanopyUnderside(visual: VisualState, marginPx: number): boolean {
    const { world } = this;
    const { view } = visual;
    const x0 = Math.floor((view.x - marginPx) / TILE_SIZE);
    const y0 = Math.floor((view.y - marginPx) / TILE_SIZE);
    const w = Math.ceil((view.width + 2 * marginPx) / TILE_SIZE);
    const h = Math.ceil((view.height + 2 * marginPx) / TILE_SIZE);
    for (let n = 0; n < WEATHER_FX.drip.probes; n++) {
      const tx = x0 + Math.floor(Math.random() * w);
      const ty = y0 + Math.floor(Math.random() * h);
      if (!world.inBounds(tx, ty + 1)) continue;
      if (CANOPY[world.get(tx, ty)] !== 1) continue;
      if (world.isSolid(tx, ty + 1) || CANOPY[world.get(tx, ty + 1)] === 1) continue;
      this.cell.x = tx;
      this.cell.y = ty;
      return true;
    }
    return false;
  }

  /** A free slot of `kind`, marked alive; −1 when the kind's pool is full. */
  private claim(kind: KindId): number {
    const size = CAPS[kind] ?? 0;
    const base = this.start[kind] ?? 0;
    for (let n = 0; n < size; n++) {
      const slot = base + (((this.cursor[kind] ?? 0) + n) % size);
      if (this.alive[slot] === 1) continue;
      this.cursor[kind] = (slot - base + 1) % size;
      this.alive[slot] = 1;
      this.age[slot] = 0;
      this.liveCount[kind]!++;
      const image = this.images[slot];
      if (image) image.visible = true;
      return slot;
    }
    return -1;
  }

  private kill(i: number, kind: KindId): void {
    this.alive[i] = 0;
    this.liveCount[kind]!--;
    const image = this.images[i];
    if (image) image.visible = false;
  }

  // --- Simulation of the particles ---------------------------------------------------------

  private step(dt: number, visual: VisualState): void {
    const { view, wind } = visual;
    for (const kind of KINDS) {
      if ((this.liveCount[kind] ?? 0) === 0) continue;
      const base = this.start[kind] ?? 0;
      const end = base + (CAPS[kind] ?? 0);
      for (let i = base; i < end; i++) {
        if (this.alive[i] !== 1) continue;
        this.stepOne(i, kind, dt, wind, view);
      }
    }
  }

  private stepOne(
    i: number,
    kind: KindId,
    dt: number,
    wind: number,
    view: { x: number; y: number; width: number; height: number },
  ): void {
    const { world } = this;
    const age = (this.age[i] ?? 0) + dt;
    this.age[i] = age;
    let x = this.x[i] ?? 0;
    let y = this.y[i] ?? 0;
    const image = this.images[i];
    const far = WEATHER_FX.farMarginFactor;
    const margin =
      kind === Kind.leaf || kind === Kind.petal
        ? WEATHER_FX.leaf.marginPx
        : WEATHER_FX.rain.marginPx;

    switch (kind) {
      case Kind.rain:
      case Kind.drip: {
        if (kind === Kind.drip) this.vy[i] = (this.vy[i] ?? 0) + WEATHER_FX.drip.gravity * dt;
        x += (this.vx[i] ?? 0) * dt;
        y += (this.vy[i] ?? 0) * dt;
        const tx = Math.floor(x / TILE_SIZE);
        const ty = Math.floor(y / TILE_SIZE);
        if (world.inBounds(tx, ty)) {
          const solid = world.isSolid(tx, ty);
          const leaf =
            CANOPY[world.get(tx, ty)] === 1 &&
            (kind === Kind.drip || (this.seed[i] ?? 1) < WEATHER_FX.rain.canopyStopChance);
          if (solid || leaf) {
            // Splash on top surfaces only; a drop clipping a wall's side just disappears.
            const above = world.isSolid(tx, ty - 1) || CANOPY[world.get(tx, ty - 1)] === 1;
            if (!above) this.splash(x, ty * TILE_SIZE - WEATHER_FX.splash.surfaceLiftPx);
            this.kill(i, kind);
            return;
          }
        }
        if (
          y > view.y + view.height + margin ||
          x < view.x - margin * far ||
          x > view.x + view.width + margin * far
        ) {
          this.kill(i, kind);
          return;
        }
        break;
      }
      case Kind.splash: {
        const cfg = WEATHER_FX.splash;
        this.vy[i] = (this.vy[i] ?? 0) + cfg.gravity * dt;
        x += (this.vx[i] ?? 0) * dt;
        y += (this.vy[i] ?? 0) * dt;
        const t = age / cfg.lifeSeconds;
        if (t >= 1) {
          this.kill(i, kind);
          return;
        }
        if (image) image.alpha = WEATHER_FX.rain.alpha * (1 - t);
        break;
      }
      default: {
        const cfg = kind === Kind.leaf ? WEATHER_FX.leaf : WEATHER_FX.petal;
        const seed = this.seed[i] ?? 0;
        const flutter = Math.sin(age * TWO_PI * cfg.flutterHz + seed * TWO_PI) * cfg.flutterSpeed;
        x += (wind * cfg.windDrift + flutter) * dt;
        y += (this.vy[i] ?? 0) * dt;
        const life = this.life[i] ?? 0;
        const tx = Math.floor(x / TILE_SIZE);
        const ty = Math.floor(y / TILE_SIZE);
        if (
          age >= life ||
          world.isSolid(tx, ty) ||
          y > view.y + view.height + margin ||
          y < view.y - margin * far ||
          x < view.x - margin ||
          x > view.x + view.width + margin
        ) {
          this.kill(i, kind);
          return;
        }
        if (image) {
          image.alpha =
            cfg.alpha * Math.min(1, age / cfg.fadeSeconds, (life - age) / cfg.fadeSeconds);
          image.rotation = seed * TWO_PI + age * cfg.spinPerSecond * (seed < 0.5 ? -1 : 1);
        }
        break;
      }
    }

    this.x[i] = x;
    this.y[i] = y;
    if (image) {
      image.x = x;
      image.y = y;
    }
  }

  private splash(x: number, y: number): void {
    const cfg = WEATHER_FX.splash;
    if (Math.random() >= cfg.chance) return;
    for (let n = 0; n < cfg.count; n++) {
      const i = this.claim(Kind.splash);
      if (i < 0) return;
      this.x[i] = x;
      this.y[i] = y;
      this.vx[i] = (Math.random() * 2 - 1) * cfg.speedX;
      this.vy[i] =
        -cfg.speedUp * (WEATHER_FX.lifeScale.min + Math.random() * WEATHER_FX.lifeScale.spread);
      this.life[i] = cfg.lifeSeconds;
      const image = this.images[i];
      if (image) {
        image.setScale(cfg.scale).setAlpha(WEATHER_FX.rain.alpha);
        image.rotation = 0;
        image.x = x;
        image.y = y;
      }
    }
  }
}
