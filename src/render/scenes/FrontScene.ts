import * as Phaser from 'phaser';
import { ATMOSPHERE, DISPLAY } from '../../config';
import { mistAlpha } from '../atmosphereMath';
import {
  blendColor,
  blendNumber,
  pickMistAlpha,
  pickMistColor,
  pickMistDawnBoost,
} from '../biomeBlend';
import { CameraGrade } from '../CameraGrade';
import { ForegroundCanopy } from '../ForegroundCanopy';
import { MistLayer } from '../MistLayer';
import type { VisualState } from '../VisualState';
import { packSprites, SceneKey } from './keys';

const MIST_DEPTH = 1;
const CANOPY_DEPTH = 2;

/**
 * Layers in front of the world and its glow (plan 2.2 layers 15–16): front mist and the dark
 * foreground canopy. Drawn last, onto the opaque canvas; the Game scene keeps this camera's scroll
 * in step with its own. Both layers are screen-space (scroll factor 0).
 */
export class FrontScene extends Phaser.Scene {
  protected visual!: VisualState;
  private mist!: MistLayer;
  private canopy!: ForegroundCanopy;
  private lastTime = 0;
  private lastCameraX = Number.NaN;

  constructor() {
    super(SceneKey.Front);
  }

  init(data: { visual: VisualState }): void {
    this.visual = data.visual;
  }

  create(): void {
    const { mist } = ATMOSPHERE;
    this.mist = new MistLayer(this, {
      cells: [mist.frontCells[0] ?? 8, mist.frontCells[1] ?? 4],
      iterations: mist.iterations,
      origin: [mist.frontOrigin[0] ?? 0, mist.frontOrigin[1] ?? 0],
      height: DISPLAY.height,
      depth: MIST_DEPTH,
    });
    this.canopy = new ForegroundCanopy(this, CANOPY_DEPTH, packSprites(this.cache));
    CameraGrade.of(this.visual)?.addVignetteCamera(this.cameras.main);
  }

  override update(): void {
    const visual = this.visual;
    const { mist } = ATMOSPHERE;
    const dt = Math.min(ATMOSPHERE.maxFrameSeconds, Math.max(0, visual.realTime - this.lastTime));
    this.lastTime = visual.realTime;

    const colour = blendColor(visual.weights, pickMistColor);
    const base = blendNumber(visual.weights, pickMistAlpha);
    const dawn = blendNumber(visual.weights, pickMistDawnBoost);
    // Underground it keeps some strength (dust, spores); the Mire is thick through its base alpha.
    const presence = mist.undergroundFront + (1 - mist.undergroundFront) * visual.outdoors;
    const alpha = visual.features.mist
      ? mistAlpha(base, dawn, visual.mist, mist.frontScale, presence)
      : 0;
    this.mist.setLook(colour, alpha, mist.alphaEpsilon);
    if (alpha > mist.alphaEpsilon) {
      this.mist.setBottom(this.scale.height);
      const cameraDx = Number.isNaN(this.lastCameraX) ? 0 : visual.view.x - this.lastCameraX;
      this.mist.scroll(
        (mist.frontDrift + visual.wind * mist.windSpeed) * dt + cameraDx * mist.frontCameraParallax,
        0,
      );
    }
    this.lastCameraX = visual.view.x;
    this.canopy.update(visual);
  }

  /** Follows the world camera exactly (same zoom, whole-pixel scroll). */
  follow(camera: Phaser.Cameras.Scene2D.Camera): void {
    this.cameras.main.setScroll(camera.scrollX, camera.scrollY);
  }
}
