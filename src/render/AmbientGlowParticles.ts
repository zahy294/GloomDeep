import * as Phaser from 'phaser';
import { AMBIENT, SHAFTS, TILE_SIZE } from '../config';
import { PARTICLE_FRAME } from '../data/spriteAssets';
import type { World } from '../sim/world/World';
import { blendColor } from './biomeBlend';
import { Depth } from './depth';
import type { PlacedShaft } from './LightShafts';
import { makeRandom, ParticleSlot, shaftPoint, wantedCounts } from './glowMath';
import { spriteFrame } from './spriteFrames';
import type { VisualState } from './VisualState';

const KINDS = 5;
const MAX_DT = 0.05;
const TWO_PI = Math.PI * 2;

/** Frame of the particles sheet for each slot kind. */
const FRAME_INDEX = [
  PARTICLE_FRAME.mote,
  PARTICLE_FRAME.mote,
  PARTICLE_FRAME.firefly,
  PARTICLE_FRAME.spore,
  PARTICLE_FRAME.ember,
] as const;

/**
 * Motes and glowing particles (plan 2.0, 2.4) as one pooled set of additive sprites sharing the
 * particles sheet, updated in code: ambient motes, motes inside light shafts, fireflies, spores
 * and embers. Each kind owns a fixed slice of the pool; counts follow the blended biome data and
 * slots fade in and out as the wanted count changes.
 */
export class AmbientGlowParticles {
  private readonly start = new Int32Array(KINDS + 1);
  private readonly images: Phaser.GameObjects.Image[] = [];
  private readonly px: Float32Array;
  private readonly py: Float32Array;
  private readonly seedA: Float32Array;
  private readonly seedB: Float32Array;
  private readonly fade: Float32Array;
  private readonly wanted = new Float32Array(KINDS);
  private readonly point = { x: 0, y: 0 };
  private readonly random = makeRandom(0x61c88647);
  private lastMoteColor = -1;
  private world: World | null = null;

  /**
   * `density`: multiplier on every count (quality tier, already halved on Low);
   * `shaftMotes`: whether motes are emitted inside light shafts.
   */
  constructor(
    scene: Phaser.Scene,
    private readonly visual: VisualState,
    private readonly shafts: { readonly placed: readonly PlacedShaft[]; readonly count: number },
    private readonly density: number,
    private readonly shaftMotes: boolean,
    atlasKey: string,
    fallbackKey: string,
  ) {
    const cap = AMBIENT.capacity;
    const caps = [cap.mote, cap.shaftMote, cap.firefly, cap.spore, cap.ember];
    for (let k = 0; k < KINDS; k++) this.start[k + 1] = (this.start[k] ?? 0) + (caps[k] ?? 0);
    const total = this.start[KINDS] ?? 0;
    this.px = new Float32Array(total);
    this.py = new Float32Array(total);
    this.seedA = new Float32Array(total);
    this.seedB = new Float32Array(total);
    this.fade = new Float32Array(total);
    const atlas = scene.textures.get(atlasKey);
    for (let k = 0; k < KINDS; k++) {
      const name = spriteFrame('particles', FRAME_INDEX[k] ?? 0);
      const found = atlas.has(name);
      for (let i = this.start[k] ?? 0; i < (this.start[k + 1] ?? 0); i++) {
        const image = found
          ? scene.add.image(0, 0, atlasKey, name)
          : scene.add.image(0, 0, fallbackKey);
        image
          .setBlendMode(Phaser.BlendModes.ADD)
          .setDepth(Depth.glow + 0.5)
          .setVisible(false);
        this.images.push(image);
        this.seedA[i] = this.random() * TWO_PI;
        this.seedB[i] = this.random();
      }
    }
  }

  attach(world: World): void {
    this.world = world;
  }

