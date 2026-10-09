/**
 * Placeholder parallax layers and foreground canopy (plan 2.2). Drawn as white and grey
 * silhouettes because the game tints them at runtime per time of day and depth. Hard pixel edges,
 * no gradients. Everything wraps horizontally: shapes are drawn modulo the width and the ground
 * line comes from periodic noise, so the left and right edges join when the image repeats.
 */
import { hash2, mulberry32 } from '../../src/sim/random';
import {
  FG_CANOPY_ID,
  FG_CANOPY_SIZE,
  PARALLAX_LAYERS,
  PARALLAX_SIZE,
  parallaxAssetId,
} from '../../src/data/spriteAssets';
import { createImage, setPixel, type RgbaImage } from './image';

/** Silhouette tones: lit body, mid, shadow. Tinted at runtime, so neutral greys. */
const LIGHT = 0xffffff;
const MID = 0xdcdcdc;
const SHADE = 0xb4b4b4;

type Rand = () => number;

class Layer {
  readonly img: RgbaImage;

  constructor(
    readonly width: number,
    readonly height: number,
  ) {
    this.img = createImage(width, height);
  }

  put(x: number, y: number, colour: number): void {
    if (y < 0 || y >= this.height) return;
    setPixel(
      this.img,
      ((Math.round(x) % this.width) + this.width) % this.width,
      Math.round(y),
      colour,
    );
  }

  clear(x: number, y: number): void {
    if (y < 0 || y >= this.height) return;
    setPixel(
      this.img,
      ((Math.round(x) % this.width) + this.width) % this.width,
      Math.round(y),
      0,
      0,
    );
  }

  /** Filled ellipse shaded from a light point at its upper left. */
  blob(cx: number, cy: number, rx: number, ry: number, seed: number, tones = true): void {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x - cx) / rx;
        const dy = (y - cy) / ry;
        if (dx * dx + dy * dy > 1) continue;
        if (!tones) {
          this.put(x, y, LIGHT);
          continue;
        }
        const lit = Math.hypot(dx + 0.35, dy + 0.35) + (hash2(x, y, seed) - 0.5) * 0.4;
        this.put(x, y, lit < 0.7 ? LIGHT : lit < 1.15 ? MID : SHADE);
      }
    }
  }

  /** Vertical-ish bar from (x, y0) to (x, y1), `w` wide, left side lit. */
  bar(x: number, y0: number, y1: number, w: number, lean = 0): void {
    for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) {
      const t = (y - y0) / (y1 - y0 || 1);
      const left = Math.round(x - w / 2 + lean * t);
      for (let i = 0; i < w; i++) this.put(left + i, y, i < w / 2 ? LIGHT : SHADE);
    }
  }

  line(x0: number, y0: number, x1: number, y1: number, colour: number): void {
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let i = 0; i <= steps; i++) {
      this.put(x0 + ((x1 - x0) * i) / steps, y0 + ((y1 - y0) * i) / steps, colour);
    }
  }
}

/** Smooth 1D noise in [0, 1) that repeats every `cells` lattice steps across `width` pixels. */
function periodicNoise(x: number, width: number, cells: number, seed: number): number {
  const f = (x / width) * cells;
  const i = Math.floor(f);
  const t = f - i;
  const a = hash2(((i % cells) + cells) % cells, 0, seed);
  const b = hash2((((i + 1) % cells) + cells) % cells, 0, seed);
  const s = t * t * (3 - 2 * t);
  return a + (b - a) * s;
}

function seedFor(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return h >>> 0;
}

interface LayerSpec {
  /** Mean ground line (y) and how far hills rise and fall around it. */
  ground: number;
  hills: number;
  /** Trees across the full width and the size ranges (pixels). */
  trees: number;
  crownR: readonly [number, number];
  /** How far the crown centre sits above the ground, in crown radii. */
  rise: readonly [number, number];
}

