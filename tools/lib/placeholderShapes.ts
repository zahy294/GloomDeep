/**
 * A tiny shape canvas for placeholder creature sprites (enemies, critters, folk): pixels are
 * palette ramp + shade, drawn as simple shapes and outlined in the darkest shade of their own
 * ramp (plan 2.9.1).
 */
import { PALETTE, type RampName } from '../../src/data/palette';
import { setPixel, type RgbaImage } from './image';

export type Shade = 0 | 1 | 2 | 3;

export class ShapeSprite {
  readonly ramp: (RampName | null)[];
  readonly shade: Shade[];
  /** Pixels that keep their colour through the outline pass (eyes, glints). */
  private readonly keep = new Set<number>();

  constructor(
    readonly width: number,
    readonly height: number = width,
  ) {
    this.ramp = new Array<RampName | null>(width * height).fill(null);
    this.shade = new Array<Shade>(width * height).fill(1);
  }

  set(x: number, y: number, ramp: RampName, shade: Shade, keep = false): this {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return this;
    const i = y * this.width + x;
    this.ramp[i] = ramp;
    this.shade[i] = shade;
    if (keep) this.keep.add(i);
    return this;
  }

  rect(x0: number, y0: number, w: number, h: number, ramp: RampName, shade: Shade = 2): this {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) this.set(x, y, ramp, shade);
    return this;
  }

  /** Filled ellipse with a lighter top-left (light from the top-left). */
  blob(cx: number, cy: number, rx: number, ry: number, ramp: RampName): this {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const nx = (x + 0.5 - cx) / rx;
        const ny = (y + 0.5 - cy) / ry;
        if (nx * nx + ny * ny > 1) continue;
        this.set(x, y, ramp, nx + ny < -0.6 ? 3 : nx + ny > 0.7 ? 1 : 2);
      }
    }
    return this;
  }

  eye(x: number, y: number, ramp: RampName = 'honey'): this {
    return this.set(x, y, ramp, 3, true);
  }

  outline(): this {
    const { width, height } = this;
    const empty = (x: number, y: number) =>
      x < 0 || y < 0 || x >= width || y >= height || this.ramp[y * width + x] === null;
    const edge: number[] = [];
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = y * width + x;
        if (this.ramp[i] === null || this.keep.has(i)) continue;
        if (empty(x - 1, y) || empty(x + 1, y) || empty(x, y - 1) || empty(x, y + 1)) edge.push(i);
      }
    }
    for (const i of edge) this.shade[i] = 0;
    return this;
  }

  draw(out: RgbaImage, ox: number, oy = 0): void {
    for (let i = 0; i < this.ramp.length; i++) {
      const ramp = this.ramp[i];
      if (ramp)
        setPixel(
          out,
          ox + (i % this.width),
          oy + Math.floor(i / this.width),
          PALETTE[ramp][this.shade[i] ?? 1],
        );
    }
  }
}
