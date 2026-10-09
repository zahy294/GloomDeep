import * as Phaser from 'phaser';
import { ATMOSPHERE, DISPLAY } from '../../config';
import { PALETTE } from '../../data/palette';
import { mulberry32 } from '../../sim/random';
import type { DaySample } from '../../sim/dayCycle';
import { blendColor, blendNumber } from '../biomeBlend';
import { mistAlpha, weatherSky } from '../atmosphereMath';
import { BackMist, makeBackMistTexture } from '../BackMist';
import { CameraGrade } from '../CameraGrade';
import { ParallaxRenderer } from '../ParallaxRenderer';
import { Starfall } from '../Starfall';
import type { VisualState } from '../VisualState';
import { packSprites, SceneKey, TextureKey } from './keys';

/** What the sky needs from the running game each frame. */
export interface SkySource {
  dayFraction: number;
  day: DaySample;
  /** The world's ground line, for anchoring the parallax tree lines. */
  world: { groundRow(x: number): number };
}

/**
 * Sun/moon path: an arc centred just below the bottom of the view (whose height varies with the
 * window, see integerScale.ts), radius as a fraction of the width.
 */
const ARC = { centreBelow: 1.05, radiusX: DISPLAY.width * 0.45, radiusY: 420 };
const STAR_COUNT = 90;
const STAR_SEED = 0x5ca7;
/** Stars only appear in the top part of the sky. */
const STAR_BAND = 0.7;

const PARALLAX_STRIDE = 10;
const parallaxDepth = (layer: number) => ATMOSPHERE.parallax.depthBase + layer * PARALLAX_STRIDE;

/**
 * The sky (plan 2.2 layers 1�4): a vertical Gradient driven by the day-cycle keyframes, plus the
 * sun, moon, stars, starfall, the parallax tree lines and the back mist between them. It is its own scene, rendered before the Game scene, so the light map — which
 * multiplies everything the Game camera draws — never darkens the sky a second time.
 */
export class SkyScene extends Phaser.Scene {
  private source!: SkySource;
  private gradient!: Phaser.GameObjects.Gradient;
  private sun!: Phaser.GameObjects.Image;
  private moon!: Phaser.GameObjects.Image;
  private stars!: Phaser.GameObjects.Graphics;
  /** Colours last encoded into the gradient (encoding re-uploads a texture, so only on change). */
  private encodedTop = -1;
  private encodedHorizon = -1;
  private parallax!: ParallaxRenderer;
  private starfall!: Starfall;
  private backMist: BackMist[] = [];
  private lastTime = 0;
  private lastCameraX = Number.NaN;

  constructor() {
    super(SceneKey.Sky);
  }

  protected visual!: VisualState;

  init(data: { source: SkySource; visual: VisualState }): void {
    this.source = data.source;
    this.visual = data.visual;
  }

  create(): void {
    this.makeGradient();
    // Rows are cropped or restored when the window is resized: keep the horizon colour at the bottom.
    const resize = () => {
      this.gradient.destroy();
      this.makeGradient();
    };
    this.scale.on(Phaser.Scale.Events.RESIZE, resize);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () =>
      this.scale.off(Phaser.Scale.Events.RESIZE, resize),
    );