const SPECS: readonly LayerSpec[] = [
  { ground: 175, hills: 22, trees: 30, crownR: [9, 15], rise: [2.2, 4.2] },
  { ground: 185, hills: 18, trees: 20, crownR: [12, 20], rise: [1.8, 3.4] },
  { ground: 198, hills: 14, trees: 13, crownR: [16, 26], rise: [1.5, 2.8] },
  { ground: 214, hills: 8, trees: 9, crownR: [22, 32], rise: [1.4, 2.6] },
];

type TreeFn = (l: Layer, x: number, groundY: number, n: number, spec: LayerSpec, r: Rand) => void;

const between = (r: Rand, [lo, hi]: readonly [number, number]) => lo + r() * (hi - lo);

function drawGround(l: Layer, spec: LayerSpec, seed: number, n: number): number[] {
  const line: number[] = [];
  for (let x = 0; x < l.width; x++) {
    const hill =
      periodicNoise(x, l.width, 3 + n, seed) * 0.7 +
      periodicNoise(x, l.width, 9 + n * 3, seed + 1) * 0.3;
    const y = Math.round(spec.ground - spec.hills * hill);
    line.push(y);
    for (let yy = y; yy < l.height; yy++) l.put(x, yy, yy === y ? LIGHT : yy < y + 3 ? MID : SHADE);
  }
  return line;
}

/** Distant giant trees: crown top row (plus the trunk width) and crown width per trunk width. */
const GIANT_CROWN_TOP = 6;
const GIANT_CROWN_SPREAD = 2.2;

/** Broad round oak crown on a short trunk; denser clusters of blobs on the nearer layers. */
const oak: TreeFn = (l, x, g, n, spec, r) => {
  const rad = between(r, spec.crownR);
  const cy = g - rad * between(r, spec.rise);
  l.bar(x, cy, g + 3, Math.max(3, Math.round(rad / 3)), 0);
  const seed = Math.floor(r() * 1e6);
  l.blob(x, cy, rad, rad * 0.85, seed);
  const extra = 2 + n;
  for (let i = 0; i < extra; i++) {
    const a = r() * Math.PI * 2;
    l.blob(
      x + Math.cos(a) * rad * 0.8,
      cy + Math.sin(a) * rad * 0.6,
      rad * 0.55,
      rad * 0.5,
      seed + i,
    );
  }
  if (n === 3) {
    // Gaps in the nearest crowns where the sky shows through.
    for (let i = 0; i < 5; i++) {
      const gx = x + (r() - 0.5) * rad * 1.3;
      const gy = cy + (r() - 0.5) * rad;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 2; dx++) l.clear(gx + dx, gy + dy);
    }
  }
};

const birch: TreeFn = (l, x, g, n, spec, r) => {
  const height = between(r, spec.crownR) * between(r, spec.rise) * 1.6;
  const w = n >= 2 ? 4 : 3;
  l.bar(x, g - height, g + 3, w, Math.round((r() - 0.5) * 4));
  const seed = Math.floor(r() * 1e6);
  const puffs = 3 + n;
  const step = (height * 0.62) / puffs;
  const ry = Math.max(5 + n * 1.5, step * 0.8);
  for (let i = 0; i < puffs; i++) {
    const cy = g - height + ry + i * step;
    const side = i % 2 === 0 ? -1 : 1;
    l.blob(x + side * (1 + r() * 2), cy, 4 + n * 1.5 + r() * 2, ry, seed + i);
  }
  l.blob(x, g - height - 2, 3 + n, 5 + n, seed);
};

const conifer: TreeFn = (l, x, g, n, spec, r) => {
  const height = between(r, spec.crownR) * between(r, spec.rise) * 1.8;
  const baseW = spec.crownR[0] * (0.8 + r() * 0.3);
  const tiers = 4 + n;
  l.bar(x, g - height * 0.2, g + 3, 3, 0);
  for (let t = 0; t < tiers; t++) {
    const top = g - height + (t * height * 0.85) / tiers;
    const tierH = (height * 0.85) / tiers + 3;
    const w = (baseW * (t + 1)) / tiers + 1;
    for (let dy = 0; dy < tierH; dy++) {
      const half = Math.max(1, (w * (dy + 1)) / tierH);
      for (let dx = -Math.floor(half); dx <= Math.floor(half); dx++) {
        l.put(x + dx, top + dy, dx < -half * 0.25 ? LIGHT : dx < half * 0.6 ? MID : SHADE);
      }
    }
  }
};

