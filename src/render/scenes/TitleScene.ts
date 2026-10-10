import * as Phaser from 'phaser';
import { DISPLAY, TILE_SIZE, TITLE_SCENE as T } from '../../config';
import { PALETTE } from '../../data/palette';
import {
  PARALLAX_LAYERS,
  PARALLAX_SIZE,
  PARTICLE_FRAME,
  parallaxAssetId,
} from '../../data/spriteAssets';
import { mulberry32 } from '../../sim/random';
import { iconFrame } from '../../sim/world/autotile';
import type { UiBridge } from '../../ui/bridge';
import { spriteFrame } from '../spriteFrames';
import { SceneKey, TextureKey } from './keys';

const TWO_PI = Math.PI * 2;
const GRASS_TILE = 2;
const SOIL_TILE = 1;
/** Tree lines come from the first surface biome (Elderglade). */
const BIOME = 'elderglade';

/**
 * Title backdrop: a night forest with tree lines drifting at different speeds, twinkling stars,
 * fireflies and a ground strip. The title text and "click to begin" prompt live in the DOM overlay.
 */
export class TitleScene extends Phaser.Scene {
  private sky!: Phaser.GameObjects.Gradient;
  private readonly layers: Phaser.GameObjects.TileSprite[] = [];
  private grass!: Phaser.GameObjects.TileSprite;
  private soil!: Phaser.GameObjects.TileSprite;
  private moon!: Phaser.GameObjects.Image;
  private moonHalo!: Phaser.GameObjects.Image;
  private readonly stars: Phaser.GameObjects.Image[] = [];
  private starX = new Float32Array(0);
  private starY = new Float32Array(0);
  private starPhase = new Float32Array(0);
  private readonly flies: Phaser.GameObjects.Image[] = [];
  private readonly fliesHalo: Phaser.GameObjects.Image[] = [];
  private flyX = new Float32Array(0);
  private flyY = new Float32Array(0);
  /** Each firefly's home as fractions of the width and of the vertical band. */
  private flyFx = new Float32Array(0);
  private flyFy = new Float32Array(0);
  private flyPhaseA = new Float32Array(0);
  private flyPhaseB = new Float32Array(0);
  private readonly glows: Phaser.GameObjects.Image[] = [];
  private seconds = 0;

  constructor(private readonly bridge: UiBridge) {
    super(SceneKey.Title);
  }

  create(data?: { screen?: 'title' | 'worlds' }): void {
    this.layers.length = 0;
    this.stars.length = 0;
    this.flies.length = 0;
    this.fliesHalo.length = 0;
    this.glows.length = 0;
    this.seconds = 0;
    this.cameras.main.setBackgroundColor(T.skyTop);
    const random = mulberry32(T.seed);

    this.makeSky();
    this.makeStars(random);
    this.moonHalo = this.add
      .image(0, 0, TextureKey.glow)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(PALETTE.moonSilver[2])
      .setAlpha(T.moon.haloAlpha)
      .setScale(T.moon.haloScale);
    this.moon = this.add.image(0, 0, TextureKey.moon).setAlpha(0.9);
    for (let n = 0; n < PARALLAX_LAYERS; n++) {
      const key = parallaxAssetId(BIOME, n);
      if (!this.textures.exists(key)) continue;
      this.layers[n] = this.add
        .tileSprite(0, 0, DISPLAY.width, PARALLAX_SIZE.height, key)
        .setOrigin(0, 1)
        .setTint(T.layerTints[n] ?? 0xffffff)
        .setAlpha(T.layerAlpha[n] ?? 1);
    }
    this.makeGroundGlows();
    this.makeGround();
    this.makeFireflies(random);

    this.layout();
    const onResize = () => this.layout();
    this.scale.on(Phaser.Scale.Events.RESIZE, onResize);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () =>
      this.scale.off(Phaser.Scale.Events.RESIZE, onResize),
    );

