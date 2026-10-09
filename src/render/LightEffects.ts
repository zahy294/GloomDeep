import * as Phaser from 'phaser';
import { GLOAM, LIGHT_FX, TILE_SIZE } from '../config';
import { lightByKey } from '../data/lights';
import { TILES } from '../data/tiles';
import { flareStrength, type Flare } from '../sim/entities/Flare';
import type { EventBus, SimEvents } from '../sim/events';
import { Depth } from './depth';
import { itemIcon } from './itemIcons';
import { itemId } from '../data/items';
import { TextureKey } from './scenes/keys';

const FLARE_ICON = itemIcon(itemId('flare'));
const FLARE_COLOR = rgb(lightByKey('flare').color);
/** Per tile id: its light colour (placing it rings in that colour), or -1. */
const TILE_LIGHT_COLOR = TILES.map((t) => (t.light ? rgb(lightByKey(t.light).color) : -1));
const REVEAL_COLOR = rgb(lightByKey('spirit').color);

function rgb(c: readonly number[]): number {
  return ((c[0] ?? 0) << 16) | ((c[1] ?? 0) << 8) | (c[2] ?? 0);
}

interface Ring {
  image: Phaser.GameObjects.Image;
  age: number;
  /** Final radius in pixels. */
  radius: number;
  duration: number;
}

/**
 * Light you place or throw (plan 2.8 "Placing light: a ring of light expands outward, nearby
 * Gloam visibly shrinks back"; M7 flares):
 * - a ring in the light's colour expands over the Gloam burst radius when a light tile is placed,
 *   and a small cyan one where the Azure lens reveals a tile;
 * - flares are drawn as their item icon in the world, with a flickering additive halo.
 * Rings and halos live in the Glow scene (additive, above the light map).
 */
export class LightEffects {
  private readonly rings: Ring[] = [];
  private readonly flareImages: Phaser.GameObjects.Image[] = [];
  private readonly flareHalos: Phaser.GameObjects.Image[] = [];
  private readonly unsubscribe: (() => void)[];

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly glowScene: Phaser.Scene,
    events: EventBus<SimEvents>,
    private readonly flares: readonly Flare[],
  ) {
    this.unsubscribe = [
      events.on('tilePlaced', ({ x, y, id, layer }) => {
        const color = TILE_LIGHT_COLOR[id] ?? -1;
        if (layer === 'fg' && color >= 0) {
          this.ring(x, y, color, GLOAM.burstRadius * TILE_SIZE, LIGHT_FX.ringSeconds);
        }
      }),
      events.on('tileRevealed', ({ x, y }) => {
        this.ring(x, y, REVEAL_COLOR, LIGHT_FX.revealRingRadius, LIGHT_FX.revealRingSeconds);
      }),
    ];
  }

  update(alpha: number, dt: number, time: number): void {
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const ring = this.rings[i];
      if (!ring) continue;
      ring.age += dt;
      const t = ring.age / ring.duration;
      if (t >= 1) {
        ring.image.destroy();
        this.rings.splice(i, 1);
        continue;
      }
      // Ease out: fast at first, slowing as it reaches the edge of the burst.
      const eased = 1 - (1 - t) * (1 - t);
      ring.image.setScale((ring.radius * 2 * eased) / LIGHT_FX.ringTexturePx).setAlpha(1 - t);
    }
    this.updateFlares(alpha, time);
  }

  destroy(): void {
    for (const off of this.unsubscribe) off();
    for (const ring of this.rings) ring.image.destroy();
    this.rings.length = 0;
  }

  private ring(tx: number, ty: number, color: number, radius: number, duration: number): void {
    const image = this.glowScene.add
      .image((tx + 0.5) * TILE_SIZE, (ty + 0.5) * TILE_SIZE, TextureKey.ring)
      .setTint(color)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setScale(0);
    this.rings.push({ image, age: 0, radius, duration });
  }

  private updateFlares(alpha: number, time: number): void {
    while (this.flareImages.length < this.flares.length && FLARE_ICON) {
      this.flareImages.push(
        this.scene.add
          .image(0, 0, FLARE_ICON.texture, FLARE_ICON.frame)
          .setDisplaySize(LIGHT_FX.flareSpritePx, LIGHT_FX.flareSpritePx)
          .setDepth(Depth.entities),
      );
      this.flareHalos.push(
        this.glowScene.add
          .image(0, 0, TextureKey.glow)
          .setTint(FLARE_COLOR)
          .setBlendMode(Phaser.BlendModes.ADD),
      );
    }
    for (let i = 0; i < this.flareImages.length; i++) {
      const image = this.flareImages[i];
      const halo = this.flareHalos[i];
      const flare = this.flares[i];
      if (!image || !halo) continue;
      if (!flare) {
        image.setVisible(false);
        halo.setVisible(false);
        continue;
      }
      const b = flare.body;
      const x = Math.round(flare.prevX + (b.x - flare.prevX) * alpha + b.width / 2);
      const y = Math.round(flare.prevY + (b.y - flare.prevY) * alpha + b.height / 2);
      const k = flareStrength(flare);
      const flicker =
        1 -
        LIGHT_FX.flareHaloFlicker *
          (0.5 +
            0.5 * Math.sin(time * LIGHT_FX.flareFlickerSpeed + i * LIGHT_FX.flareFlickerPhase));
      image.setPosition(x, y).setVisible(true).setRotation(Math.atan2(b.vy, b.vx));
      halo
        .setPosition(x, y)
        .setVisible(k > 0)
        .setAlpha(k * flicker)
        .setDisplaySize(LIGHT_FX.flareHaloPx * k, LIGHT_FX.flareHaloPx * k);
    }
  }
}
