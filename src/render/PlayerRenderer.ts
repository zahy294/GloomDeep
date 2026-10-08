import type * as Phaser from 'phaser';
import { PLAYER_VIEW } from '../config';
import { PALETTE } from '../data/palette';
import type { Player } from '../sim/entities/Player';
import { approach } from './cameraMath';
import { Depth } from './depth';

/** Placeholder look until the parts-based player arrives in M2b: a cloaked body and a lantern. */
const SPRITE = { width: 20, height: 40, lanternSize: 4, lanternOffsetX: 9, lanternOffsetY: 22 };

export class PlayerRenderer {
  private readonly body: Phaser.GameObjects.Rectangle;
  private readonly lantern: Phaser.GameObjects.Rectangle;
  /** Visual-only vertical lag after an auto step-up, decaying to 0 (px, positive = lower). */
  private stepOffsetY = 0;
  private seenSteppedUp: number;

  constructor(
    scene: Phaser.Scene,
    private readonly player: Player,
  ) {
    this.seenSteppedUp = player.steppedUpTotal;
    this.body = scene.add
      .rectangle(0, 0, SPRITE.width, SPRITE.height, PALETTE.emerald[2])
      .setStrokeStyle(1, PALETTE.emerald[0])
      .setOrigin(0.5, 1)
      .setDepth(Depth.entities);
    this.lantern = scene.add
      .rectangle(0, 0, SPRITE.lanternSize, SPRITE.lanternSize, PALETTE.honey[3])
      .setDepth(Depth.entities);
  }

  /** Feet-centre at the interpolated position between the last two simulation steps. */
  feetX(alpha: number): number {
    const { body, prevX } = this.player;
    return prevX + (body.x - prevX) * alpha + body.width / 2;
  }

  /** Includes the step-up smoothing, so the camera follows the eased position too. */
  feetY(alpha: number): number {
    const { body, prevY } = this.player;
    return prevY + (body.y - prevY) * alpha + body.height + this.stepOffsetY;
  }

  update(alpha: number, dt: number): void {
    const climbed = this.player.steppedUpTotal - this.seenSteppedUp;
    this.seenSteppedUp = this.player.steppedUpTotal;
    this.stepOffsetY = approach(this.stepOffsetY + climbed, 0, PLAYER_VIEW.stepUpSmoothRate, dt);

    const x = Math.round(this.feetX(alpha));
    const y = Math.round(this.feetY(alpha));
    this.body.setPosition(x, y);
    this.lantern.setPosition(
      x + this.player.facing * SPRITE.lanternOffsetX,
      y - SPRITE.lanternOffsetY,
    );
  }
}
