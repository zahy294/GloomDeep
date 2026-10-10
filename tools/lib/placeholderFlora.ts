/**
 * Placeholder flora, saplings and particles (plan 2.9.1): code-drawn so the forest has plants
 * before real art exists. 1 px outlines in the darkest shade of each shape's own ramp, flat 2-3
 * tone shading, light from the top-left, palette colours only, no anti-aliasing.
 * Frame order follows `decor.frame` in src/data/tiles.ts and PARTICLE_FRAME in spriteAssets.ts.
 */
import { PALETTE, type RampName } from '../../src/data/palette';
import { PARTICLE_FRAME, spriteAsset } from '../../src/data/spriteAssets';
import { createImage, setPixel, type RgbaImage } from './image';

type Shade = 0 | 1 | 2 | 3;

/** One frame being painted: per-pixel ramp + shade, outlined on request. */
export class PixelCanvas {
  readonly ramp: (RampName | null)[];
  readonly shade: Shade[];

  constructor(
    readonly width: number,
    readonly height: number,
  ) {
    this.ramp = new Array<RampName | null>(width * height).fill(null);
    this.shade = new Array<Shade>(width * height).fill(1);
  }

  set(x: number, y: number, ramp: RampName, shade: Shade): this {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return this;
    this.ramp[y * this.width + x] = ramp;
    this.shade[y * this.width + x] = shade;
    return this;
  }

  clear(x: number, y: number): this {
    if (x >= 0 && y >= 0 && x < this.width && y < this.height) this.ramp[y * this.width + x] = null;
    return this;
  }

  has(x: number, y: number): boolean {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return false;
    return this.ramp[y * this.width + x] !== null;
  }

  rect(x0: number, y0: number, w: number, h: number, ramp: RampName, shade: Shade): this {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) this.set(x, y, ramp, shade);
    return this;
  }

  /** Filled ellipse. */
  ellipse(cx: number, cy: number, rx: number, ry: number, ramp: RampName, shade: Shade): this {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x - cx) / rx;
        const dy = (y - cy) / ry;
        if (dx * dx + dy * dy <= 1) this.set(x, y, ramp, shade);
      }
    }
    return this;
  }

  /** Bresenham line; `shades` are picked along its length (first = start). */
  line(
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    ramp: RampName,
    shades: readonly Shade[] = [2],
  ): this {
    x0 = Math.round(x0);
    y0 = Math.round(y0);
    x1 = Math.round(x1);
    y1 = Math.round(y1);
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
    for (let i = 0; i <= steps; i++) {
      const t = steps === 0 ? 0 : i / steps;
      const x = x0 + (x1 - x0) * t;
      const y = y0 + (y1 - y0) * t;
      this.set(x, y, ramp, shades[Math.min(shades.length - 1, Math.floor(t * shades.length))] ?? 2);
    }
    return this;
  }

  /** Darkens every shape pixel that touches empty space (4-neighbour) into an outline. */
  outline(): this {
    const edge: number[] = [];
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        if (!this.has(x, y)) continue;
        if (
          !this.has(x - 1, y) ||
          !this.has(x + 1, y) ||
          !this.has(x, y - 1) ||
          !this.has(x, y + 1)
        ) {
          edge.push(y * this.width + x);
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
        ox + (i % this.width),
        oy + Math.floor(i / this.width),
        PALETTE[ramp][this.shade[i] ?? 1],
      );
    }
  }
}

