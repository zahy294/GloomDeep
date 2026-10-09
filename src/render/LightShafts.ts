import * as Phaser from 'phaser';
import { SHAFTS, TILE_SIZE } from '../config';
import type { EventBus, SimEvents } from '../sim/events';
import type { World } from '../sim/world/World';
import { Depth } from './depth';
import { beamAlpha, beamLean, findShafts, type Shaft } from './glowMath';
import type { VisualState } from './VisualState';

/** One beam placed for this frame; read by the shaft motes. Pixels, reused every frame. */
export interface PlacedShaft {
  topX: number;
  topY: number;
  lengthPx: number;
  lean: number;
  widthPx: number;
  alpha: number;
  /** Part of the beam (0..1 down its length) that is inside the view vertically. */
  tFrom: number;
  tTo: number;
}

export const SHAFT_TEXTURE = 'light-shaft';

/**
 * White beam gradient, drawn once at boot: narrow and faint at the top, soft sides, fading out
 * towards the bottom (tint and alpha are applied per beam). Smooth on purpose: it is light.
 */
export function makeShaftTexture(textures: Phaser.Textures.TextureManager): void {
  const w = SHAFTS.textureWidth;
  const h = SHAFTS.textureHeight;
  const texture = textures.createCanvas(SHAFT_TEXTURE, w, h);
  if (!texture) return;
  const ctx = texture.context;
  for (let y = 0; y < h; y++) {
    const t = y / (h - 1);
    // Width grows linearly from 1/flare of the texture to all of it.
    const half = (w / 2) * (1 / SHAFTS.flare + (1 - 1 / SHAFTS.flare) * t);
    // Giant-tree beams are ~100 tiles long and only their lower part is on screen, so the profile
    // stays near-constant and only the very ends fade.
    const fadeIn = Math.min(1, t / SHAFTS.fadeInFraction);
    const fadeOut = Math.min(1, (1 - t) / SHAFTS.fadeOutFraction);
    const alpha = fadeIn * fadeOut * (0.7 + 0.3 * (1 - t));
    const gradient = ctx.createLinearGradient(w / 2 - half, 0, w / 2 + half, 0);
    gradient.addColorStop(0, 'rgba(255,255,255,0)');
    gradient.addColorStop(0.5, `rgba(255,255,255,${alpha})`);
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(w / 2 - half, y, half * 2, 1);
  }
  texture.refresh();
  texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
}

const rgbMix = (a: number, b: number, t: number): number => {
  const ch = (shift: number) =>
    Math.round(((a >> shift) & 0xff) * (1 - t) + ((b >> shift) & 0xff) * t) << shift;
  return ch(16) | ch(8) | ch(0);
};

/**
 * Canopy light shafts (plan 2.0): soft additive beams under gaps in the leaf canopy. Gaps are
 * found in the world's canopy arrays for the columns around the view and cached; they are rebuilt
 * when the view leaves the cached range or a tile above the ground changes. One pooled Image per
 * beam, all sharing one gradient texture so they batch into a single draw call.
 */
export class LightShafts {
  /** Beams placed this frame (first `count` entries). */
  readonly placed: PlacedShaft[] = [];
  count = 0;