  update(dt: number): void {
    const step = Math.min(dt, MAX_DT);
    const { visual } = this;
    wantedCounts(visual, this.density, this.wanted);
    this.wanted[ParticleSlot.shaftMote] = this.shaftMotes
      ? SHAFTS.motesPerShaft * this.shafts.count * this.density
      : 0;
    const moteColor = blendColor(visual.weights, (v) => v.motes.color);
    const recolor = moteColor !== this.lastMoteColor;
    this.lastMoteColor = moteColor;
    for (let k = 0; k < KINDS; k++) {
      const from = this.start[k] ?? 0;
      const to = this.start[k + 1] ?? 0;
      const want = Math.min(to - from, this.wanted[k] ?? 0);
      for (let i = from; i < to; i++) {
        const idx = i - from;
        const target = idx + 1 <= want ? 1 : idx < want ? want - idx : 0;
        const f = this.fade[i] ?? 0;
        if (f <= 0 && target <= 0) continue;
        const next =
          target > f
            ? Math.min(target, f + AMBIENT.fadeRate * step)
            : Math.max(target, f - AMBIENT.fadeRate * step);
        if (f <= 0 && next > 0) this.place(k, i);
        this.fade[i] = next;
        const image = this.images[i];
        if (!image) continue;
        if (next <= 0) {
          image.setVisible(false);
          continue;
        }
        const a = this.move(k, i, idx, step);
        if (a <= 0.01) {
          image.setVisible(false);
          continue;
        }
        if (recolor && k === ParticleSlot.mote) image.setTint(moteColor);
        image.setAlpha(a * next).setVisible(true);
      }
    }
  }

  /** Starting position and tint when a slot becomes active. */
  private place(kind: number, i: number): void {
    const { view } = this.visual;
    const m = AMBIENT.marginPx;
    this.px[i] = view.x - m + this.random() * (view.width + 2 * m);
    this.py[i] = view.y - m + this.random() * (view.height + 2 * m);
    const image = this.images[i];
    if (!image) return;
    switch (kind) {
      case ParticleSlot.mote:
        image.setTint(this.lastMoteColor);
        break;
      case ParticleSlot.shaftMote:
        image.setTint(SHAFTS.gold);
        break;
      case ParticleSlot.firefly:
        image.setTint(AMBIENT.firefly.tint);
        this.perchFirefly(i);
        break;
      case ParticleSlot.spore:
        image.setTint(AMBIENT.spore.tint);
        break;
      default:
        image.setTint(AMBIENT.ember.tint);
    }
  }

  private groundY(x: number): number | null {
    const world = this.world;
    if (!world) return null;
    const col = Math.floor(x / TILE_SIZE);
    if (col < 0 || col >= world.width) return null;
    return (world.skyline[col] ?? world.height) * TILE_SIZE;
  }

  /** Puts a firefly at a random height above the ground below it. */
  private perchFirefly(i: number): void {
    const c = AMBIENT.firefly;
    const { view } = this.visual;
    const ground = this.groundY(this.px[i] ?? 0);
    const onScreen = ground !== null && ground > view.y && ground < view.y + view.height + 64;
    const base = onScreen ? ground : view.y + view.height;
    const h =
      (c.minHeightTiles + this.random() * (c.maxHeightTiles - c.minHeightTiles)) * TILE_SIZE;
    this.py[i] = base - h;
  }