/** Willow: a low dome with strands hanging far below its rim. */
const willow: TreeFn = (l, x, g, _n, spec, r) => {
  const rad = between(r, spec.crownR);
  const cy = g - rad * between(r, spec.rise) * 0.8;
  l.bar(x, cy, g + 3, Math.max(3, Math.round(rad / 3)), Math.round((r() - 0.5) * 3));
  const seed = Math.floor(r() * 1e6);
  l.blob(x, cy, rad, rad * 0.7, seed);
  l.blob(x - rad * 0.4, cy + rad * 0.2, rad * 0.7, rad * 0.5, seed + 1);
  const strands = Math.round(rad * 1.4);
  for (let i = 0; i < strands; i++) {
    const sx = x - rad * 0.9 + (i / strands) * rad * 1.8;
    const len = rad * (1.1 + r() * 1.2);
    for (let y = cy; y < Math.min(g, cy + len); y++) {
      l.put(sx + Math.sin(y / 3 + i) * 0.8, y, y - cy < len * 0.6 ? MID : SHADE);
    }
  }
};

/** Dead snag: bare trunk with a few stubby branches. */
const snag: TreeFn = (l, x, g, n, spec, r) => {
  const height = between(r, spec.crownR) * between(r, spec.rise) * 1.6;
  l.bar(x, g - height, g + 3, 2 + Math.floor(n / 2) + 1, Math.round((r() - 0.5) * 3));
  for (let i = 0; i < 3 + n; i++) {
    const by = g - height + 4 + i * (height / (4 + n));
    const side = r() < 0.5 ? -1 : 1;
    const len = 4 + r() * (6 + n * 3);
    l.line(x, by, x + side * len, by - len * 0.6, i % 2 ? SHADE : LIGHT);
    if (n >= 2)
      l.line(x + side * len, by - len * 0.6, x + side * (len + 3), by - len * 0.6 - 3, SHADE);
  }
};

/**
 * An enormous distant tree: a tall trunk flaring at the roots under a broad crown that stays
 * inside the image (the layer's top edge is visible on screen, so nothing may run off it).
 */
function giantTrunk(l: Layer, x: number, groundY: number, width: number, seed: number): void {
  const crownY = GIANT_CROWN_TOP + width;
  for (let y = crownY; y <= groundY + 3; y++) {
    const flare = y > groundY - 18 ? Math.floor((y - (groundY - 18)) / 4) : 0;
    const left = Math.round(x - width / 2 - flare);
    const w = width + flare * 2;
    for (let i = 0; i < w; i++) {
      l.put(left + i, y, i < w * 0.35 ? LIGHT : i < w * 0.7 ? MID : SHADE);
    }
  }
  const rx = width * GIANT_CROWN_SPREAD;
  const ry = width * 0.9;
  l.blob(x, crownY, rx, ry, seed);
  l.blob(x - rx * 0.6, crownY + ry * 0.35, rx * 0.55, ry * 0.6, seed + 1);
  l.blob(x + rx * 0.6, crownY + ry * 0.3, rx * 0.55, ry * 0.6, seed + 2);
}

function tintReeds(l: Layer, line: number[], r: Rand): void {
  for (let i = 0; i < 70; i++) {
    const x = Math.floor(r() * l.width);
    const top = (line[x] ?? 0) - 7 - Math.floor(r() * 9);
    l.line(x, line[x] ?? 0, x + (r() < 0.5 ? -1 : 1), top, MID);
    if (r() < 0.4) {
      for (let y = 0; y < 4; y++) {
        l.put(x, top - y, SHADE);
        l.put(x + 1, top - y, SHADE);
      }
    }
  }
}

