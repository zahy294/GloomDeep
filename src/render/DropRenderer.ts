import type * as Phaser from 'phaser';
import { ITEM_DROP } from '../config';
import type { ItemDrop } from '../sim/entities/ItemDrop';
import { Depth } from './depth';
import { itemIconFrame } from './itemIcons';

/** Draws item drops as small icons, interpolated between steps. Images are pooled, never destroyed. */
export class DropRenderer {
  private readonly pool: Phaser.GameObjects.Image[] = [];

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly drops: readonly ItemDrop[],
    private readonly textureKey: string,
  ) {}

  update(alpha: number): void {
    while (this.pool.length < this.drops.length) {
      this.pool.push(
        this.scene.add
          .image(0, 0, this.textureKey, 0)
          .setDisplaySize(ITEM_DROP.size, ITEM_DROP.size)
          .setDepth(Depth.entities),
      );
    }
    for (let i = 0; i < this.pool.length; i++) {
      const image = this.pool[i];
      if (!image) continue;
      const drop = this.drops[i];
      const frame = drop ? itemIconFrame(drop.itemId) : -1;
      if (!drop || frame < 0) {
        image.setVisible(false);
        continue;
      }
      const { body, prevX, prevY } = drop;
      const x = prevX + (body.x - prevX) * alpha + body.width / 2;
      const y = prevY + (body.y - prevY) * alpha + body.height / 2;
      image
        .setFrame(frame)
        .setDisplaySize(ITEM_DROP.size, ITEM_DROP.size)
        .setPosition(Math.round(x), Math.round(y))
        .setVisible(true);
    }
  }
}
