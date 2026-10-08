import * as Phaser from 'phaser';
import { DISPLAY, TILE_SIZE } from '../../config';
import { PALETTE } from '../../data/palette';
import { TILES } from '../../data/tiles';
import type { UiBridge } from '../../ui/bridge';
import { SceneKey, TextureKey } from './keys';

/** Title backdrop. The title text and "click to begin" prompt live in the DOM overlay. */
export class TitleScene extends Phaser.Scene {
  /** Height of the decorative tile strip, in tiles. */
  private static readonly groundRows = 3;

  constructor(private readonly bridge: UiBridge) {
    super(SceneKey.Title);
  }

  create(): void {
    this.cameras.main.setBackgroundColor(PALETTE.tealShadow[0]);
    this.drawGroundStrip();

    const unsubscribe = this.bridge.commands.on('startGame', () => this.scene.start(SceneKey.Game));
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, unsubscribe);
    this.bridge.set({ screen: 'title' });
  }

  /** A strip of every placeholder tile along the bottom, so the generated atlas is visible. */
  private drawGroundStrip(): void {
    const solidTiles = TILES.filter((t) => t.placeholderRamp !== null);
    const rows = TitleScene.groundRows;
    const top = DISPLAY.height - rows * TILE_SIZE;
    for (let row = 0; row < rows; row++) {
      for (let x = 0; x < DISPLAY.width; x += TILE_SIZE) {
        const tile = solidTiles[(x / TILE_SIZE + row) % solidTiles.length];
        if (!tile) continue;
        this.add
          .image(x, top + row * TILE_SIZE, TextureKey.placeholderTiles, tile.id)
          .setOrigin(0, 0);
      }
    }
  }
}
