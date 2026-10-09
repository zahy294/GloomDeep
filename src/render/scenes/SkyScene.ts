import * as Phaser from 'phaser';
import { DISPLAY } from '../../config';
import { PALETTE } from '../../data/palette';
import { mulberry32 } from '../../sim/random';
import type { DaySample } from '../../sim/dayCycle';
import { SceneKey, TextureKey } from './keys';

/** What the sky needs from the running game each frame. */
export interface SkySource {
  dayFraction: number;
  day: DaySample;
}

/** Sun/moon path: an arc centred below the screen bottom, radius as a fraction of the width. */
const ARC = { centreY: DISPLAY.height * 1.05, radiusX: DISPLAY.width * 0.45, radiusY: 420 };
const STAR_COUNT = 90;
const STAR_SEED = 0x5ca7;
/** Stars only appear in the top part of the sky. */
const STAR_BAND = 0.7;

/**
 * The sky (plan 2.2 layer 1): a vertical Gradient driven by the day-cycle keyframes, plus the sun,
 * moon and stars. It is its own scene, rendered before the Game scene, so the light map — which
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

  constructor() {
    super(SceneKey.Sky);
  }

  init(data: { source: SkySource }): void {
    this.source = data.source;
  }

  create(): void {
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
        DISPLAY.height,
      )
      .setOrigin(0, 0);

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
    this.update();
  }

  override update(): void {
    const { day, dayFraction } = this.source;
    if (day.skyTop !== this.encodedTop || day.skyHorizon !== this.encodedHorizon) {
      this.encodedTop = day.skyTop;
      this.encodedHorizon = day.skyHorizon;
      this.gradient.ramp.bands[0]?.setColors(day.skyTop, day.skyHorizon);
      this.gradient.ramp.encode();
    }
    this.stars.setAlpha(day.stars);

    // Sun rises at dawn (0.25) in the east (left), peaks at noon, sets at dusk (0.75).
    this.placeOnArc(this.sun, dayFraction - 0.25);
    this.placeOnArc(this.moon, dayFraction + 0.25);
  }

  /** `phase` 0 = rising on the left horizon, 0.25 = top, 0.5 = setting on the right. */
  private placeOnArc(body: Phaser.GameObjects.Image, phase: number): void {
    const angle = (((phase % 1) + 1) % 1) * Math.PI * 2;
    const x = DISPLAY.width / 2 - Math.cos(angle) * ARC.radiusX;
    const y = ARC.centreY - Math.sin(angle) * ARC.radiusY;
    body.setPosition(Math.round(x), Math.round(y)).setVisible(y < ARC.centreY);
  }
}