/** Stable integer hash used for texture noise, so frames are identical on every run. */
function noise(x: number, y: number, seed: number): number {
  let h = seed ^ Math.imul(x + 1, 0x27d4eb2d) ^ Math.imul(y + 1, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** The ground frame is 16 wide; plants are centred on this column pair. */
const FLORA_W = 16;
const FLORA_H = 32;
const BASE = FLORA_H - 1;

function ground(): PixelCanvas {
  return new PixelCanvas(FLORA_W, FLORA_H);
}

function grassTuft(): PixelCanvas {
  const c = ground();
  const blades: [number, number][] = [
    [4, 26],
    [6, 22],
    [8, 20],
    [10, 23],
    [12, 27],
  ];
  for (const [x, top] of blades) c.line(8, BASE, x, top, 'leaf', [1, 2, 3]);
  c.line(7, BASE, 7, 26, 'leaf', [1, 2]);
  return c;
}

function fern(): PixelCanvas {
  const c = ground();
  c.line(8, BASE, 8, 17, 'emerald', [1, 1, 2]);
  for (let i = 0; i < 6; i++) {
    const y = 28 - i * 2;
    const len = 6 - Math.floor(i * 0.8);
    // Fronds arch out and droop; the lit (left) side is brighter.
    c.line(8, y, 8 - len, y - 1, 'emerald', [2, 3, 3]).set(8 - len, y, 'emerald', 3);
    c.line(8, y, 8 + len, y - 1, 'emerald', [2, 2, 2]).set(8 + len, y, 'emerald', 2);
  }
  c.set(8, 16, 'emerald', 3);
  return c;
}

function wildflower(): PixelCanvas {
  const c = ground();
  c.line(8, BASE, 8, 19, 'leaf', [1, 2]);
  c.line(8, 28, 5, 25, 'leaf', [2, 3]);
  c.line(8, 25, 11, 23, 'leaf', [2, 3]);
  // Head: gold petals round a honey centre.
  c.rect(7, 15, 3, 5, 'gold', 2).rect(6, 16, 5, 3, 'gold', 2);
  c.outline();
  c.set(8, 17, 'honey', 3).set(7, 16, 'gold', 3).set(6, 17, 'gold', 3);
  return c;
}

function moonpetalBloom(): PixelCanvas {
  const c = ground();
  c.line(8, BASE, 8, 21, 'leaf', [1, 2]);
  c.line(8, 28, 5, 26, 'leaf', [1, 2]);
  c.line(8, 26, 11, 24, 'leaf', [1, 2]);
  // Three upright petals around a rose core.
  c.rect(7, 11, 3, 10, 'moonSilver', 3);
  c.rect(5, 14, 2, 7, 'moonSilver', 2).rect(10, 14, 2, 7, 'moonSilver', 2);
  c.rect(4, 15, 1, 4, 'moonSilver', 2).rect(12, 15, 1, 4, 'moonSilver', 2);
  c.outline();
  c.rect(7, 17, 3, 3, 'rose', 3).set(8, 18, 'rose', 2);
  c.set(7, 12, 'moonSilver', 3).set(7, 13, 'moonSilver', 3);
  return c;
}

function silverGrass(): PixelCanvas {
  const c = ground();
  const blades: [number, number][] = [
    [3, 14],
    [5, 8],
    [7, 3],
    [8, 6],
    [10, 5],
    [12, 10],
  ];
  for (const [x, top] of blades) c.line(8, BASE, x, top, 'moonSilver', [1, 2, 3]);
  return c;
}

function mireReed(): PixelCanvas {
  const c = ground();
  // Blades first, then the cattail heads on top.
  for (const [x, top] of [
    [4, 18],
    [12, 20],
  ] as const) {
    c.line(x < 8 ? 6 : 10, BASE, x, top, 'moss', [1, 2, 2]);
  }
  const reeds: [number, number, number][] = [
    [6, 25, 4],
    [8, 20, 3],
    [10, 27, 2],
  ];
  for (const [x, top] of reeds) c.line(x, BASE, x, top, 'mud', [2, 2, 3]);
  // Cattail heads (brown, outlined).
  const heads: [number, number][] = [
    [8, 5],
    [6, 8],
    [10, 11],
  ];
  const head = ground();
  for (const [x, top] of heads) head.rect(x - 1, top, 2, 5, 'bark', 2).set(x, top - 1, 'bark', 2);
  head.outline();
  for (const [x, top] of heads) {
    c.line(x, BASE, x, top + 5, 'moss', [1, 2, 2]);
    c.set(x - 1, top + 1, 'bark', 3);
  }
  for (let i = 0; i < head.ramp.length; i++) {
    const ramp = head.ramp[i];
    if (ramp) c.set(i % FLORA_W, Math.floor(i / FLORA_W), ramp, head.shade[i] ?? 1);
  }
  return c;
}

function toadstool(): PixelCanvas {
  const c = ground();
  // Dome cap: the upper half of an ellipse, flat underneath.
  c.ellipse(8, 26, 5.5, 4.5, 'rose', 2);
  for (let y = 27; y < FLORA_H; y++) for (let x = 0; x < FLORA_W; x++) c.clear(x, y);
  c.rect(7, 27, 3, 5, 'moonSilver', 2);
  c.outline();
  c.set(6, 23, 'rose', 3).set(7, 23, 'rose', 3).set(5, 24, 'rose', 3);
  c.set(7, 25, 'moonSilver', 3).set(10, 24, 'moonSilver', 3).set(8, 23, 'moonSilver', 3);
  return c;
}

function glowcapSprout(): PixelCanvas {
  const c = ground();
  // A big and a small cap side by side, both luminous, on pale stems.
  for (const [cx, cy, r] of [
    [6, 25, 3],
    [11, 28, 2],
  ] as const) {
    c.ellipse(cx, cy, r + 0.5, r, 'rose', 2);
    for (let y = cy + 1; y < FLORA_H; y++)
      for (let x = cx - r - 1; x <= cx + r + 1; x++) c.clear(x, y);
    c.rect(cx, cy + 1, 1, FLORA_H - cy - 1, 'moonSilver', 2);
  }
  c.outline();
  c.set(5, 24, 'rose', 3).set(6, 24, 'rose', 3).set(11, 27, 'rose', 3).set(7, 25, 'moonSilver', 3);
  return c;
}

function hangingMoss(): PixelCanvas {
  const c = ground();
  c.rect(2, 0, 12, 2, 'moss', 1); // clump pressed against the ceiling
  const lengths = [9, 14, 6, 20, 11, 16, 7, 12, 5, 10, 8, 13];
  lengths.forEach((len, i) => {
    const x = 2 + i;
    for (let y = 2; y < 2 + len; y++) {
      const shade: Shade = y > len - 2 ? 3 : noise(x, y, 5) > 0.6 ? 2 : 1;
      c.set(x, y, 'moss', shade);
    }
    // Ragged side wisps.
    if (len > 9 && i % 2 === 0) c.set(x + 1, 2 + len - 3, 'moss', 2);
  });
  c.set(2, 1, 'moss', 2).set(5, 1, 'moss', 2).set(9, 1, 'moss', 2);
  return c;
}

function hangingVine(): PixelCanvas {
  const c = ground();
  const wobble = (y: number) => Math.round(Math.sin(y / 2.6) * 1.5);
  for (let y = 0; y < 24; y++) c.set(8 + wobble(y), y, 'leaf', y % 6 < 3 ? 1 : 2);
  for (let y = 0; y < 14; y++) c.set(4 + wobble(y + 3), y, 'moss', 1);
  // Alternating leaves with a lit upper edge.
  for (const [y, side] of [
    [5, -1],
    [10, 1],
    [15, -1],
    [20, 1],
  ] as const) {
    const x = 8 + wobble(y) + side * 2;
    c.rect(Math.min(x, 8 + wobble(y) + side), y, 2, 2, 'leaf', 2);
    c.set(x, y, 'leaf', 3);
    c.set(x + side, y + 2, 'leaf', 1);
  }
  c.set(8 + wobble(24), 24, 'leaf', 3).set(8 + wobble(25), 25, 'leaf', 3);
  return c;
}

function glowmossTuft(): PixelCanvas {
  const c = ground();
  c.ellipse(8, BASE - 1, 6, 3, 'mint', 2);
  for (let y = BASE; y < FLORA_H; y++) c.rect(1, y, 14, 1, 'mint', 2);
  c.outline();
  for (const [x, top] of [
    [4, 26],
    [7, 25],
    [10, 26],
    [12, 28],
  ] as const) {
    c.line(x, 29, x, top, 'mint', [2, 3]);
  }
  c.set(6, 29, 'mint', 3).set(9, 29, 'mint', 3).set(5, 30, 'mint', 3);
  return c;
}

/** One faceted crystal: left face lit, right face shaded, pointed tip, outlined. */
function crystal(
  c: PixelCanvas,
  cx: number,
  base: number,
  w: number,
  h: number,
  lean: number,
): void {
  for (let t = 0; t < h; t++) {
    const y = base - t;
    const taper = t > h - w ? Math.max(1, w - (t - (h - w)) * 2) : w;
    const x0 = Math.round(cx - taper / 2 + (lean * t) / h);
    for (let i = 0; i < taper; i++) c.set(x0 + i, y, 'cyan', i < taper / 2 ? 2 : 1);
  }
}

function crystalShard(): PixelCanvas {
  const c = ground();
  crystal(c, 5, BASE, 5, 12, -1);
  crystal(c, 11, BASE, 4, 8, 1);
  crystal(c, 8, BASE, 6, 19, 0);
  c.outline();
  // Highlights along the lit edges.
  for (let y = 14; y < 24; y += 3) c.set(6, y, 'cyan', 3).set(6, y + 1, 'cyan', 3);
  c.set(3, 24, 'cyan', 3).set(3, 25, 'cyan', 3).set(10, 27, 'cyan', 3);
  return c;
}

function emberBloom(): PixelCanvas {
  const c = ground();
  c.line(8, BASE, 8, 20, 'bark', [1, 2]);
  c.line(8, 28, 5, 26, 'bark', [1, 2]);
  c.line(8, 26, 11, 24, 'bark', [1, 2]);
  // Spiky petals round a bright core.
  c.rect(7, 13, 3, 8, 'ember', 2);
  c.rect(5, 15, 7, 4, 'ember', 2);
  c.set(5, 14, 'ember', 2).set(11, 14, 'ember', 2).set(4, 17, 'ember', 2).set(12, 17, 'ember', 2);
  c.set(8, 12, 'ember', 3).set(8, 11, 'ember', 2);
  c.outline();
  c.rect(7, 16, 3, 2, 'honey', 3)
    .set(8, 15, 'ember', 3)
    .set(6, 16, 'ember', 3)
    .set(7, 14, 'ember', 3);
  return c;
}

/** A Lumen bloom, closed: a cyan bud wrapped in leaves. */
function lumenBloom(): PixelCanvas {
  const c = ground();
  c.line(8, BASE, 8, 20, 'mint', [1, 2]);
  c.line(8, 28, 5, 26, 'mint', [1, 2]);
  c.line(8, 26, 11, 25, 'mint', [1, 2]);
  c.ellipse(8, 17, 2, 4, 'cyan', 1);
  c.outline();
  c.set(8, 15, 'cyan', 2).set(7, 16, 'cyan', 2);
  return c;
}

/** A Lumen bloom, open: wide glowing petals round a bright heart. */
function lumenBloomOpen(): PixelCanvas {
  const c = ground();
  c.line(8, BASE, 8, 21, 'mint', [1, 2]);
  c.line(8, 28, 5, 26, 'mint', [1, 2]);
  c.line(8, 26, 11, 25, 'mint', [1, 2]);
  c.ellipse(8, 17, 6, 3, 'cyan', 3);
  c.ellipse(8, 14, 3, 4, 'cyan', 2);
  c.outline();
  c.rect(7, 16, 3, 2, 'mint', 3).set(8, 15, 'cyan', 3);
  return c;
}

/** A small pale fairy-ring mushroom with a rose cap. */
function fairyMushroom(): PixelCanvas {
  const c = ground();
  c.rect(7, 26, 2, 6, 'moonSilver', 3);
  c.ellipse(8, 25, 4, 2, 'rose', 2);
  c.outline();
  c.set(6, 24, 'rose', 3).set(9, 25, 'moonSilver', 3);
  return c;
}

const FLORA_BUILDERS: readonly (() => PixelCanvas)[] = [
  grassTuft,
  fern,
  wildflower,
  moonpetalBloom,
  silverGrass,
  mireReed,
  toadstool,
  glowcapSprout,
  hangingMoss,
  hangingVine,
  glowmossTuft,
  crystalShard,
  emberBloom,
  lumenBloom,
  lumenBloomOpen,
  fairyMushroom,
];

function requireAsset(id: string) {
  const def = spriteAsset(id);
  if (!def) throw new Error(`${id} is missing from SPRITE_ASSETS`);
  return def;
}

/** The `flora` sheet: one row of 16x32 frames in decor-frame order. */
export function buildFlora(): RgbaImage {
  const def = requireAsset('flora');
  if (FLORA_BUILDERS.length !== def.frames) throw new Error('flora frame count mismatch');
  const out = createImage(def.frameWidth * def.frames, def.frameHeight);
  FLORA_BUILDERS.forEach((build, i) => build().draw(out, i * def.frameWidth, 0));
  return out;
}

// --- Saplings ---------------------------------------------------------------------------------

const SAP_W = 48;
const SAP_H = 80;
const SAP_BASE = SAP_H - 1;
const SAP_MID = 24;

/** A rounded crown shaded from a light point at its upper left, with leafy dither between tones. */
function crown(
  c: PixelCanvas,
  ramp: RampName,
  parts: readonly (readonly [number, number, number, number])[],
  seed: number,
): void {
  const bounds = parts.reduce(
    (b, [cx, cy, rx, ry]) => ({
      x0: Math.min(b.x0, cx - rx),
      y0: Math.min(b.y0, cy - ry),
      x1: Math.max(b.x1, cx + rx),
      y1: Math.max(b.y1, cy + ry),
    }),
    { x0: 99, y0: 99, x1: -99, y1: -99 },
  );
  const lx = bounds.x0 + (bounds.x1 - bounds.x0) * 0.32;
  const ly = bounds.y0 + (bounds.y1 - bounds.y0) * 0.28;
  const reach = Math.max(bounds.x1 - bounds.x0, bounds.y1 - bounds.y0) * 0.5;
  for (const [cx, cy, rx, ry] of parts) c.ellipse(cx, cy, rx, ry, ramp, 2);
  for (let y = 0; y < c.height; y++) {
    for (let x = 0; x < c.width; x++) {
      if (!c.has(x, y) || c.ramp[y * c.width + x] !== ramp) continue;
      const d = Math.hypot(x - lx, y - ly) / reach + (noise(x, y, seed) - 0.5) * 0.35;
      c.shade[y * c.width + x] = d < 0.35 ? 3 : d < 0.85 ? 2 : 1;
    }
  }
}

function trunk(
  c: PixelCanvas,
  x: number,
  topY: number,
  width: number,
  ramp: RampName,
  flare: number,
): void {
  for (let y = topY; y <= SAP_BASE; y++) {
    const widen = Math.max(0, y - (SAP_BASE - 6)) >= 4 ? flare : 0;
    const w = width + widen * 2;
    const x0 = x - Math.floor(w / 2);
    for (let i = 0; i < w; i++) c.set(x0 + i, y, ramp, i < w / 2 ? 2 : 1);
  }
}

function elderSapling(): PixelCanvas {
  const c = new PixelCanvas(SAP_W, SAP_H);
  trunk(c, SAP_MID, 40, 5, 'bark', 1);
  c.line(SAP_MID, 52, SAP_MID - 8, 44, 'bark', [2]);
  c.line(SAP_MID, 50, SAP_MID + 8, 42, 'bark', [1]);
  crown(
    c,
    'leaf',
    [
      [24, 28, 15, 13],
      [13, 38, 9, 8],
      [35, 38, 9, 8],
      [24, 18, 10, 8],
    ],
    11,
  );
  return c.outline();
}

function moonbirchSapling(): PixelCanvas {
  const c = new PixelCanvas(SAP_W, SAP_H);
  trunk(c, SAP_MID, 24, 3, 'moonSilver', 0);
  c.line(SAP_MID, 48, SAP_MID - 7, 38, 'moonSilver', [2]);
  c.line(SAP_MID, 40, SAP_MID + 6, 31, 'moonSilver', [2]);
  crown(
    c,
    'mint',
    [
      [24, 22, 9, 17],
      [16, 32, 6, 8],
      [32, 28, 6, 9],
    ],
    23,
  );
  c.outline();
  // Dark birch marks on the pale trunk (placed after the outline so they stay visible).
  for (const y of [52, 58, 63, 68, 73]) {
    c.rect(SAP_MID - 1, y, 2, 1, 'stone', 1);
    if (y % 2 === 0) c.set(SAP_MID, y + 1, 'stone', 0);
  }
  return c;
}

function willowSapling(): PixelCanvas {
  const c = new PixelCanvas(SAP_W, SAP_H);
  trunk(c, SAP_MID, 28, 5, 'bark', 1);
  c.line(SAP_MID, 40, SAP_MID - 10, 32, 'bark', [1]);
  c.line(SAP_MID, 38, SAP_MID + 10, 30, 'bark', [2]);
  crown(
    c,
    'moss',
    [
      [24, 22, 15, 8],
      [14, 26, 8, 5],
      [34, 26, 8, 5],
    ],
    37,
  );
  c.outline();
  // Drooping strands hang from the dome's rim, longest at the sides; 1 px wide so unoutlined.
  const strands: [number, number][] = [
    [10, 42],
    [13, 56],
    [16, 48],
    [19, 62],
    [29, 60],
    [32, 46],
    [35, 57],
    [38, 40],
  ];
  for (const [x, bottom] of strands) {
    for (let y = 26; y <= bottom; y++) {
      const sway = Math.round(Math.sin((y + x) / 4));
      const shade: Shade = y > bottom - 3 ? 3 : y % 5 === 0 ? 2 : 1;
      c.set(x + sway, y, 'moss', shade);
    }
  }
  return c;
}

/** The `saplings` sheet: 48x80 frames, trunk base centred on the bottom edge. */
export function buildSaplings(): RgbaImage {
  const def = requireAsset('saplings');
  const builders = [elderSapling, moonbirchSapling, willowSapling];
  if (builders.length !== def.frames) throw new Error('sapling frame count mismatch');
  const out = createImage(def.frameWidth * def.frames, def.frameHeight);
  builders.forEach((build, i) => build().draw(out, i * def.frameWidth, 0));
  return out;
}

// --- Particles --------------------------------------------------------------------------------

type Dot = readonly [number, number, RampName, Shade];

const PARTICLE_DOTS: Record<number, readonly Dot[]> = {
  [PARTICLE_FRAME.leaf]: [
    [3, 2, 'leaf', 0],
    [4, 2, 'leaf', 2],
    [2, 3, 'leaf', 0],
    [3, 3, 'leaf', 2],
    [4, 3, 'leaf', 3],
    [5, 3, 'leaf', 1],
    [3, 4, 'leaf', 0],
    [4, 4, 'leaf', 1],
  ],
  [PARTICLE_FRAME.petal]: [
    [3, 3, 'rose', 2],
    [4, 3, 'rose', 3],
    [5, 3, 'rose', 2],
    [3, 4, 'rose', 3],
    [4, 4, 'moonSilver', 3],
    [5, 4, 'rose', 2],
    [4, 5, 'rose', 2],
  ],
  [PARTICLE_FRAME.raindrop]: [
    [3, 2, 'cyan', 2],
    [3, 3, 'cyan', 3],
    [3, 4, 'cyan', 3],
    [3, 5, 'cyan', 2],
  ],
  [PARTICLE_FRAME.spore]: [
    [3, 3, 'mint', 3],
    [4, 3, 'mint', 3],
    [3, 4, 'mint', 3],
    [4, 4, 'mint', 3],
  ],
  [PARTICLE_FRAME.ember]: [
    [3, 3, 'ember', 3],
    [4, 3, 'ember', 2],
    [3, 4, 'ember', 2],
    [4, 4, 'ember', 3],
  ],
  [PARTICLE_FRAME.firefly]: [
    [3, 2, 'honey', 2],
    [2, 3, 'honey', 2],
    [3, 3, 'honey', 3],
    [4, 3, 'honey', 2],
    [3, 4, 'honey', 2],
  ],
  [PARTICLE_FRAME.skyLantern]: [
    [3, 1, 'ember', 1],
    [4, 1, 'ember', 1],
    [2, 2, 'honey', 2],
    [3, 2, 'honey', 3],
    [4, 2, 'honey', 3],
    [5, 2, 'honey', 2],
    [2, 3, 'honey', 2],
    [3, 3, 'honey', 3],
    [4, 3, 'honey', 3],
    [5, 3, 'honey', 2],
    [2, 4, 'ember', 2],
    [3, 4, 'honey', 2],
    [4, 4, 'honey', 2],
    [5, 4, 'ember', 2],
    [3, 5, 'ember', 1],
    [4, 5, 'ember', 1],
  ],
  [PARTICLE_FRAME.spark]: [
    [3, 1, 'moonSilver', 2],
    [4, 1, 'moonSilver', 2],
    [3, 6, 'moonSilver', 2],
    [4, 6, 'moonSilver', 2],
    [1, 3, 'moonSilver', 2],
    [1, 4, 'moonSilver', 2],
    [6, 3, 'moonSilver', 2],
    [6, 4, 'moonSilver', 2],
    [3, 2, 'gold', 3],
    [4, 2, 'gold', 3],
    [3, 5, 'gold', 3],
    [4, 5, 'gold', 3],
    [2, 3, 'gold', 3],
    [2, 4, 'gold', 3],
    [5, 3, 'gold', 3],
    [5, 4, 'gold', 3],
    [3, 3, 'moonSilver', 3],
    [4, 3, 'moonSilver', 3],
    [3, 4, 'moonSilver', 3],
    [4, 4, 'moonSilver', 3],
  ],
  // Boss shots: bright pink mote, dark water blob, pale shard, violet-black orb, dust puff.
  [PARTICLE_FRAME.dust]: [
    [3, 2, 'rose', 2],
    [4, 2, 'rose', 2],
    [2, 3, 'rose', 2],
    [3, 3, 'rose', 3],
    [4, 3, 'rose', 3],
    [5, 3, 'rose', 2],
    [2, 4, 'rose', 2],
    [3, 4, 'rose', 3],
    [4, 4, 'moonSilver', 3],
    [5, 4, 'rose', 2],
    [3, 5, 'rose', 2],
    [4, 5, 'rose', 2],
  ],
  [PARTICLE_FRAME.bolt]: [
    [3, 1, 'mud', 1],
    [4, 1, 'mud', 1],
    [2, 2, 'mud', 1],
    [3, 2, 'mud', 2],
    [4, 2, 'mud', 2],
    [5, 2, 'mud', 1],
    [1, 3, 'mud', 0],
    [2, 3, 'mud', 2],
    [3, 3, 'mud', 3],
    [4, 3, 'mud', 2],
    [5, 3, 'mud', 2],
    [6, 3, 'mud', 0],
    [2, 4, 'mud', 1],
    [3, 4, 'mud', 2],
    [4, 4, 'mud', 2],
    [5, 4, 'mud', 1],
    [3, 5, 'mud', 0],
    [4, 5, 'mud', 0],
  ],
  [PARTICLE_FRAME.shard]: [
    [5, 0, 'moonSilver', 3],
    [4, 1, 'moonSilver', 3],
    [5, 1, 'cyan', 2],
    [3, 2, 'moonSilver', 3],
    [4, 2, 'cyan', 2],
    [2, 3, 'moonSilver', 2],
    [3, 3, 'cyan', 2],
    [1, 4, 'moonSilver', 2],
    [2, 4, 'cyan', 1],
    [0, 5, 'moonSilver', 1],
    [1, 5, 'cyan', 1],
  ],
  [PARTICLE_FRAME.orb]: [
    [3, 1, 'rose', 2],
    [4, 1, 'rose', 2],
    [2, 2, 'rose', 2],
    [3, 2, 'gloam', 1],
    [4, 2, 'gloam', 2],
    [5, 2, 'rose', 2],
    [1, 3, 'rose', 2],
    [2, 3, 'gloam', 1],
    [3, 3, 'gloam', 3],
    [4, 3, 'gloam', 1],
    [5, 3, 'gloam', 1],
    [6, 3, 'rose', 1],
    [1, 4, 'rose', 2],
    [2, 4, 'gloam', 1],
    [3, 4, 'gloam', 1],
    [4, 4, 'gloam', 1],
    [5, 4, 'gloam', 1],
    [6, 4, 'rose', 1],
    [2, 5, 'rose', 1],
    [3, 5, 'gloam', 1],
    [4, 5, 'gloam', 1],
    [5, 5, 'rose', 1],
    [3, 6, 'rose', 1],
    [4, 6, 'rose', 1],
  ],
  [PARTICLE_FRAME.slam]: [
    [1, 4, 'stone', 2],
    [2, 3, 'stone', 3],
    [3, 2, 'stone', 3],
    [4, 2, 'stone', 3],
    [5, 3, 'stone', 3],
    [6, 4, 'stone', 2],
    [2, 4, 'stone', 2],
    [3, 3, 'stone', 2],
    [4, 3, 'stone', 2],
    [5, 4, 'stone', 2],
    [0, 5, 'stone', 1],
    [1, 5, 'stone', 2],
    [2, 5, 'stone', 2],
    [3, 5, 'stone', 2],
    [4, 5, 'stone', 2],
    [5, 5, 'stone', 2],
    [6, 5, 'stone', 2],
    [7, 5, 'stone', 1],
  ],
  [PARTICLE_FRAME.mote]: [
    [3, 3, 'moonSilver', 3],
    [4, 3, 'moonSilver', 3],
    [3, 4, 'moonSilver', 3],
    [4, 4, 'moonSilver', 3],
  ],
};

/** The `particles` sheet: 8x8 frames with the shape centred, tinted at runtime. */
export function buildParticles(): RgbaImage {
  const def = requireAsset('particles');
  const out = createImage(def.frameWidth * def.frames, def.frameHeight);
  for (let f = 0; f < def.frames; f++) {
    for (const [x, y, ramp, shade] of PARTICLE_DOTS[f] ?? []) {
      setPixel(out, f * def.frameWidth + x, y, PALETTE[ramp][shade]);
    }
  }
  return out;
}
