import * as Phaser from 'phaser';
import { TILE_SIZE, TOWN_VIEW } from '../config';
import { PALETTE } from '../data/palette';
import { PARTICLE_FRAME } from '../data/spriteAssets';
import type { Simulation } from '../sim/Simulation';
import type { Town } from '../sim/systems/TownSystem';
import { Depth } from './depth';
import { TextureKey } from './scenes/keys';
import { spriteFrame } from './spriteFrames';

/** The visible world rectangle in pixels. */
export interface ViewRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const CARAVAN_SHEET = 'caravan';
const PARTICLE_SHEET = 'particles';
/** Firework colours: the light tone of each ramp. */
const FIREWORK_COLORS: readonly number[] = [
  PALETTE.gold[3],
  PALETTE.rose[3],
  PALETTE.cyan[3],
  PALETTE.mint[3],
  PALETTE.ember[3],
];

interface Lantern {
  image: Phaser.GameObjects.Image;
  halo: Phaser.GameObjects.Image;
  active: boolean;
  x: number;
  y: number;
  age: number;
  life: number;
  rise: number;
  phase: number;
}

interface Spark {
  image: Phaser.GameObjects.Image;
  halo: Phaser.GameObjects.Image;
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  color: number;
}

interface Flash {
  halo: Phaser.GameObjects.Image;
  x: number;
  y: number;
  age: number;
  color: number;
  active: boolean;
}

const FLASH_POOL = 4;

