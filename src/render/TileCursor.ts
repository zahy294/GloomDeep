import type * as Phaser from 'phaser';
import { MINING, TILE_SIZE } from '../config';
import { PALETTE } from '../data/palette';
import type { EventBus, SimEvents } from '../sim/events';
import type { ActionState } from '../sim/input';
import type { Player } from '../sim/entities/Player';
import { inReach, tileAt } from '../sim/systems/tileTargeting';
import { Depth } from './depth';

/** Outline around the tile under the mouse (dim when out of reach) plus the mining crack overlay. */
export class TileCursor {
  private readonly outline: Phaser.GameObjects.Graphics;
  private readonly crack: Phaser.GameObjects.Image;
  private readonly unsubscribe: () => void;
  visible = true;

  constructor(
    scene: Phaser.Scene,
    events: EventBus<SimEvents>,
    private readonly input: ActionState,
    private readonly player: Player,
    cracksTexture: string,
  ) {
    this.outline = scene.add.graphics().setDepth(Depth.tileOverlay);
    this.crack = scene.add
      .image(0, 0, cracksTexture, 0)
      .setOrigin(0, 0)
      .setDepth(Depth.tileOverlay)
      .setVisible(false);
    this.unsubscribe = events.on('tileDamaged', ({ x, y, stage }) => {
      const visible = stage > 0 && stage <= MINING.crackStages;
      this.crack.setVisible(visible);
      if (visible) this.crack.setPosition(x * TILE_SIZE, y * TILE_SIZE).setFrame(stage - 1);
    });
  }

  update(): void {
    this.outline.clear();
    if (!this.visible) return;
    const tx = tileAt(this.input.aimX);
    const ty = tileAt(this.input.aimY);
    const reachable = inReach(this.player.body, tx, ty, MINING.reachTiles);
    this.outline
      .lineStyle(1, reachable ? PALETTE.honey[3] : PALETTE.moonSilver[1], reachable ? 0.9 : 0.5)
      .strokeRect(tx * TILE_SIZE + 0.5, ty * TILE_SIZE + 0.5, TILE_SIZE - 1, TILE_SIZE - 1);
  }

  destroy(): void {
    this.unsubscribe();
  }
}
