/**
 * Placeholder player parts (plan 2.9.8): a hooded lamplighter in a green cloak, drawn per part so
 * the game can animate it in code. Frames follow PART_FRAME in src/data/playerParts.ts.
 * Every shape is outlined in the darkest shade of its own ramp (plan 2.9.1), light from top-left.
 */
import { PALETTE, type RampName } from '../../src/data/palette';
import { PART_FRAME } from '../../src/data/playerParts';
import { spriteAsset } from '../../src/data/spriteAssets';
import { createImage, setPixel, type RgbaImage } from './image';

type Shade = 0 | 1 | 2 | 3;

/** One frame being painted: per-pixel ramp + shade, outlined at the end. */
class Canvas {
  readonly ramp: (RampName | null)[];
  readonly shade: Shade[];

  constructor(readonly size: number) {
    this.ramp = new Array<RampName | null>(size * size).fill(null);
    this.shade = new Array<Shade>(size * size).fill(1);
  }

  fill(x0: number, y0: number, w: number, h: number, ramp: RampName, shade: Shade = 2): this {
    for (let y = y0; y < y0 + h; y++) {
      for (let x = x0; x < x0 + w; x++) this.set(x, y, ramp, shade);
    }
    return this;
  }

  set(x: number, y: number, ramp: RampName, shade: Shade): this {
    if (x < 0 || y < 0 || x >= this.size || y >= this.size) return this;
    this.ramp[y * this.size + x] = ramp;
    this.shade[y * this.size + x] = shade;
    return this;
  }

  /** A 3px-wide leg whose x shifts by `lean` pixels between top and bottom rows. */
  leg(top: number, bottom: number, x: number, lean: number, ramp: RampName, boot: RampName): this {
    const rows = bottom - top;
    for (let y = top; y <= bottom; y++) {
      const dx = rows > 0 ? Math.round(((y - top) / rows) * lean) : 0;
      this.fill(x + dx, y, 3, 1, y >= bottom - 2 ? boot : ramp, y >= bottom - 2 ? 1 : 2);
    }
    return this;
  }

  /** Darkens every shape pixel that touches empty space (4-neighbour) into an outline. */
  outline(): this {
    const n = this.size;
    const isEmpty = (x: number, y: number) =>
      x < 0 || y < 0 || x >= n || y >= n || this.ramp[y * n + x] === null;
    const edge: number[] = [];
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        if (this.ramp[y * n + x] === null) continue;
        if (isEmpty(x - 1, y) || isEmpty(x + 1, y) || isEmpty(x, y - 1) || isEmpty(x, y + 1)) {
          edge.push(y * n + x);
        }
      }
    }
    for (const i of edge) this.shade[i] = 0;
    return this;
  }

  draw(out: RgbaImage, ox: number, oy: number): void {
    for (let i = 0; i < this.ramp.length; i++) {
      const ramp = this.ramp[i];
      if (!ramp) continue;
      setPixel(
        out,
        ox + (i % this.size),
        oy + Math.floor(i / this.size),
        PALETTE[ramp][this.shade[i] ?? 1],
      );
    }
  }
}

const SKIN: RampName = 'honey';
const CLOAK: RampName = 'emerald';
const TROUSERS: RampName = 'mud';
const BOOTS: RampName = 'bark';

function legs(kind: 'idle' | 'jump' | 0 | 1 | 2 | 3): Canvas {
  const c = new Canvas(16);
  switch (kind) {
    case 'idle':
      c.leg(4, 15, 4, 0, TROUSERS, BOOTS).leg(4, 15, 9, 0, TROUSERS, BOOTS);
      break;
    case 'jump':
      c.leg(4, 12, 4, -1, TROUSERS, BOOTS).leg(4, 13, 8, 2, TROUSERS, BOOTS);
      break;
    case 0: // contact: right (front) leg forward
      c.leg(4, 15, 5, -3, TROUSERS, BOOTS).leg(4, 15, 8, 3, TROUSERS, BOOTS);
      break;
    case 1: // passing: front leg lifted
      c.leg(4, 15, 6, 0, TROUSERS, BOOTS).leg(4, 13, 7, 1, TROUSERS, BOOTS);
      break;
    case 2: // contact: left (back) leg forward
      c.leg(4, 15, 8, -3, TROUSERS, BOOTS).leg(4, 15, 5, 3, TROUSERS, BOOTS);
      break;
    case 3: // passing: back leg lifted
      c.leg(4, 15, 7, 0, TROUSERS, BOOTS).leg(4, 13, 6, 1, TROUSERS, BOOTS);
      break;
  }
  return c.outline();
}

function body(): Canvas {
  const c = new Canvas(16);
  c.fill(4, 2, 8, 10, CLOAK, 2).fill(3, 12, 10, 4, CLOAK, 1);
  c.fill(5, 3, 2, 6, CLOAK, 3); // light from the top-left
  c.fill(4, 10, 8, 1, 'gold', 2); // belt
  c.outline();
  return c.set(9, 10, 'gold', 3); // buckle glint
}

function head(): Canvas {
  const c = new Canvas(16);
  c.fill(4, 6, 8, 10, SKIN, 3).fill(4, 13, 8, 3, SKIN, 2);
  c.outline();
  return c.set(10, 10, 'tealShadow', 0).set(11, 13, SKIN, 1); // eye, mouth corner
}

function hood(): Canvas {
  const c = new Canvas(16);
  c.fill(3, 3, 10, 5, CLOAK, 1).fill(3, 8, 3, 7, CLOAK, 1).fill(4, 4, 4, 2, CLOAK, 2);
  return c.outline();
}

function arm(front: boolean): Canvas {
  const c = new Canvas(16);
  c.fill(7, 2, 3, 7, CLOAK, front ? 2 : 1).fill(7, 9, 3, 3, SKIN, front ? 3 : 2);
  return c.outline();
}

function lantern(): Canvas {
  const c = new Canvas(16);
  c.fill(7, 2, 3, 2, BOOTS, 1).fill(5, 4, 7, 7, 'gold', 1);
  c.outline();
  c.fill(6, 5, 5, 5, 'mint', 2).fill(7, 6, 3, 3, 'mint', 3);
  return c;
}

/** The `player-parts` placeholder sheet: one row of 16×16 frames in PART_FRAME order. */
export function buildPlayerParts(): RgbaImage {
  const def = spriteAsset('player-parts');
  if (!def) throw new Error('player-parts is missing from SPRITE_ASSETS');
  const frames: [number, Canvas][] = [
    [PART_FRAME.backArm, arm(false)],
    [PART_FRAME.frontArm, arm(true)],
    [PART_FRAME.body, body()],
    [PART_FRAME.head, head()],
    [PART_FRAME.hood, hood()],
    [PART_FRAME.legsIdle, legs('idle')],
    [PART_FRAME.legsJump, legs('jump')],
    [PART_FRAME.lantern, lantern()],
    ...PART_FRAME.legsWalk.map((f, i) => [f, legs(i as 0 | 1 | 2 | 3)] as [number, Canvas]),
  ];
  const out = createImage(def.frameWidth * def.frames, def.frameHeight);
  for (const [frame, canvas] of frames) canvas.draw(out, frame * def.frameWidth, 0);
  return out;
}
