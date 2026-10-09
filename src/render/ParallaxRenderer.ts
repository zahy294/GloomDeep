import * as Phaser from 'phaser';
import { ATMOSPHERE, DISPLAY, TILE_SIZE } from '../config';
import { SURFACE_BIOMES } from '../data/biomes';
import { biomeVisual } from '../data/biomeVisuals';
import { PARALLAX_LAYERS, PARALLAX_SIZE, parallaxAssetId } from '../data/spriteAssets';
import { colorDistance, parallaxBottom, layerTint } from './atmosphereMath';
import { SURFACE_COUNT } from './biomeBlend';
import type { VisualState } from './VisualState';

interface Layer {
  readonly sprite: Phaser.GameObjects.TileSprite;
  readonly scroll: number;
  readonly haze: number;
  readonly base: number;
  readonly approved: boolean;
  tint: number;
}

/**
 * Distant tree lines (plan 2.2 layer 3): per surface biome, four tinted tiling layers that scroll
 * slower than the world. Each biome's set fades by its blend weight, so crossing a border
 * cross-fades the tree lines. Layer 0 is the farthest.
 */
export class ParallaxRenderer {
  private readonly sets: Layer[][] = [];
  private groundY = Number.NaN;
  private lastTime = 0;

  /** `depthOf(layer)` gives each layer's draw depth so other layers (mist) can interleave. */
  constructor(
    scene: Phaser.Scene,
    private readonly source: { world: { groundRow(x: number): number } },
    depthOf: (layer: number) => number,
    approvedSprites: Readonly<Record<string, string>>,
  ) {
    for (let b = 0; b < SURFACE_COUNT; b++) {
      const key = SURFACE_BIOMES[b]?.key ?? '';
      const parallax = biomeVisual(key).parallax;
      const set: Layer[] = [];
      for (let n = 0; n < PARALLAX_LAYERS && parallax; n++) {
        const sprite = scene.add
          .tileSprite(0, 0, DISPLAY.width, PARALLAX_SIZE.height, parallaxAssetId(key, n))
          .setOrigin(0, 1)
          .setScrollFactor(0)
          .setDepth(depthOf(n))
          .setVisible(false);
        set.push({
          sprite,
          scroll: parallax.scroll[n] ?? 0,
          haze: parallax.haze[n] ?? 0,
          base: parallax.colors[n] ?? 0xffffff,
          approved: approvedSprites[parallaxAssetId(key, n)] === 'approved',
          tint: -1,
        });
      }
      this.sets.push(set);
    }
  }

  update(visual: VisualState): void {
    const { view, weights, features } = visual;
    const dt = Math.min(ATMOSPHERE.maxFrameSeconds, Math.max(0, visual.realTime - this.lastTime));
    this.lastTime = visual.realTime;

    // The remembered ground line under the camera, smoothed so hills do not jolt the tree lines.
    const columns = this.source.world;
    const centreTile = Math.floor((view.x + view.width / 2) / TILE_SIZE);
    const ground = columns.groundRow(Math.max(0, centreTile)) * TILE_SIZE;
    const k = 1 - Math.exp(-dt / ATMOSPHERE.parallax.groundSmoothSeconds);
    this.groundY = Number.isNaN(this.groundY) ? ground : this.groundY + (ground - this.groundY) * k;
    const below = view.y + view.height / 2 - this.groundY;

    const first = Math.max(0, PARALLAX_LAYERS - features.parallaxLayers);
    for (let b = 0; b < this.sets.length; b++) {
      const set = this.sets[b] ?? [];
      // Surface weights already sum to `outdoors`, so this fades both across borders and underground.
      const alpha = weights[b] ?? 0;
      const show = alpha > ATMOSPHERE.parallax.minWeight;
      for (let n = 0; n < set.length; n++) {
        const layer = set[n];
        if (!layer) continue;
        const visible = show && n >= first;
        layer.sprite.setVisible(visible);
        if (!visible) continue;
        layer.sprite.setAlpha(alpha);
        layer.sprite.setY(parallaxBottom(view.height, below, n));
        layer.sprite.tilePositionX = view.x * layer.scroll;
        const tint = layerTint(
          layer.approved,
          layer.base,
          layer.haze,
          visual.day.skyHorizon,
          visual.daylight,
        );
        if (layer.tint < 0 || colorDistance(tint, layer.tint) >= ATMOSPHERE.parallax.tintEpsilon) {
          layer.tint = tint;
          layer.sprite.setTint(tint);
        }
      }
    }
  }
}
