import * as Phaser from 'phaser';
import type { VisualState } from '../VisualState';
import { SceneKey } from './keys';

/**
 * Layers in front of the world and its glow (plan 2.2 layers 15–16): front mist and the dark
 * foreground canopy. Drawn last, onto the opaque canvas; the Game scene keeps this camera's scroll
 * in step with its own.
 */
export class FrontScene extends Phaser.Scene {
  protected visual!: VisualState;

  constructor() {
    super(SceneKey.Front);
  }

  init(data: { visual: VisualState }): void {
    this.visual = data.visual;
  }

  /** Follows the world camera exactly (same zoom, whole-pixel scroll). */
  follow(camera: Phaser.Cameras.Scene2D.Camera): void {
    this.cameras.main.setScroll(camera.scrollX, camera.scrollY);
  }
}
