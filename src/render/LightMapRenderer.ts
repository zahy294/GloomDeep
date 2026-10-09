import * as Phaser from 'phaser';
import { LIGHT, TILE_SIZE } from '../config';
import type { EventBus, SimEvents } from '../sim/events';
import type { World } from '../sim/world/World';
import { Depth } from './depth';

const TEXTURE_KEY = 'light-map';

/**
 * Draws the light grid (plan 2.3 "Light map"): one texel per tile, uploaded whenever the
 * LightSystem rewrites the grid, scaled up 16× with LINEAR filtering for soft gradients between
 * tiles (everything else is NEAREST), and drawn over the world with a MULTIPLY blend.
 * The Game camera composites into its own framebuffer, so empty sky stays transparent and the
 * multiply never touches the separately rendered sky.
 */
export class LightMapRenderer {
  private readonly texture: Phaser.Textures.CanvasTexture;
  private readonly image: Phaser.GameObjects.Image;
  private readonly rect = { x0: 0, y0: 0, width: 0, height: 0 };
  private dirty = false;
  private readonly unsubscribe: () => void;

  constructor(
    scene: Phaser.Scene,
    private readonly world: World,
    events: EventBus<SimEvents>,
  ) {
    if (scene.textures.exists(TEXTURE_KEY)) scene.textures.remove(TEXTURE_KEY);
    const texture = scene.textures.createCanvas(TEXTURE_KEY, LIGHT.innerWidth, LIGHT.innerHeight);
    if (!texture) throw new Error('Could not create the light map texture');
    texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
    this.texture = texture;
    this.image = scene.add
      .image(0, 0, TEXTURE_KEY)
      .setOrigin(0, 0)
      .setScale(TILE_SIZE)
      .setBlendMode(Phaser.BlendModes.MULTIPLY)
      .setDepth(Depth.lightMap)
      .setVisible(false);
    this.unsubscribe = events.on('lightUpdated', (r) => {
      Object.assign(this.rect, r);
      this.dirty = true;
    });
  }

  /** Uploads the latest light grid if it changed. Call once per frame. */
  update(): void {
    if (!this.dirty) return;
    this.dirty = false;
    const { world, rect } = this;
    const image = this.texture.imageData;
    const pixels = image.data;
    const texW = image.width;
    pixels.fill(0);
    for (let y = 0; y < rect.height && y < image.height; y++) {
      let src = (rect.y0 + y) * world.width + rect.x0;
      let dst = y * texW * 4;
      for (let x = 0; x < rect.width && x < texW; x++, src++, dst += 4) {
        pixels[dst] = world.lightR[src] ?? 0;
        pixels[dst + 1] = world.lightG[src] ?? 0;
        pixels[dst + 2] = world.lightB[src] ?? 0;
        pixels[dst + 3] = 255;
      }
    }
    this.texture.putData(image, 0, 0);
    this.texture.refresh();
    this.image
      .setPosition(rect.x0 * TILE_SIZE, rect.y0 * TILE_SIZE)
      .setCrop(0, 0, rect.width, rect.height)
      .setVisible(true);
  }

  destroy(): void {
    this.unsubscribe();
  }
}