  /** Advances one active particle, places its sprite and returns its alpha (0 = hide). */
  private move(kind: number, i: number, idx: number, dt: number): number {
    const { visual } = this;
    const t = visual.realTime;
    const view = visual.view;
    const m = AMBIENT.marginPx;
    const sa = this.seedA[i] ?? 0;
    const sb = this.seedB[i] ?? 0;
    const wind = visual.wind * AMBIENT.windSpeed;
    let x = this.px[i] ?? 0;
    let y = this.py[i] ?? 0;
    let alpha: number;
    let scale: number;

    if (kind === ParticleSlot.shaftMote) {
      const count = this.shafts.count;
      const shaft = count > 0 ? this.shafts.placed[idx % count] : undefined;
      if (!shaft) return 0;
      // Slow fall down the beam, wrapping at the bottom; sideways wobble across it.
      const visiblePx = (shaft.tTo - shaft.tFrom) * shaft.lengthPx;
      const speed = SHAFTS.moteFallSpeed / Math.max(TILE_SIZE, visiblePx);
      const run = (((sb + t * speed) % 1) + 1) % 1;
      const along = shaft.tFrom + run * (shaft.tTo - shaft.tFrom);
      const across = Math.sin(t * 0.5 + sa * 3) * 0.8;
      shaftPoint(
        shaft.topX,
        shaft.topY,
        shaft.lengthPx,
        shaft.lean,
        shaft.widthPx,
        along,
        across,
        this.point,
      );
      const twinkle = 0.6 + 0.4 * Math.sin(t * 1.8 + sa);
      this.images[i]?.setPosition(this.point.x, this.point.y).setScale(SHAFTS.moteScale);
      return SHAFTS.moteAlpha * Math.sin(run * Math.PI) * twinkle * Math.min(1, shaft.alpha * 3);
    }

    if (kind === ParticleSlot.mote) {
      const c = AMBIENT.mote;
      x += (Math.sin(t * 0.3 + sa) * c.speed + wind * 0.5) * dt;
      y += (Math.cos(t * 0.23 + sa * 1.3) * 0.6 - 0.15) * c.speed * dt;
      alpha = c.alpha * (0.45 + 0.55 * Math.sin(t * c.twinkleSpeed + sa));
      scale = c.scale * (0.7 + 0.6 * sb);
    } else if (kind === ParticleSlot.firefly) {
      const c = AMBIENT.firefly;
      const a = sa + Math.sin(t * c.wanderSpeed + sb * 9) * 2.4;
      x += (Math.cos(a) * c.speed + wind * 0.3) * dt;
      y += Math.sin(a * 1.3) * c.speed * 0.5 * dt;
      const blink = Math.sin(t * c.blinkSpeed + sa * 2.1);
      alpha = c.alpha * (blink > 0 ? blink * blink : 0.05);
      scale = c.scale;
    } else if (kind === ParticleSlot.spore) {
      const c = AMBIENT.spore;
      y -= c.rise * (0.6 + 0.8 * sb) * dt;
      x += (Math.sin(t * c.swaySpeed + sa) * c.sway + wind * 0.4) * dt;
      alpha = c.alpha * (0.5 + 0.5 * Math.sin(t * 1.1 + sa * 1.7));
      scale = c.scale * (0.75 + 0.5 * sb);
    } else {
      const c = AMBIENT.ember;
      y -= c.rise * (0.6 + 0.8 * sb) * dt;
      x += (Math.sin(t * 1.3 + sa) * c.sway + wind) * dt;
      const flicker =
        0.25 * Math.sin(t * c.flickerSpeed + sa * 5) +
        0.2 * Math.sin(t * c.flickerSpeed * 2.3 + sa);
      alpha = c.alpha * (0.55 + flicker);
      scale = c.scale * (0.7 + 0.5 * sb);
    }

    // Wrap around the view so particles stay near the camera without respawn bookkeeping.
    const w = view.width + 2 * m;
    const h = view.height + 2 * m;
    const left = view.x - m;
    const top = view.y - m;
    const wrappedX = x < left || x >= left + w;
    x = left + ((((x - left) % w) + w) % w);
    y = top + ((((y - top) % h) + h) % h);
    this.px[i] = x;
    this.py[i] = y;
    if (kind === ParticleSlot.firefly) {
      if (wrappedX) this.perchFirefly(i);
      const ground = this.groundY(x);
      if (ground !== null) {
        const c = AMBIENT.firefly;
        const lo = ground - c.maxHeightTiles * TILE_SIZE;
        const hi = ground - c.minHeightTiles * TILE_SIZE;
        this.py[i] = Math.min(hi, Math.max(lo, this.py[i] ?? y));
      }
      y = this.py[i] ?? y;
    }
    this.images[i]?.setPosition(x, y).setScale(scale);
    return alpha;
  }
}