  private world: World | null = null;
  private cache: Shaft[] = [];
  private cacheFrom = 1;
  private cacheTo = 0;
  private dirty = true;
  private unsubscribe: (() => void) | null = null;
  private readonly images: Phaser.GameObjects.Image[] = [];

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly visual: VisualState,
    private readonly textureKey: string,
  ) {
    for (let i = 0; i < SHAFTS.maxVisible; i++) {
      this.placed.push({
        topX: 0,
        topY: 0,
        lengthPx: 0,
        lean: 0,
        widthPx: 0,
        alpha: 0,
        tFrom: 0,
        tTo: 1,
      });
    }
  }

  attach(world: World, events: EventBus<SimEvents>): void {
    this.unsubscribe?.();
    this.world = world;
    this.dirty = true;
    this.unsubscribe = events.on('tileChanged', (e) => {
      if (e.layer === 'fg' && e.x >= this.cacheFrom && e.x <= this.cacheTo) this.dirty = true;
    });
  }

  destroy(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  update(): void {
    const { visual, world } = this;
    this.count = 0;
    if (!world) return this.hideFrom(0);
    const lean = beamLean(visual.dayFraction);
    const alpha = beamAlpha(visual.daylight, visual.dayFraction, visual.rain, visual.outdoors);
    if (alpha <= 0.002) return this.hideFrom(0);

    const view = visual.view;
    const viewFrom = Math.floor(view.x / TILE_SIZE);
    const viewTo = Math.ceil((view.x + view.width) / TILE_SIZE);
    this.refresh(world, viewFrom, viewTo);

    const day = visual.day;
    const tint = rgbMix(
      SHAFTS.gold,
      (day.sunR << 16) | (day.sunG << 8) | day.sunB,
      SHAFTS.sunTintMix,
    );
    const slant = Math.sqrt(1 + lean * lean);
    const time = visual.realTime;
    let used = 0;
    for (const shaft of this.cache) {
      if (used >= SHAFTS.maxVisible) break;
      const lengthTiles = Math.min(SHAFTS.maxHeightTiles, shaft.bottomRow - shaft.topRow);
      const footX = shaft.x + lean * lengthTiles;
      const pad = SHAFTS.maxWidthTiles * SHAFTS.flare;
      if (Math.max(shaft.x, footX) + pad < viewFrom || Math.min(shaft.x, footX) - pad > viewTo)
        continue;
      const topY = shaft.topRow * TILE_SIZE;
      const lengthPx = lengthTiles * TILE_SIZE;
      const tFrom = Math.min(1, Math.max(0, (view.y - topY) / lengthPx));
      const tTo = Math.min(1, Math.max(0, (view.y + view.height - topY) / lengthPx));
      if (tTo <= tFrom) continue;
      const phase = shaft.x * 1.7;
      const breath = Math.sin(time * SHAFTS.swaySpeed + phase);
      const sway = Math.sin(time * SHAFTS.swaySpeed * 0.7 + phase * 0.6) * SHAFTS.swayAngle;
      const beamLeanNow = lean + sway;
      const widthTiles = Math.min(
        SHAFTS.maxWidthTiles,
        Math.max(SHAFTS.minWidthTiles, shaft.widthTiles + SHAFTS.widthPadTiles),
      );
      const p = this.placed[used];
      if (!p) break;
      p.topX = shaft.x * TILE_SIZE;
      p.topY = shaft.topRow * TILE_SIZE;
      p.lengthPx = lengthTiles * TILE_SIZE;
      p.lean = beamLeanNow;
      p.widthPx = widthTiles * TILE_SIZE;
      p.tFrom = tFrom;
      p.tTo = tTo;
      p.alpha = alpha * (1 - SHAFTS.swayAlpha / 2 + (breath * SHAFTS.swayAlpha) / 2);
      const image = this.image(used);
      image
        .setPosition(p.topX, p.topY)
        .setRotation(-Math.atan(beamLeanNow))
        .setDisplaySize(p.widthPx * SHAFTS.flare, p.lengthPx * slant)
        .setTint(tint)
        .setAlpha(p.alpha)
        .setVisible(true);
      used++;
    }
    this.count = used;
    this.hideFrom(used);
  }

  private refresh(world: World, viewFrom: number, viewTo: number): void {
    if (!this.dirty && viewFrom >= this.cacheFrom && viewTo <= this.cacheTo) return;
    this.cacheFrom = viewFrom - SHAFTS.cacheMarginTiles;
    this.cacheTo = viewTo + SHAFTS.cacheMarginTiles;
    this.cache = findShafts(world, this.cacheFrom, this.cacheTo);
    this.dirty = false;
  }

  private image(i: number): Phaser.GameObjects.Image {
    let image = this.images[i];
    if (!image) {
      image = this.scene.add
        .image(0, 0, this.textureKey)
        .setOrigin(0.5, 0)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setDepth(Depth.glow - 0.5);
      this.images.push(image);
    }
    return image;
  }

  private hideFrom(from: number): void {
    for (let i = from; i < this.images.length; i++) this.images[i]?.setVisible(false);
  }
}
