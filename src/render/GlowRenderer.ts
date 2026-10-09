import * as Phaser from 'phaser';
import { GLOW, TILE_SIZE } from '../config';
import { lensByKey } from '../data/lenses';
import { lightByKey, type LightDef } from '../data/lights';
import { TILES } from '../data/tiles';
import type { Player } from '../sim/entities/Player';
import { lanternLit } from '../sim/systems/LanternSystem';
import type { World } from '../sim/world/World';
import { flickerFactor } from '../workers/lighting/computeLight';
import { Depth } from './depth';

/** Light of each tile id (emissive tiles only). */
const TILE_LIGHT: readonly (LightDef | null)[] = TILES.map((t) =>
  t.light ? lightByKey(t.light) : null,
);
const LANTERN_LIGHT = lightByKey('lantern_glow');
const GLOW_TEXTURE_PX = 64;
const rgb = (c: readonly [number, number, number]) => (c[0] << 16) | (c[1] << 8) | c[2];

/**
 * Additive glow pass (plan 2.3): a soft halo over every emissive tile in view and around the
 * lantern, drawn above the light map so light sources stay luminous in the dark. Halos flicker in
 * step with the light grid. Skipped entirely on Low quality.
 */
export class GlowRenderer {
  private readonly pool: Phaser.GameObjects.Image[] = [];
  private used = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly world: World,
    private readonly player: Player,
    private readonly textureKey: string,
    private readonly enabled: boolean,
  ) {}

  /** `view`: camera world rectangle (px); `time`: simulation seconds (flicker); `hand`: lantern px. */
  update(
    view: { x: number; y: number; width: number; height: number },
    time: number,
    handX: number,
    handY: number,
  ): void {
    this.used = 0;
    if (this.enabled) {
      const { world } = this;
      const tx0 = Math.max(0, Math.floor(view.x / TILE_SIZE) - 1);
      const ty0 = Math.max(0, Math.floor(view.y / TILE_SIZE) - 1);
      const tx1 = Math.min(world.width - 1, Math.ceil((view.x + view.width) / TILE_SIZE) + 1);
      const ty1 = Math.min(world.height - 1, Math.ceil((view.y + view.height) / TILE_SIZE) + 1);
      for (let y = ty0; y <= ty1; y++) {
        for (let x = tx0; x <= tx1; x++) {
          const light = TILE_LIGHT[world.fg[y * world.width + x] ?? 0];
          if (!light) continue;
          const alpha = GLOW.tileAlpha * flickerFactor(light.flicker, time, x, y);
          this.halo((x + 0.5) * TILE_SIZE, (y + 0.5) * TILE_SIZE, light, rgb(light.color), alpha);
        }
      }
      if (lanternLit(this.player)) {
        const lens = lensByKey(this.player.lens);
        this.halo(handX, handY, LANTERN_LIGHT, rgb(lens.color), GLOW.lanternAlpha);
      }
    }
    for (let i = this.used; i < this.pool.length; i++) this.pool[i]?.setVisible(false);
  }

  private halo(x: number, y: number, light: LightDef, tint: number, alpha: number): void {
    // The glow scene starts a frame after the game scene; add sprites once it is running.
    if (this.used >= GLOW.maxSprites || !this.scene.sys.isActive()) return;
    let image = this.pool[this.used];
    if (!image) {
      image = this.scene.add
        .image(0, 0, this.textureKey)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setDepth(Depth.glow);
      this.pool.push(image);
    }
    this.used++;
    const size = light.radius * TILE_SIZE * GLOW.sizePerRadius;
    image
      .setPosition(x, y)
      .setScale(size / GLOW_TEXTURE_PX)
      .setTint(tint)
      .setAlpha(alpha)
      .setVisible(true);
  }
}
