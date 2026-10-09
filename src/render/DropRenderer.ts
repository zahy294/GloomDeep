import type * as Phaser from 'phaser';
import { ITEM_DROP } from '../config';
import type { ItemDrop } from '../sim/entities/ItemDrop';
import { Depth } from './depth';
import { TextureKey } from './scenes/keys';
import { itemIcon } from './itemIcons';

/** Draws item drops as small icons, interpolated between steps. Images are pooled, never destroyed. */
export class DropRenderer {
  private readonly pool: Phaser.GameObjects.Image[] = [];

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly drops: readonly ItemDrop[],
  ) {}

  update(alpha: number): void {
    while (this.pool.length < this.drops.length) {
      this.pool.push(
        this.scene.add
          .image(0, 0, TextureKey.tiles, 0)
          .setDisplaySize(ITEM_DROP.size, ITEM_DROP.size)
          .setDepth(Depth.entities),
      );
    }
    for (let i = 0; i < this.pool.length; i++) {
      const image = this.pool[i];
      if (!image) continue;
      const drop = this.drops[i];
      const icon = drop ? itemIcon(drop.itemId) : null;
      if (!drop || !icon) {
        image.setVisible(false);
        continue;
      }
      const { body, prevX, prevY } = drop;
      const x = prevX + (body.x - prevX) * alpha + body.width / 2;
      const y = prevY + (body.y - prevY) * alpha + body.height / 2;
      if (image.texture.key !== icon.texture || image.frame.name !== String(icon.frame)) {
        image.setTexture(icon.texture, icon.frame);
      }
      image
        .setDisplaySize(ITEM_DROP.size, ITEM_DROP.size)
        .setPosition(Math.round(x), Math.round(y))
        .setVisible(true);
    }
  }
}
