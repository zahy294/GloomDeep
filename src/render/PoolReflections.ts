import * as Phaser from 'phaser';
import { LIQUID } from '../data/biomes';
import { TILE_SIZE, WATER_FX } from '../config';
import type { World } from '../sim/world/World';
import { Depth } from './depth';

const FX = WATER_FX.reflection;
/** Candidate pools per frame before the nearest few are picked. */
const MAX_CANDIDATES = 24;
const FIELDS = 4; // first column, last column, surface row, water rows
const TWO_PI = Math.PI * 2;
const CAPTURE_KEY = 'pool-capture';

/**
 * Faint reflections in still surface pools (plan 2.0, High quality). A CaptureFrame placed after
 * the world and before the liquids copies everything drawn so far; each pool then shows a
 * vertically flipped slice of that copy, cropped to the water, with a small sideways ripple.
 * One image (one draw call) per pool, at most `maxSpans`, plus the capture itself. Skipped
 * entirely when no pool is in view.
 */
export class PoolReflections {
  private readonly capture: Phaser.GameObjects.CaptureFrame | null;
  private readonly images: Phaser.GameObjects.Image[] = [];
  private readonly found = new Int32Array(MAX_CANDIDATES * FIELDS);
  private foundCount = 0;

  private readonly textures: Phaser.Textures.TextureManager;

  constructor(
    scene: Phaser.Scene,
    private readonly world: World,
    enabled: boolean,
  ) {
    this.textures = scene.textures;
    if (!enabled || scene.renderer.type !== Phaser.WEBGL) {
      this.capture = null;
      return;
    }
    // CaptureFrame registers its texture by key and refuses a key in use: a previous session's
    // capture texture must go first, or the new frame would draw into nothing.
    if (scene.textures.exists(CAPTURE_KEY)) scene.textures.remove(CAPTURE_KEY);
    this.capture = scene.add
      .captureFrame(CAPTURE_KEY)
      .setDepth(Depth.reflectionCapture)
      .setVisible(false);
    for (let i = 0; i < FX.maxSpans; i++) {
      this.images.push(
        scene.add
          .image(0, 0, CAPTURE_KEY)
          .setOrigin(0, 0)
          .setScrollFactor(0)
          .setScale(1, -1)
          .setDepth(Depth.reflections)
          .setVisible(false),
      );
    }
  }

  update(view: { x: number; y: number; width: number; height: number }, seconds: number): void {
    const capture = this.capture;
    if (!capture) return;
    this.findPools(view);
    // The nearest pools to the middle of the screen get the images.
    const centre = view.x + view.width / 2;
    let used = 0;
    for (const image of this.images) {
      let best = -1;
      let bestDistance = Infinity;
      for (let i = 0; i < this.foundCount; i++) {
        const at = i * FIELDS;
        const first = this.found[at] ?? 0;
        if (first < 0) continue; // already taken
        const middle = (first + (this.found[at + 1] ?? first) + 1) * 0.5 * TILE_SIZE;
        const distance = Math.abs(middle - centre);
        if (distance < bestDistance) {
          bestDistance = distance;
          best = i;
        }
      }
      if (best < 0) {
        image.setVisible(false);
        continue;
      }
      const at = best * FIELDS;
      this.place(image, view, used, seconds, at);
      this.found[at] = -1;
      used++;
    }
    capture.setVisible(used > 0);
  }

  destroy(): void {
    this.capture?.destroy();
    // CaptureFrame does not remove its framebuffer texture itself. (The texture manager is kept
    // from the constructor: at shutdown the game object may no longer know its scene.)
    if (this.textures.exists(CAPTURE_KEY)) this.textures.remove(CAPTURE_KEY);
    for (const image of this.images) image.destroy();
  }

  /** Flips the capture about the pool's surface line and crops it to the water below. */
  private place(
    image: Phaser.GameObjects.Image,
    view: { x: number; y: number; width: number; height: number },
    index: number,
    seconds: number,
    at: number,
  ): void {
    const first = this.found[at] ?? 0;
    const last = this.found[at + 1] ?? first;
    const row = this.found[at + 2] ?? 0;
    const rows = Math.min(this.found[at + 3] ?? 1, FX.maxRows);
    const surfaceY = row * TILE_SIZE - view.y; // screen row of the water surface
    const depthPx = rows * TILE_SIZE;
    const left = Math.max(0, first * TILE_SIZE - view.x);
    const right = Math.min(view.width, (last + 1) * TILE_SIZE - view.x);
    // The mirror shows the scene from `surfaceY - depthPx` up to the surface itself.
    const sourceTop = Math.max(0, surfaceY - depthPx);
    const sourceBottom = Math.min(view.height, surfaceY);
    if (right <= left || sourceBottom <= sourceTop) {
      image.setVisible(false);
      return;
    }
    const phase = seconds * FX.rippleHz * TWO_PI + index * FX.slotPhaseStep;
    image
      .setCrop(left, sourceTop, right - left, sourceBottom - sourceTop)
      .setPosition(Math.round(Math.sin(phase) * FX.rippleAmplitudePx), 2 * surfaceY)
      .setAlpha(FX.alpha * (1 + FX.shimmer * Math.sin(phase * FX.shimmerRate + FX.shimmerPhase)))
      .setVisible(true);
  }

  /**
   * Runs of columns in view whose first liquid cell under open sky is water at the same row:
   * [first column, last column, surface row, water rows].
   */
  private findPools(view: { x: number; y: number; width: number; height: number }): void {
    const { world } = this;
    const x0 = Math.max(0, Math.floor(view.x / TILE_SIZE));
    const x1 = Math.min(world.width - 1, Math.floor((view.x + view.width) / TILE_SIZE));
    this.foundCount = 0;
    let runFirst = -1;
    let runRow = -1;
    let runRows = 0;
    for (let x = x0; x <= x1 + 1; x++) {
      const surface = x <= x1 ? this.surfaceRow(x) : -1;
      const depth = surface < 0 ? 0 : world.groundRow(x) - surface;
      if (runFirst >= 0 && surface !== runRow) {
        this.push(runFirst, x - 1, runRow, runRows);
        runFirst = -1;
      }
      if (surface >= 0) {
        if (runFirst < 0) {
          runFirst = x;
          runRow = surface;
          runRows = depth;
        } else {
          runRows = Math.min(runRows, depth);
        }
      }
    }
  }

  /** Top row of the water pool resting on the ground of column x, or -1 without one. */
  private surfaceRow(x: number): number {
    const { world } = this;
    const ground = world.groundRow(x);
    let y = ground - 1;
    if (y < 1 || world.liquidType[y * world.width + x] !== LIQUID.water) return -1;
    while (y > 0 && world.liquidType[(y - 1) * world.width + x] === LIQUID.water) y--;
    return y;
  }

  private push(first: number, last: number, row: number, rows: number): void {
    if (this.foundCount >= MAX_CANDIDATES) return;
    const at = this.foundCount * FIELDS;
    this.found[at] = first;
    this.found[at + 1] = last;
    this.found[at + 2] = row;
    this.found[at + 3] = rows;
    this.foundCount++;
  }
}