    this.stars = this.add.graphics();
    const random = mulberry32(STAR_SEED);
    for (let i = 0; i < STAR_COUNT; i++) {
      const bright = random() < 0.2;
      this.stars
        .fillStyle(bright ? PALETTE.moonSilver[3] : PALETTE.moonSilver[2], 1)
        .fillRect(
          Math.floor(random() * DISPLAY.width),
          Math.floor(random() * DISPLAY.height * STAR_BAND),
          bright ? 2 : 1,
          bright ? 2 : 1,
        );
    }
    this.moon = this.add.image(0, 0, TextureKey.moon);
    this.sun = this.add.image(0, 0, TextureKey.sun);
    this.moon.setDepth(1);
    this.sun.setDepth(1);
    this.parallax = new ParallaxRenderer(this, this.source, parallaxDepth, packSprites(this.cache));
    this.starfall = new Starfall(this);
    const mist = ATMOSPHERE.mist;
    makeBackMistTexture(this.textures);
    this.backMist = mist.afterLayer.map(
      (layer, i) => new BackMist(this, i, parallaxDepth(layer) + PARALLAX_STRIDE / 2),
    );
    CameraGrade.of(this.visual)?.addGradeCamera(this.cameras.main);
    this.update();
  }

  override update(): void {
    const { dayFraction } = this.source;
    const visual = this.visual;
    const day = visual.day;
    const dt = Math.min(0.1, Math.max(0, visual.realTime - this.lastTime));
    this.lastTime = visual.realTime;

    const top = weatherSky(day.skyTop, visual.rain, visual.flash);
    const horizon = weatherSky(day.skyHorizon, visual.rain, visual.flash);
    if (top !== this.encodedTop || horizon !== this.encodedHorizon) {
      this.encodedTop = top;
      this.encodedHorizon = horizon;
      this.gradient.ramp.bands[0]?.setColors(top, horizon);
      this.gradient.ramp.encode();
    }
    this.parallax.update(visual);
    this.starfall.update(visual, dt);
    this.updateBackMist(visual, dt);
    this.stars.setAlpha(day.stars * (1 - visual.rain));
    // Clouds hide the sun and moon as the rain thickens.
    const clear = 1 - visual.rain * ATMOSPHERE.sky.rainHidesBodies;
    this.sun.setAlpha(clear);
    this.moon.setAlpha(clear);

    // Sun rises at dawn (0.25) in the east (left), peaks at noon, sets at dusk (0.75).
    this.placeOnArc(this.sun, dayFraction - 0.25);
    this.placeOnArc(this.moon, dayFraction + 0.25);
  }

  private updateBackMist(visual: VisualState, dt: number): void {
    const { mist } = ATMOSPHERE;
    const enabled = visual.features.mist;
    const colour = blendColor(visual.weights, (v) => v.mist.color);
    const base = blendNumber(visual.weights, (v) => v.mist.alpha);
    const dawn = blendNumber(visual.weights, (v) => v.mist.dawnBoost);
    const height = this.scale.height;
    const cameraDx = Number.isNaN(this.lastCameraX) ? 0 : visual.view.x - this.lastCameraX;
    this.lastCameraX = visual.view.x;
    for (let i = 0; i < this.backMist.length; i++) {
      const alpha = enabled
        ? mistAlpha(base, dawn, visual.mist, mist.backScale[i] ?? 1, visual.outdoors)
        : 0;
      const drift = (mist.driftPx[i] ?? 0) + visual.wind * (mist.windPx[i] ?? 0);
      this.backMist[i]?.update(
        colour,
        alpha,
        height * (mist.bandBottom[i] ?? 1),
        drift,
        dt,
        cameraDx,
      );
    }
  }

  private makeGradient(): void {
    this.gradient = this.add
      .gradient(
        {
          bands: [{ start: 0, end: 1, colorStart: PALETTE.moonSilver[1], colorEnd: 0xffffff }],
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
      .setDepth(-1);
    // Force the day colours to be encoded into the new gradient on the next update.
    this.encodedTop = -1;
    this.encodedHorizon = -1;
  }

  /** `phase` 0 = rising on the left horizon, 0.25 = top, 0.5 = setting on the right. */
  private placeOnArc(body: Phaser.GameObjects.Image, phase: number): void {
    const angle = (((phase % 1) + 1) % 1) * Math.PI * 2;
    const x = DISPLAY.width / 2 - Math.cos(angle) * ARC.radiusX;
    const centreY = this.scale.height * ARC.centreBelow;
    const y = centreY - Math.sin(angle) * ARC.radiusY;
    body.setPosition(Math.round(x), Math.round(y)).setVisible(y < centreY);
  }
}
