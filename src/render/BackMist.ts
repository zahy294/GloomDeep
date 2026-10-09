import * as Phaser from 'phaser';
import { ATMOSPHERE, DISPLAY } from '../config';
import { mulberry32 } from '../sim/random';

const TEXTURE_KEY = 'mist-back';

const smooth = (t: number) => t * t * (3 - 2 * t);

/**
 * Bakes a soft white fog texture: horizontally seamless value noise whose opacity grows towards
 * the bottom, so a band of it has no visible top edge. Idempotent.
 */
export function makeBackMistTexture(textures: Phaser.Textures.TextureManager): void {
  if (textures.exists(TEXTURE_KEY)) return;
  const { width, height, cellsX, cellsY, seed, profileRamp, noiseGain } = ATMOSPHERE.mist.texture;
  const texture = textures.createCanvas(TEXTURE_KEY, width, height);
  if (!texture) return;
  const random = mulberry32(seed);
  const lattice = new Float32Array(cellsX * (cellsY + 1));
  for (let i = 0; i < lattice.length; i++) lattice[i] = random();
  const at = (cx: number, cy: number) => lattice[cy * cellsX + (cx % cellsX)] ?? 0;
  const image = texture.context.createImageData(width, height);
  for (let y = 0; y < height; y++) {
    const fy = (y / height) * cellsY;
    const iy = Math.floor(fy);
    const ty = smooth(fy - iy);
    // Opacity ramps in from the top and stays full near the bottom.
    const profile = smooth(Math.min(1, y / (height * profileRamp)));
    for (let x = 0; x < width; x++) {
      const fx = (x / width) * cellsX;
      const ix = Math.floor(fx);
      const tx = smooth(fx - ix);
      const top = at(ix, iy) * (1 - tx) + at(ix + 1, iy) * tx;
      const bottom = at(ix, iy + 1) * (1 - tx) + at(ix + 1, iy + 1) * tx;
      const noise = top * (1 - ty) + bottom * ty;
      const o = (y * width + x) * 4;
      image.data[o] = 255;
      image.data[o + 1] = 255;
      image.data[o + 2] = 255;
      image.data[o + 3] = Math.round(255 * profile * Math.min(1, noise * noiseGain));
    }
  }
  texture.context.putImageData(image, 0, 0);
  texture.refresh();
  texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
}

/** One tinted, drifting band of baked fog sitting on the lower part of the view. */
export class BackMist {
  readonly sprite: Phaser.GameObjects.TileSprite;
  private colour = -1;
  private offset = 0;

  constructor(
    scene: Phaser.Scene,
    private readonly index: number,
    depth: number,
  ) {
    const { texture, scaleX, scaleY } = ATMOSPHERE.mist;
    const sx = scaleX[index] ?? 1;
    const sy = scaleY[index] ?? 1;
    this.sprite = scene.add
      .tileSprite(0, 0, DISPLAY.width, texture.height * sy, TEXTURE_KEY)
      .setOrigin(0, 1)
      .setScrollFactor(0)
      .setDepth(depth)
      .setTileScale(sx, sy)
      .setVisible(false);
  }

  /** `drift` in px/s (already including wind), `cameraDx` in world px since last frame. */
  update(
    colour: number,
    alpha: number,
    bottom: number,
    drift: number,
    dt: number,
    cameraDx: number,
  ): void {
    const { alphaEpsilon, backCameraParallax, scaleX } = ATMOSPHERE.mist;
    const visible = alpha > alphaEpsilon;
    this.sprite.setVisible(visible);
    if (!visible) return;
    this.sprite.setAlpha(alpha).setY(bottom);
    if (colour !== this.colour) {
      this.colour = colour;
      this.sprite.setTint(colour);
    }
    this.offset += drift * dt + cameraDx * (backCameraParallax[this.index] ?? 0);
    // Tile position is in texture pixels, drift above is in screen pixels.
    this.sprite.tilePositionX = this.offset / (scaleX[this.index] ?? 1);
  }
}
