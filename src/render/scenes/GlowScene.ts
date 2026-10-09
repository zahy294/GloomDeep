import * as Phaser from 'phaser';
import { SceneKey } from './keys';

/**
 * Holds the additive glow halos (plan 2.2 layer 14), rendered after the Game scene straight onto
 * the canvas. Phaser's ADD blend is `[ONE, DST_ALPHA]`: on the opaque canvas that's plain additive
 * light, but inside the Game camera's transparent composite framebuffer overlapping halos scaled
 * each other's colour by a fractional alpha and left visible square edges. The Game scene keeps
 * this camera's scroll in step with its own.
 */
export class GlowScene extends Phaser.Scene {
  constructor() {
    super(SceneKey.Glow);
  }

  /** Follows the world camera exactly (same zoom, whole-pixel scroll). */
  follow(camera: Phaser.Cameras.Scene2D.Camera): void {
    this.cameras.main.setScroll(camera.scrollX, camera.scrollY);
  }
}