const BIOME_TREES: Record<string, readonly TreeFn[]> = {
  elderglade: [oak, oak, oak],
  moonpetal_vale: [birch, conifer, birch, conifer, oak],
  weeping_mire: [willow, willow, snag, snag, willow],
};

/** One 480x240 parallax layer for a surface biome; `layer` 0 is the farthest. */
export function buildParallaxLayer(biome: string, layer: number): RgbaImage {
  const id = parallaxAssetId(biome, layer);
  const { width, height } = PARALLAX_SIZE;
  const l = new Layer(width, height);
  const seed = seedFor(id);
  const r = mulberry32(seed);
  const spec = SPECS[layer] ?? SPECS[PARALLAX_LAYERS - 1]!;
  const line = drawGround(l, spec, seed, layer);

  // Giant distant trunks in the Elderglade's back layers.
  if (biome === 'elderglade' && layer <= 1) {
    const widths = layer === 0 ? [14, 11] : [22, 18];
    widths.forEach((w, i) => {
      const x = Math.floor(width * (0.2 + i * 0.5) + r() * 40);
      giantTrunk(l, x, line[x % width] ?? spec.ground, w, seed + 100 + i);
    });
  }

  const kinds = BIOME_TREES[biome] ?? [oak];
  const count = biome === 'moonpetal_vale' ? Math.round(spec.trees * 0.75) : spec.trees;
  for (let i = 0; i < count; i++) {
    // Evenly spread with jitter so trees overlap a little but do not clump.
    const x = Math.floor(((i + 0.2 + r() * 0.6) / count) * width);
    const g = line[x] ?? spec.ground;
    const kind = kinds[Math.floor(r() * kinds.length)] ?? oak;
    kind(l, x, g, layer, spec, r);
  }
  if (biome === 'weeping_mire' && layer === PARALLAX_LAYERS - 1) tintReeds(l, line, r);
  return l.img;
}

/** The 480x120 foreground canopy: leaves and branches hanging from the top edge. */
export function buildForegroundCanopy(): RgbaImage {
  const { width, height } = FG_CANOPY_SIZE;
  const l = new Layer(width, height);
  const seed = seedFor(FG_CANOPY_ID);
  const r = mulberry32(seed);

  // Branches first, so leaves cover their roots.
  for (let i = 0; i < 6; i++) {
    const x = Math.floor((i / 6) * width + r() * 40);
    const reach = 25 + r() * 25;
    const dir = r() < 0.5 ? -1 : 1;
    for (let w = 0; w < 3; w++)
      l.line(x + w, 0, x + dir * reach + w, 20 + r() * 22, w === 0 ? LIGHT : SHADE);
  }
  // Leaf band along the top with a ragged lower edge.
  for (let x = 0; x < width; x++) {
    const edge =
      12 + periodicNoise(x, width, 24, seed) * 16 + periodicNoise(x, width, 60, seed + 1) * 8;
    for (let y = 0; y < edge; y++) l.put(x, y, y < edge - 5 ? LIGHT : y < edge - 2 ? MID : SHADE);
  }
  // Clusters and hanging strands.
  for (let i = 0; i < 46; i++) {
    const x = r() * width;
    l.blob(x, 8 + r() * 22, 6 + r() * 9, 5 + r() * 6, Math.floor(r() * 1e6));
  }
  for (let i = 0; i < 38; i++) {
    const x = Math.floor(r() * width);
    const len = 18 + r() * 52;
    for (let y = 20; y < len + 20; y += 1) {
      l.put(
        x + Math.round(Math.sin(y / 5 + i) * 1.2),
        y,
        y > len ? SHADE : y % 6 < 4 ? MID : LIGHT,
      );
      if (y % 7 === 0) l.put(x + (i % 2 ? 2 : -2), y, LIGHT);
    }
  }
  return l.img;
}