    // The overlay shows the title or the world list on top of this backdrop (src/flow/WorldFlow.ts).
    this.bridge.set({ screen: data?.screen ?? 'title' });
  }

  override update(_time: number, delta: number): void {
    const dt = Math.min(T.maxStepSeconds, delta / 1000);
    this.seconds += dt;
    const t = this.seconds;
    this.layers.forEach((layer, n) => {
      layer.tilePositionX += (T.layerSpeeds[n] ?? 0) * dt;
    });
    for (let i = 0; i < this.stars.length; i++) {
      const wave = 0.5 + 0.5 * Math.sin(t * T.stars.twinkleSpeed + (this.starPhase[i] ?? 0));
      this.stars[i]?.setAlpha(T.stars.alphaMin + (T.stars.alphaMax - T.stars.alphaMin) * wave);
    }
    const f = T.fireflies;
    for (let i = 0; i < this.flies.length; i++) {
      const a = this.flyPhaseA[i] ?? 0;
      const b = this.flyPhaseB[i] ?? 0;
      const x = (this.flyX[i] ?? 0) + Math.sin(t * f.speed + a) * f.drift;
      const y = (this.flyY[i] ?? 0) + Math.cos(t * f.speed * 1.3 + b) * f.drift * 0.6;
      const pulse = 0.5 + 0.5 * Math.sin(t * f.pulseSpeed + a * 3);
      this.flies[i]?.setPosition(x, y).setAlpha(0.35 + 0.65 * pulse);
      this.fliesHalo[i]?.setPosition(x, y).setAlpha(f.haloAlpha * pulse);
    }
    const g = T.groundGlows;
    for (let i = 0; i < this.glows.length; i++) {
      const wave = 0.5 + 0.5 * Math.sin(t * g.pulseSpeed + i * 1.9);
      this.glows[i]?.setAlpha(g.alpha * (0.6 + 0.4 * wave));
    }
  }

  private makeSky(): void {
    this.sky?.destroy();
    this.sky = this.add
      .gradient(
        {
          bands: [{ start: 0, end: 1, colorStart: T.skyTop, colorEnd: T.skyHorizon }],
          start: { x: 0, y: 0 },
          shape: { x: 0, y: 1 },
          dither: true,
        },
        0,
        0,
        DISPLAY.width,
        this.scale.height,
      )
      .setOrigin(0, 0)
      .setDepth(-10);
  }

  private makeStars(random: () => number): void {
    const n = T.stars.count;
    this.starX = new Float32Array(n);
    this.starY = new Float32Array(n);
    this.starPhase = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      this.starX[i] = random();
      this.starY[i] = random();
      this.starPhase[i] = random() * TWO_PI;
      this.stars.push(
        this.add.image(0, 0, TextureKey.particle).setTint(PALETTE.moonSilver[3]).setDepth(-5),
      );
    }
  }

  private makeGround(): void {
    this.grass = this.add
      .tileSprite(0, 0, DISPLAY.width, TILE_SIZE, TextureKey.tiles, iconFrame(GRASS_TILE))
      .setOrigin(0, 0)
      .setTint(T.groundTint);
    this.soil = this.add
      .tileSprite(
        0,
        0,
        DISPLAY.width,
        (T.groundRows - 1) * TILE_SIZE,
        TextureKey.tiles,
        iconFrame(SOIL_TILE),
      )
      .setOrigin(0, 0)
      .setTint(T.groundTint);
  }

  private makeGroundGlows(): void {
    const g = T.groundGlows;
    for (let i = 0; i < g.count; i++) {
      this.glows.push(
        this.add
          .image(0, 0, TextureKey.glow)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setTint(g.color)
          .setScale(g.scale, g.scale * 0.5),
      );
    }
  }

  private makeFireflies(random: () => number): void {
    const n = T.fireflies.count;
    this.flyX = new Float32Array(n);
    this.flyY = new Float32Array(n);
    this.flyFx = new Float32Array(n);
    this.flyFy = new Float32Array(n);
    this.flyPhaseA = new Float32Array(n);
    this.flyPhaseB = new Float32Array(n);
    const frame = spriteFrame('particles', PARTICLE_FRAME.firefly);
    const atlas = this.textures.get(TextureKey.sprites);
    for (let i = 0; i < n; i++) {
      this.flyFx[i] = random();
      this.flyFy[i] = random();
      this.flyPhaseA[i] = random() * TWO_PI;
      this.flyPhaseB[i] = random() * TWO_PI;
      this.fliesHalo.push(
        this.add
          .image(0, 0, TextureKey.glow)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setTint(T.fireflies.color)
          .setScale(T.fireflies.haloScale),
      );
      const fly = atlas.has(frame)
        ? this.add.image(0, 0, TextureKey.sprites, frame)
        : this.add.image(0, 0, TextureKey.particle);
      this.flies.push(fly.setBlendMode(Phaser.BlendModes.ADD).setTint(T.fireflies.color));
    }
  }

  /** Positions everything for the current view height (it changes when the window is resized). */
  private layout(): void {
    const w = DISPLAY.width;
    const h = this.scale.height;
    const groundTop = h - T.groundRows * TILE_SIZE;
    this.makeSky();
    this.layers.forEach((layer, n) => layer.setY(groundTop + (T.layerSink[n] ?? 0)));
    this.grass.setY(groundTop);
    this.soil.setY(groundTop + TILE_SIZE);
    const skyHeight = h * T.stars.maxHeightFraction;
    for (let i = 0; i < this.stars.length; i++) {
      this.stars[i]?.setPosition(
        Math.floor((this.starX[i] ?? 0) * w),
        Math.floor((this.starY[i] ?? 0) * skyHeight),
      );
    }
    this.moon.setPosition(Math.round(w * T.moon.x), Math.round(h * T.moon.y));
    this.moonHalo.setPosition(this.moon.x, this.moon.y);
    this.glows.forEach((glow, i) =>
      glow.setPosition(((i + 0.5) / this.glows.length) * w, groundTop - TILE_SIZE),
    );
    // Fireflies keep their fractional spot: x across the width, y inside the band.
    const f = T.fireflies;
    const top = h * f.bandTop;
    const span = Math.min(groundTop, h * f.bandBottom) - top;
    for (let i = 0; i < this.flies.length; i++) {
      this.flyX[i] = (this.flyFx[i] ?? 0) * w;
      this.flyY[i] = top + (this.flyFy[i] ?? 0) * span;
    }
  }
}
