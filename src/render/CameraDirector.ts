import type * as Phaser from 'phaser';
import { CAMERA } from '../config';
import { approach, clampAbs, clampScroll } from './cameraMath';

/**
 * Smooth follow with look-ahead in the direction of movement. Screen shake, grading and filters
 * join here in later milestones (plan 2.8, 2.5).
 */
export class CameraDirector {
  /** Unrounded camera centre; the camera itself is scrolled to whole pixels. */
  private centreX = 0;
  private centreY = 0;
  private lookX = 0;
  private lookY = 0;

  constructor(
    private readonly camera: Phaser.Cameras.Scene2D.Camera,
    private readonly worldWidthPx: number,
    private readonly worldHeightPx: number,
  ) {}

  /** Jump straight to a target (spawn, teleport) without easing. */
  snapTo(x: number, y: number): void {
    this.centreX = x;
    this.centreY = y;
    this.lookX = 0;
    this.lookY = 0;
    this.apply();
  }

  /** `x, y`: target centre (px); `vx, vy`: target velocity (px/s); `dt`: frame time (s). */
  update(x: number, y: number, vx: number, vy: number, dt: number): void {
    const lookTargetX = clampAbs(vx * CAMERA.lookAheadTime, CAMERA.maxLookAheadX);
    const lookTargetY = clampAbs(vy * CAMERA.lookAheadTime, CAMERA.maxLookAheadY);
    this.lookX = approach(this.lookX, lookTargetX, CAMERA.lookAheadRate, dt);
    this.lookY = approach(this.lookY, lookTargetY, CAMERA.lookAheadRate, dt);
    this.centreX = approach(this.centreX, x + this.lookX, CAMERA.followRate, dt);
    this.centreY = approach(this.centreY, y + this.lookY, CAMERA.followRate, dt);
    this.apply();
  }

  private apply(): void {
    const { width, height } = this.camera;
    const scrollX = clampScroll(this.centreX - width / 2, width, this.worldWidthPx);
    const scrollY = clampScroll(this.centreY - height / 2, height, this.worldHeightPx);
    // Whole pixels keep the pixel art crisp at integer zoom.
    this.camera.setScroll(Math.round(scrollX), Math.round(scrollY));
  }
}
