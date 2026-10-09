import * as Phaser from 'phaser';
import { ATMOSPHERE, DISPLAY } from '../config';

export interface MistLayerOptions {
  /** Noise cells across the object (x, y) and octaves. */
  cells: readonly [number, number];
  iterations: number;
  /** Starting noise offset, so layers differ (the source ignores noiseSeed). */
  origin: readonly [number, number];
  /** Band height in px (fixed at the tallest view) and depth. */
  height: number;
  depth: number;
}

/**
 * One screen-space band of drifting simplex noise tinted as mist. Phaser's NoiseSimplex2D has no
 * time uniform, so the scroll is accumulated here and written to `noiseOffset` every frame.
 */
export class MistLayer {
  readonly object: Phaser.GameObjects.NoiseSimplex2D;
  private x: number;
  private y: number;
  private colour = -1;
  private alpha = -1;

  constructor(scene: Phaser.Scene, options: MistLayerOptions) {
    this.x = options.origin[0];
    this.y = options.origin[1];
    this.object = scene.add
      .noisesimplex2d(
        {
          noiseCells: [options.cells[0], options.cells[1]],
          noiseIterations: options.iterations,
          noiseOffset: [this.x, this.y],
          noiseValuePower: ATMOSPHERE.mist.noiseValuePower,
        },
        0,
        0,
        DISPLAY.width,
        options.height,
      )
      .setOrigin(0, 1)
      .setScrollFactor(0)
      .setDepth(options.depth)
      .setVisible(false);
  }

  /** Bottom edge on screen. */
  setBottom(y: number): void {
    this.object.setY(y);
  }

  /** Advance the drift by `dx`, `dy` noise units. */
  scroll(dx: number, dy: number): void {
    this.x += dx;
    this.y += dy;
    this.object.noiseOffset[0] = this.x;
    this.object.noiseOffset[1] = this.y;
  }

  /** Set colour and peak opacity; hides the layer when it would draw nothing. */
  setLook(colour: number, alpha: number, epsilon: number): void {
    const visible = alpha > epsilon;
    this.object.setVisible(visible);
    if (!visible) return;
    if (colour === this.colour && Math.abs(alpha - this.alpha) < epsilon) return;
    this.colour = colour;
    this.alpha = alpha;
    const r = ((colour >> 16) & 0xff) / 255;
    const g = ((colour >> 8) & 0xff) / 255;
    const b = (colour & 0xff) / 255;
    this.object.setNoiseColor([r, g, b, 0], [r, g, b, alpha]);
  }
}