function between(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

/**
 * M11 towns on screen: caravans on lit roads (a walking sprite with a lantern halo), the glint of
 * a quest's lost thing, and festival sky lanterns and fireworks. Everything is pooled and lazily
 * created; a town only spawns festival effects while its rectangle is near the view.
 */
export class TownRenderer {
  private readonly caravans: Phaser.GameObjects.Image[] = [];
  private readonly caravanHalos: Phaser.GameObjects.Image[] = [];
  private readonly glint: Phaser.GameObjects.Image;
  private readonly glintHalo: Phaser.GameObjects.Image;
  private readonly lanterns: Lantern[] = [];
  private readonly sparks: Spark[] = [];
  private readonly flashes: Flash[] = [];
  /** Per town: seconds until the next lantern / firework (parallel to sim.towns.towns). */
  private readonly lanternTimer: number[] = [];
  private readonly fireworkTimer: number[] = [];

  constructor(
    readonly scene: Phaser.Scene,
    readonly glowScene: Phaser.Scene,
    readonly sim: Simulation,
  ) {
    this.glint = scene.add
      .image(0, 0, TextureKey.sprites, spriteFrame(PARTICLE_SHEET, PARTICLE_FRAME.spark))
      .setDepth(Depth.selfLit)
      .setVisible(false);
    this.glintHalo = this.makeHalo(TOWN_VIEW.glintColor);
    for (let i = 0; i < TOWN_VIEW.lanternMax; i++) {
      this.lanterns.push({
        image: scene.add
          .image(0, 0, TextureKey.sprites, spriteFrame(PARTICLE_SHEET, PARTICLE_FRAME.skyLantern))
          .setDepth(Depth.selfLit)
          .setVisible(false),
        halo: this.makeHalo(TOWN_VIEW.lanternColor),
        active: false,
        x: 0,
        y: 0,
        age: 0,
        life: 1,
        rise: 0,
        phase: 0,
      });
    }
    for (let i = 0; i < TOWN_VIEW.sparkMax; i++) {
      this.sparks.push({
        image: scene.add
          .image(0, 0, TextureKey.sprites, spriteFrame(PARTICLE_SHEET, PARTICLE_FRAME.spark))
          .setDepth(Depth.selfLit)
          .setVisible(false),
        halo: this.makeHalo(0xffffff),
        active: false,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        age: 0,
        color: 0xffffff,
      });
    }
    for (let i = 0; i < FLASH_POOL; i++) {
      this.flashes.push({
        halo: this.makeHalo(0xffffff),
        x: 0,
        y: 0,
        age: 0,
        color: 0xffffff,
        active: false,
      });
    }
  }

  update(alpha: number, dt: number, time: number, view: ViewRect): void {
    this.drawCaravans(alpha, time);
    this.drawGlint(time);
    this.updateFestivals(dt, view);
    this.stepLanterns(dt);
    this.stepSparks(dt);
    this.stepFlashes(dt);
  }

  destroy(): void {
    const all: Phaser.GameObjects.Image[] = [
      ...this.caravans,
      ...this.caravanHalos,
      this.glint,
      this.glintHalo,
    ];
    for (const l of this.lanterns) all.push(l.image, l.halo);
    for (const s of this.sparks) all.push(s.image, s.halo);
    for (const f of this.flashes) all.push(f.halo);
    for (const image of all) image.destroy();
    this.caravans.length = 0;
    this.caravanHalos.length = 0;
    this.lanterns.length = 0;
    this.sparks.length = 0;
    this.flashes.length = 0;
  }

  private makeHalo(tint: number): Phaser.GameObjects.Image {
    return this.glowScene.add
      .image(0, 0, TextureKey.glow)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(tint)
      .setVisible(false);
  }

  private drawCaravans(alpha: number, time: number): void {
    const roads = this.sim.roads.roads;
    while (this.caravans.length < roads.length) {
      this.caravans.push(
        this.scene.add
          .image(0, 0, TextureKey.sprites, spriteFrame(CARAVAN_SHEET, 0))
          .setOrigin(0.5, 1)
          .setDepth(Depth.entities)
          .setVisible(false),
      );
      this.caravanHalos.push(this.makeHalo(TOWN_VIEW.caravanHaloColor));
    }
    for (let i = 0; i < this.caravans.length; i++) {
      const image = this.caravans[i];
      const halo = this.caravanHalos[i];
      if (!image || !halo) continue;
      const c = roads[i]?.caravan;
      if (!c) {
        image.setVisible(false);
        halo.setVisible(false);
        continue;
      }
      const x = Math.round(c.prevX + (c.x - c.prevX) * alpha);
      const y = Math.round(c.prevY + (c.y - c.prevY) * alpha);
      const frame = c.rest > 0 ? 0 : Math.floor(time * TOWN_VIEW.caravanFrameRate) % 2;
      image
        .setFrame(spriteFrame(CARAVAN_SHEET, frame))
        .setPosition(x, y)
        .setFlipX(c.dir < 0)
        .setVisible(true);
      const flicker =
        1 + TOWN_VIEW.caravanFlicker * Math.sin(time * TOWN_VIEW.caravanFlickerRate + i);
      const lanternX = x + c.dir * TOWN_VIEW.caravanLanternX;
      halo
        .setPosition(lanternX, y - TOWN_VIEW.caravanLanternY)
        .setDisplaySize(TOWN_VIEW.caravanHaloPx * flicker, TOWN_VIEW.caravanHaloPx * flicker)
        .setAlpha(TOWN_VIEW.caravanHaloAlpha)
        .setVisible(true);
    }
  }

  private drawGlint(time: number): void {
    const lost = this.sim.quests.lostThing();
    if (!lost) {
      this.glint.setVisible(false);
      this.glintHalo.setVisible(false);
      return;
    }
    const x = (lost.x + 0.5) * TILE_SIZE;
    const y = (lost.y + 0.5) * TILE_SIZE;
    // Twinkle: a sharp pulse once per period, with a gentle floor so it never fully vanishes.
    const phase = (time % TOWN_VIEW.glintPeriod) / TOWN_VIEW.glintPeriod;
    const twinkle = Math.pow(0.5 + 0.5 * Math.sin(phase * Math.PI * 2), 3);
    this.glint
      .setPosition(x, y)
      .setDisplaySize(TOWN_VIEW.glintPx * (0.5 + twinkle), TOWN_VIEW.glintPx * (0.5 + twinkle))
      .setAlpha(0.3 + 0.7 * twinkle)
      .setVisible(true);
    this.glintHalo
      .setPosition(x, y)
      .setDisplaySize(TOWN_VIEW.glintHaloPx, TOWN_VIEW.glintHaloPx)
      .setAlpha(TOWN_VIEW.glintHaloAlpha * (0.3 + 0.7 * twinkle))
      .setVisible(true);
  }

  private updateFestivals(dt: number, view: ViewRect): void {
    const towns = this.sim.towns.towns;
    const m = TOWN_VIEW.festivalMarginPx;
    for (let i = 0; i < towns.length; i++) {
      const town = towns[i];
      if (!town || town.festivalPhase !== 'on') continue;
      const p = town.place;
      const left = p.x0 * TILE_SIZE;
      const right = (p.x1 + 1) * TILE_SIZE;
      const top = p.y0 * TILE_SIZE;
      const bottom = (p.y1 + 1) * TILE_SIZE;
      if (
        right < view.x - m ||
        left > view.x + view.width + m ||
        bottom < view.y - m ||
        top > view.y + view.height + m
      )
        continue;
      this.lanternTimer[i] = (this.lanternTimer[i] ?? 0) - dt;
      if ((this.lanternTimer[i] ?? 0) <= 0) {
        this.lanternTimer[i] = 1 / TOWN_VIEW.lanternRate;
        this.spawnLantern(
          town,
          Math.max(left, view.x - m),
          Math.min(right, view.x + view.width + m),
        );
      }
      this.fireworkTimer[i] = (this.fireworkTimer[i] ?? 0) - dt;
      if ((this.fireworkTimer[i] ?? 0) <= 0) {
        this.fireworkTimer[i] = between(
          TOWN_VIEW.fireworkIntervalMin,
          TOWN_VIEW.fireworkIntervalMax,
        );
        // Over the part of the town in view, at a height above its ground there.
        const fx = between(Math.max(left, view.x), Math.min(right, view.x + view.width));
        const ground = this.sim.world.groundRow(Math.floor(fx / TILE_SIZE)) * TILE_SIZE;
        this.fireworkBurst(
          fx,
          Math.max(top, ground - between(TOWN_VIEW.fireworkHeightMin, TOWN_VIEW.fireworkHeightMax)),
        );
      }
    }
  }

  private spawnLantern(town: Town, left: number, right: number): void {
    const l = this.lanterns.find((q) => !q.active);
    if (!l) return;
    const x = between(left, right);
    l.active = true;
    l.x = x;
    // Released from the ground (or rooftop) under where it starts, inside the town.
    const ground = this.sim.world.groundRow(Math.floor(x / TILE_SIZE));
    l.y = Math.min(ground, town.place.y1 + 1) * TILE_SIZE;
    l.age = 0;
    l.life = between(TOWN_VIEW.lanternLifeMin, TOWN_VIEW.lanternLifeMax);
    l.rise = between(TOWN_VIEW.lanternRiseMin, TOWN_VIEW.lanternRiseMax);
    l.phase = Math.random() * Math.PI * 2;
  }

  private stepLanterns(dt: number): void {
    for (const l of this.lanterns) {
      if (!l.active) continue;
      l.age += dt;
      if (l.age >= l.life) {
        l.active = false;
        l.image.setVisible(false);
        l.halo.setVisible(false);
        continue;
      }
      l.y -= l.rise * dt;
      const sway = Math.sin(l.age * TOWN_VIEW.lanternSwayRate + l.phase) * TOWN_VIEW.lanternSwayPx;
      const fade = Math.min(1, (l.life - l.age) / TOWN_VIEW.lanternFadeSeconds);
      l.image
        .setPosition(l.x + sway, l.y)
        .setAlpha(fade)
        .setVisible(true);
      l.halo
        .setPosition(l.x + sway, l.y)
        .setDisplaySize(TOWN_VIEW.lanternHaloPx, TOWN_VIEW.lanternHaloPx)
        .setAlpha(TOWN_VIEW.lanternHaloAlpha * fade)
        .setVisible(true);
    }
  }

  private fireworkBurst(x: number, y: number): void {
    const color = FIREWORK_COLORS[Math.floor(Math.random() * FIREWORK_COLORS.length)] ?? 0xffffff;
    const flash = this.flashes.find((f) => !f.active);
    if (flash) {
      flash.active = true;
      flash.x = x;
      flash.y = y;
      flash.age = 0;
      flash.color = color;
    }
    const n = TOWN_VIEW.fireworkSparks;
    for (let k = 0; k < n; k++) {
      const s = this.sparks.find((q) => !q.active);
      if (!s) return;
      const angle = (k / n) * Math.PI * 2 + Math.random() * 0.2;
      const speed = between(TOWN_VIEW.fireworkSpeedMin, TOWN_VIEW.fireworkSpeedMax);
      s.active = true;
      s.x = x;
      s.y = y;
      s.vx = Math.cos(angle) * speed;
      s.vy = Math.sin(angle) * speed;
      s.age = 0;
      s.color = color;
      s.image.setTint(color);
      s.halo.setTint(color);
    }
  }

  private stepSparks(dt: number): void {
    for (const s of this.sparks) {
      if (!s.active) continue;
      s.age += dt;
      if (s.age >= TOWN_VIEW.fireworkLife) {
        s.active = false;
        s.image.setVisible(false);
        s.halo.setVisible(false);
        continue;
      }
      s.vy += TOWN_VIEW.fireworkGravity * dt;
      // Drag so the burst blooms outward and then hangs.
      const drag = Math.max(0, 1 - 2 * dt);
      s.vx *= drag;
      s.vy *= drag;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      const fade = 1 - s.age / TOWN_VIEW.fireworkLife;
      s.image.setPosition(s.x, s.y).setAlpha(fade).setVisible(true);
      s.halo
        .setPosition(s.x, s.y)
        .setDisplaySize(TOWN_VIEW.sparkHaloPx, TOWN_VIEW.sparkHaloPx)
        .setAlpha(TOWN_VIEW.sparkHaloAlpha * fade)
        .setVisible(true);
    }
  }

  private stepFlashes(dt: number): void {
    for (const f of this.flashes) {
      if (!f.active) continue;
      f.age += dt;
      const t = f.age / TOWN_VIEW.fireworkFlashSeconds;
      if (t >= 1) {
        f.active = false;
        f.halo.setVisible(false);
        continue;
      }
      f.halo
        .setTint(f.color)
        .setPosition(f.x, f.y)
        .setDisplaySize(
          TOWN_VIEW.fireworkFlashPx * (0.5 + t),
          TOWN_VIEW.fireworkFlashPx * (0.5 + t),
        )
        .setAlpha(TOWN_VIEW.fireworkFlashAlpha * (1 - t))
        .setVisible(true);
    }
  }
}
