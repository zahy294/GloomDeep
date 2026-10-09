import * as Phaser from 'phaser';
import { DISPLAY, TILE_SIZE } from '../../config';
import type { PreviewInfo } from '../../data/artManifest';
import { PALETTE } from '../../data/palette';
import { tileId } from '../../data/tiles';
import type { DebugParams } from '../../debugParams';
import { frameBase, tileFrame } from '../../sim/world/autotile';
import { World } from '../../sim/world/World';
import type { UiBridge } from '../../ui/bridge';
import { DEFAULT_PACK_DIR, PackFile, SceneKey, TextureKey } from './keys';

/** Rows of the terrain sample patch: '#' = the material, '.' = air. Shows every kind of edge. */
const TERRAIN_SAMPLE = [
  '..######......##...',
  '.########....####..',
  '###..#####..######.',
  '###..##############',
  '#########.#########',
  '###################',
];

/** Night approximation until the lighting system exists (M3): a cool multiply over everything. */
const NIGHT_TINT = PALETTE.moonSilver[1];
const GROUND_ROWS = 3;
const MARGIN = 16;
/** Magnification of the pixel-inspection copy of sprite frames. */
const PREVIEW_ZOOM = 4;

/**
 * `?scene=art-test&id=<asset>&time=day|night` — shows one cleaned/approved asset in a small world
 * strip, next to the style reference, so Playwright screenshots can be compared (plan 2.9.9).
 * Reads only the pack's `preview/` folder; never used by normal play.
 */
export class ArtTestScene extends Phaser.Scene {
  private previewBase = '';

  constructor(
    private readonly bridge: UiBridge,
    private readonly params: DebugParams,
  ) {
    super(SceneKey.ArtTest);
  }

  preload(): void {
    this.previewBase = `${this.params.pack ?? DEFAULT_PACK_DIR}/${PackFile.preview}`;
    this.load.json('preview-info', `${this.previewBase}preview.json`);
  }

  create(): void {
    this.cameras.main.setBackgroundColor(PALETTE.moonSilver[1]);
    this.drawGround();
    const info = this.cache.json.get('preview-info') as PreviewInfo | undefined;
    const asset = info?.assets.find((a) => a.id === this.params.assetId);
    if (!info || !asset) {
      const ids =
        info?.assets.map((a) => a.id).join(', ') || '(none — run art:import, then art:pack)';
      this.label(`No previewable asset "${this.params.assetId ?? ''}". Available: ${ids}`);
      this.finish();
      return;
    }

    const key = `preview-${asset.id}`;
    this.load.spritesheet(key, `${this.previewBase}${asset.file}`, {
      frameWidth: asset.frameWidth,
      frameHeight: asset.frameHeight,
    });
    if (info.hasStyleReference) {
      this.load.image('style-reference', `${this.previewBase}style-reference.png`);
    }
    this.load.once(Phaser.Loader.Events.COMPLETE, () => {
      if (asset.category === 'terrain' && asset.material) this.drawTerrain(key, asset.material);
      else this.drawFrames(key);
      if (info.hasStyleReference) this.drawReference();
      this.label(
        `${asset.id} · ${asset.category} · ${asset.status} · ${this.isNight() ? 'night' : 'day'}`,
      );
      this.finish();
    });
    this.load.start();
  }

  private groundTop(): number {
    return DISPLAY.height - GROUND_ROWS * TILE_SIZE;
  }

  /** Placeholder-or-approved grass and soil, so the asset is seen against the real tiles. */
  private drawGround(): void {
    // A tiny world so the ground autotiles like real terrain (joined, not a grid of boxes).
    const columns = Math.ceil(DISPLAY.width / TILE_SIZE);
    const world = new World({ width: columns, height: GROUND_ROWS, chunkSize: 64 });
    const grass = tileId('elderglade_grass');
    const soil = tileId('forest_soil');
    for (let y = 0; y < GROUND_ROWS; y++) {
      for (let x = 0; x < columns; x++) world.set(x, y, y === 0 ? grass : soil);
    }
    for (let y = 0; y < GROUND_ROWS; y++) {
      for (let x = 0; x < columns; x++) {
        const frame = tileFrame(world, 'fg', x, y);
        if (frame < 0) continue;
        this.add
          .image(x * TILE_SIZE, this.groundTop() + y * TILE_SIZE, TextureKey.tiles, frame)
          .setOrigin(0, 0);
      }
    }
  }

  /**
   * Every frame of a sprite sheet standing on the ground at true game scale, then the same frames
   * magnified (whole-number zoom) above, for checking individual pixels.
   */
  private drawFrames(key: string): void {
    const texture = this.textures.get(key);
    const frames = texture.frameTotal - 1; // minus Phaser's __BASE frame
    let x = MARGIN * 2;
    for (let i = 0; i < frames; i++) {
      const image = this.add.image(x, this.groundTop(), key, i).setOrigin(0, 1);
      x += image.width + MARGIN;
    }
    x = MARGIN * 2;
    const zoomTop = this.groundTop() - MARGIN * 4;
    for (let i = 0; i < frames; i++) {
      const image = this.add.image(x, zoomTop, key, i).setOrigin(0, 1).setScale(PREVIEW_ZOOM);
      x += image.displayWidth + MARGIN;
    }
  }

  /** A sample patch autotiled with the generated set (frames in autotile.ts order). */
  private drawTerrain(key: string, material: string): void {
    const id = tileId(material);
    const width = TERRAIN_SAMPLE[0]?.length ?? 0;
    const world = new World({ width, height: TERRAIN_SAMPLE.length, chunkSize: 64 });
    TERRAIN_SAMPLE.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) if (row[x] === '#') world.set(x, y, id);
    });
    const left = MARGIN * 2;
    const top = this.groundTop() - TERRAIN_SAMPLE.length * TILE_SIZE;
    for (let y = 0; y < world.height; y++) {
      for (let x = 0; x < world.width; x++) {
        const frame = tileFrame(world, 'fg', x, y);
        if (frame < 0) continue;
        this.add
          .image(left + x * TILE_SIZE, top + y * TILE_SIZE, key, frame - frameBase(id))
          .setOrigin(0, 0);
      }
    }
  }

  /** The style reference at the right, scaled down by whole numbers until it fits. */
  private drawReference(): void {
    const image = this.add.image(DISPLAY.width - MARGIN, MARGIN, 'style-reference').setOrigin(1, 0);
    const maxW = DISPLAY.width / 2 - MARGIN * 2;
    const maxH = this.groundTop() - MARGIN * 2;
    let divisor = 1;
    while (image.width / divisor > maxW || image.height / divisor > maxH) divisor++;
    image.setScale(1 / divisor);
  }

  /** Night approximation for review screenshots (the scene has no lighting system of its own). */
  private isNight(): boolean {
    const t = this.params.time;
    return t === 'night' || t === 'midnight' || t === 'dusk';
  }

  private label(text: string): void {
    this.add.text(MARGIN, MARGIN, text, {
      fontFamily: 'monospace',
      fontSize: '8px',
      color: '#d6e0f0',
    });
  }

  private finish(): void {
    if (this.isNight()) {
      this.add
        .rectangle(0, 0, DISPLAY.width, DISPLAY.height, NIGHT_TINT)
        .setOrigin(0, 0)
        .setBlendMode(Phaser.BlendModes.MULTIPLY);
    }
    this.bridge.set({ screen: 'art-test' });
  }
}
