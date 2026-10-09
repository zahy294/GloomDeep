import * as Phaser from 'phaser';
import { ATMOSPHERE, DISPLAY } from '../config';
import { FG_CANOPY_ID, FG_CANOPY_SIZE } from '../data/spriteAssets';
import { canopyAlpha, daylightTint } from './atmosphereMath';
import { blendNumber } from './biomeBlend';
import type { VisualState } from './VisualState';

/**
 * Dark leaf silhouettes hanging across the top of the view and passing faster than the world
 * (plan 2.0 "foreground canopy", layer 16). Shown in biomes flagged `foregroundCanopy`.
 */
export class ForegroundCanopy {
  private readonly sprite: Phaser.GameObjects.TileSprite;

  private readonly approved: boolean;
  private tint = -1;

  constructor(
    scene: Phaser.Scene,
    depth: number,
    approvedSprites: Readonly<Record<string, string>>,
  ) {
    this.approved = approvedSprites[FG_CANOPY_ID] === 'approved';
    this.sprite = scene.add
      .tileSprite(0, 0, DISPLAY.width, FG_CANOPY_SIZE.height, FG_CANOPY_ID)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(depth)
      .setVisible(false);
  }

  update(visual: VisualState): void {
    const cfg = ATMOSPHERE.front.canopy;
    const weight = blendNumber(visual.weights, (v) => (v.foregroundCanopy ? 1 : 0));
    const alpha = canopyAlpha(weight, visual.outdoors, cfg.alpha);
    const visible = alpha > cfg.minAlpha;
    this.sprite.setVisible(visible);
    if (!visible) return;
    this.sprite.setAlpha(alpha);
    // Placeholder is a white silhouette tinted near-black; approved art only gets the time-of-day light.
    const tint = this.approved ? daylightTint(visual.daylight) : cfg.tint;
    if (tint !== this.tint) {
      this.tint = tint;
      this.sprite.setTint(tint);
    }
    const sway =
      Math.sin(visual.realTime * cfg.swaySpeed) * cfg.swayPx * (0.4 + Math.abs(visual.wind));
    this.sprite.tilePositionX = visual.view.x * cfg.scroll + sway;
  }
}
