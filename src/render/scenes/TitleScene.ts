import * as Phaser from 'phaser';
import { DISPLAY, TILE_SIZE } from '../../config';
import { PALETTE } from '../../data/palette';
import { TILES } from '../../data/tiles';
import { iconFrame } from '../../sim/world/autotile';
import type { UiBridge } from '../../ui/bridge';
import { SceneKey, TextureKey } from './keys';

/** Title backdrop. The title text and "click to begin" prompt live in the DOM overlay. */
export class TitleScene extends Phaser.Scene {
  /** Height of the decorative tile strip, in tiles. */
  private static readonly groundRows = 3;

  constructor(private readonly bridge: UiBridge) {
    super(SceneKey.Title);
  }

  create(data?: { screen?: 'title' | 'worlds' }): void {
    this.cameras.main.setBackgroundColor(PALETTE.tealShadow[0]);
    const strip = this.drawGroundStrip();
    // The view height changes when the window is resized (rows are cropped to keep the zoom).
    const place = () => strip.setY(this.scale.height - TitleScene.groundRows * TILE_SIZE);
    place();
    this.scale.on(Phaser.Scale.Events.RESIZE, place);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () =>
      this.scale.off(Phaser.Scale.Events.RESIZE, place),
    );

    // The overlay shows the title or the world list on top of this backdrop (src/flow/WorldFlow.ts).
    this.bridge.set({ screen: data?.screen ?? 'title' });
  }

  /** A strip of every placeholder tile along the bottom, so the generated atlas is visible. */
  private drawGroundStrip(): Phaser.GameObjects.Container {
    const solidTiles = TILES.filter((t) => t.placeholderRamp !== null);
    const rows = TitleScene.groundRows;
    const strip = this.add.container(0, 0);
    for (let row = 0; row < rows; row++) {
      for (let x = 0; x < DISPLAY.width; x += TILE_SIZE) {
        const tile = solidTiles[(x / TILE_SIZE + row) % solidTiles.length];
        if (!tile) continue;
        strip.add(
          this.add.image(x, row * TILE_SIZE, TextureKey.tiles, iconFrame(tile.id)).setOrigin(0, 0),
        );
      }
    }
    return strip;
  }
}
