import * as Phaser from 'phaser';
import { AMBIENT, SHAFTS, TILE_SIZE } from '../config';
import { PARTICLE_FRAME } from '../data/spriteAssets';
import type { World } from '../sim/world/World';
import { blendColor, pickMoteColor } from './biomeBlend';
import { Depth } from './depth';
import type { PlacedShaft } from './LightShafts';
import { makeRandom, ParticleSlot, shaftPoint, wantedCounts } from './glowMath';
import { spriteFrame } from './spriteFrames';
import type { VisualState } from './VisualState';

const KINDS = 5;
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
  private readonly random = makeRandom(AMBIENT.seed);
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
    const step = Math.min(dt, AMBIENT.maxStepSeconds);
    const { visual } = this;
    wantedCounts(visual, this.density, this.wanted);
    this.wanted[ParticleSlot.shaftMote] = this.shaftMotes
      ? SHAFTS.motesPerShaft * this.shafts.count * this.density
      : 0;
    const moteColor = blendColor(visual.weights, pickMoteColor);
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
        if (a <= AMBIENT.minAlpha) {
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
    const onScreen =
      ground !== null && ground > view.y && ground < view.y + view.height + c.perchMarginPx;
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
      const g = AMBIENT.shaftMote;
      const across = Math.sin(t * g.swayRate + sa * g.swayPhase) * g.swayAmount;
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
      const twinkle = g.twinkleBase + g.twinkleDepth * Math.sin(t * g.twinkleSpeed + sa);
      this.images[i]?.setPosition(this.point.x, this.point.y).setScale(SHAFTS.moteScale);
      return (
        SHAFTS.moteAlpha *
        Math.sin(run * Math.PI) *
        twinkle *
        Math.min(1, shaft.alpha * g.beamAlphaGain)
      );
    }

    if (kind === ParticleSlot.mote) {
      const c = AMBIENT.mote;
      x += (Math.sin(t * c.weaveRate + sa) * c.speed + wind * c.windFactor) * dt;
      y += (Math.cos(t * c.bobRate + sa * c.bobPhase) * c.bobAmount - c.riseBias) * c.speed * dt;
      alpha = c.alpha * (c.twinkleBase + c.twinkleDepth * Math.sin(t * c.twinkleSpeed + sa));
      scale = c.scale * (c.scaleBase + c.scaleVar * sb);
    } else if (kind === ParticleSlot.firefly) {
      const c = AMBIENT.firefly;
      const a = sa + Math.sin(t * c.wanderSpeed + sb * c.wanderPhase) * c.wanderTurn;
      x += (Math.cos(a) * c.speed + wind * c.windFactor) * dt;
      y += Math.sin(a * c.verticalRate) * c.speed * c.verticalFactor * dt;
      const blink = Math.sin(t * c.blinkSpeed + sa * c.blinkPhase);
      alpha = c.alpha * (blink > 0 ? blink * blink : c.dimAlpha);
      scale = c.scale;
    } else if (kind === ParticleSlot.spore) {
      const c = AMBIENT.spore;
      y -= c.rise * (c.riseBase + c.riseVar * sb) * dt;
      x += (Math.sin(t * c.swaySpeed + sa) * c.sway + wind * c.windFactor) * dt;
      alpha =
        c.alpha *
        (c.twinkleBase + c.twinkleDepth * Math.sin(t * c.twinkleRate + sa * c.twinklePhase));
      scale = c.scale * (c.scaleBase + c.scaleVar * sb);
    } else {
      const c = AMBIENT.ember;
      y -= c.rise * (c.riseBase + c.riseVar * sb) * dt;
      x += (Math.sin(t * c.swayRate + sa) * c.sway + wind) * dt;
      const flicker =
        c.flickerDepth * Math.sin(t * c.flickerSpeed + sa * c.flickerPhase) +
        c.flickerDepth2 * Math.sin(t * c.flickerSpeed * c.flickerRatio + sa);
      alpha = c.alpha * (c.alphaBase + flicker);
      scale = c.scale * (c.scaleBase + c.scaleVar * sb);
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
