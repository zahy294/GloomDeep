/**
 * Pure pipeline that turns a raw AI image into true pixel art (plan 2.9.6). No file access:
 * every step takes and returns `RgbaImage`s so it can be unit-tested with synthetic fixtures.
 */
import type { ArtAnchor, ArtManifestEntry } from '../../src/data/artManifest';
import { nearestColor, oklabDistance, rgbToOklab, type Lab } from './color';
import { blit, createImage, getAlpha, getRgb, px, setPixel, type RgbaImage } from './image';

/** Chroma key colour the prompts ask for (#FF00FF). */
export const KEY_COLOR = 0xff00ff;
/** OKLab distance below which a pixel counts as background. */
export const KEY_TOLERANCE = 0.1;
/** A fringe pixel's "magenta tint" must be at least this (0..255 scale)... */
export const FRINGE_MIN_TINT = 40;
/** ...and exceed the least-tinted opaque pixel within 2 px by this much. */
export const FRINGE_TINT_MARGIN = 25;
export const FRINGE_PASSES = 3;
/** Source colours further than this (OKLab) from every palette colour are reported. */
export const FAR_FROM_PALETTE_THRESHOLD = 0.05;
/** Far colours closer than this to a more frequent far colour are counted as the same one. */
export const FAR_GROUP_DISTANCE = 0.03;
/**
 * Seam check (plan 2.9.6 step 7). A seamless texture doesn't have equal edges: its last column
 * must *continue into* its first, i.e. differ from it about as much as any two neighbouring
 * columns inside the texture do. So each wrap pair is compared against the texture's own
 * neighbour differences: it mismatches when it differs more than SEAM_PERCENTILE of interior
 * neighbour pairs (and more than SEAM_TOLERANCE, so flat textures aren't judged on noise).
 */
export const SEAM_TOLERANCE = 0.04;
export const SEAM_PERCENTILE = 0.9;
/** An edge fails when more than this fraction of its pairs mismatch... */
export const SEAM_FAIL_FRACTION = 0.25;
/** ...and its average wrap difference exceeds the average interior difference by this factor. */
export const SEAM_RELATIVE_FAIL = 1.5;
/** Fraction of each block ignored on every side when voting for its colour. */
export const BLOCK_MARGIN = 0.25;

const OPAQUE = 128;

// ---------------------------------------------------------------------------------------------
// 1. Background removal
// ---------------------------------------------------------------------------------------------

export interface RemoveBackgroundOptions {
  key?: number;
  tolerance?: number;
}

export interface RemoveBackgroundResult {
  image: RgbaImage;
  /** Pixels that were opaque before and are transparent now. */
  removed: number;
  /** removed / total pixels. */
  removedFraction: number;
}

function isKeyLike(
  r: number,
  g: number,
  b: number,
  key: number,
  keyLab: Lab,
  tol: number,
): boolean {
  // Cheap reject before the OKLab conversion: far-off channels can never be within tolerance.
  if (
    Math.abs(r - ((key >> 16) & 0xff)) > 128 ||
    Math.abs(g - ((key >> 8) & 0xff)) > 128 ||
    Math.abs(b - (key & 0xff)) > 128
  ) {
    return false;
  }
  return oklabDistance(rgbToOklab((r << 16) | (g << 8) | b), keyLab) < tol;
}

/** True if any opaque pixel is within `tolerance` of the key colour. */
export function hasKeyColor(img: RgbaImage, key = KEY_COLOR, tolerance = KEY_TOLERANCE): boolean {
  const keyLab = rgbToOklab(key);
  for (let i = 0; i < img.data.length; i += 4) {
    if ((img.data[i + 3] ?? 0) < OPAQUE) continue;
    if (
      isKeyLike(
        img.data[i] ?? 0,
        img.data[i + 1] ?? 0,
        img.data[i + 2] ?? 0,
        key,
        keyLab,
        tolerance,
      )
    ) {
      return true;
    }
  }
  return false;
}

/**
 * How far a pixel is pulled towards the key: lowest "high" key channel minus highest "low" key
 * channel (for magenta: min(r, b) - g). Returns undefined for keys with no high/low split.
 */
function makeTint(key: number): ((r: number, g: number, b: number) => number) | undefined {
  const channels = [(key >> 16) & 0xff, (key >> 8) & 0xff, key & 0xff];
  const high = channels.map((c, i) => (c >= 128 ? i : -1)).filter((i) => i >= 0);
  const low = channels.map((c, i) => (c < 128 ? i : -1)).filter((i) => i >= 0);
  if (!high.length || !low.length) return undefined;
  return (r, g, b) => {
    const v = [r, g, b];
    return Math.min(...high.map((i) => v[i] ?? 0)) - Math.max(...low.map((i) => v[i] ?? 0));
  };
}

/**
 * Chroma-keys the background, then peels off the anti-aliased fringe: opaque pixels that touch
 * transparency and are clearly more key-tinted than the least-tinted opaque pixel within 2 px.
 * Palette colours that are naturally pinkish (rose ramp) stay below FRINGE_MIN_TINT.
 */
export function removeBackground(
  img: RgbaImage,
  options: RemoveBackgroundOptions = {},
): RemoveBackgroundResult {
  const key = options.key ?? KEY_COLOR;
  const tolerance = options.tolerance ?? KEY_TOLERANCE;
  const keyLab = rgbToOklab(key);
  const out: RgbaImage = { width: img.width, height: img.height, data: new Uint8Array(img.data) };
  const { width, height, data } = out;
  let removed = 0;

  const clear = (i: number) => {
    data[i] = data[i + 1] = data[i + 2] = data[i + 3] = 0;
    removed++;
  };

  for (let i = 0; i < data.length; i += 4) {
    if ((data[i + 3] ?? 0) < OPAQUE) {
      data[i + 3] = 0; // normalise "mostly transparent" to fully transparent
      continue;
    }
    if (isKeyLike(data[i] ?? 0, data[i + 1] ?? 0, data[i + 2] ?? 0, key, keyLab, tolerance)) {
      clear(i);
    }
  }

  const tint = makeTint(key);
  if (tint) {
    const tintAt = (x: number, y: number) => {
      const i = px(out, x, y);
      return tint(data[i] ?? 0, data[i + 1] ?? 0, data[i + 2] ?? 0);
    };
    const opaque = (x: number, y: number) =>
      x >= 0 && y >= 0 && x < width && y < height && (data[px(out, x, y) + 3] ?? 0) >= OPAQUE;

    for (let pass = 0; pass < FRINGE_PASSES; pass++) {
      const doomed: number[] = [];
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          if (!opaque(x, y)) continue;
          let touches = false;
          for (let dy = -1; dy <= 1 && !touches; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              const nx = x + dx;
              const ny = y + dy;
              if (
                (dx || dy) &&
                nx >= 0 &&
                ny >= 0 &&
                nx < width &&
                ny < height &&
                !opaque(nx, ny)
              ) {
                touches = true;
                break;
              }
            }
          }
          if (!touches) continue;
          const m = tintAt(x, y);
          if (m < FRINGE_MIN_TINT) continue;
          let least = Infinity;
          for (let dy = -2; dy <= 2; dy++) {
            for (let dx = -2; dx <= 2; dx++) {
              if ((dx || dy) && opaque(x + dx, y + dy))
                least = Math.min(least, tintAt(x + dx, y + dy));
            }
          }
          if (m - least >= FRINGE_TINT_MARGIN) doomed.push(px(out, x, y));
        }
      }
      if (!doomed.length) break;
      for (const i of doomed) clear(i);
    }
  }

  return { image: out, removed, removedFraction: removed / (width * height) };
}

// ---------------------------------------------------------------------------------------------
// 2. Pixel grid detection
// ---------------------------------------------------------------------------------------------

export interface BlockSize {
  /** Average block width/height in source pixels (fractional, e.g. 6.5). 1 = no grid found. */
  x: number;
  y: number;
  /** Position of the first block edge in source pixels (informational). */
  offsetX: number;
  offsetY: number;
}

/** Colour differences below this (RGB distance) are treated as noise when finding block edges. */
const EDGE_NOISE_FLOOR = 10;
/** Smaller pitches cannot be told apart from a plain image (comb covers everything). */
const MIN_PITCH = 5;
/** An edge fits a comb when its centre is within this many px of a comb point (6/7 vs 6.5 = 0.5). */
const EDGE_TOLERANCE = 0.8;
/** Edges lighter than this fraction of the heaviest one are ignored (texture, noise). */
const MIN_EDGE_WEIGHT = 0.05;
/** Comb phases tried per pitch: the centres of this many heaviest edges. */
const OFFSET_CANDIDATES = 8;
const MAX_PITCH = 64;
/** Combs with fewer points than this over-fit the edges, so they are not tried. */
const MIN_COMB_POINTS = 6;
const MIN_PITCH_STEP = 0.005;
/** A comb must catch at least this fraction of all edge energy to be a candidate pitch. */
const MIN_COVERAGE = 0.9;
/** The best comb must beat a random comb (coverage / chance coverage) by this, else "no grid". */
const MIN_COMB_CONTRAST = 2;

function rgbDiff(img: RgbaImage, i: number, j: number): number {
  const ai = img.data[i + 3] ?? 0;
  const aj = img.data[j + 3] ?? 0;
  if (ai < OPAQUE || aj < OPAQUE) return ai < OPAQUE !== aj < OPAQUE ? 255 : 0;
  const d = Math.hypot(
    (img.data[i] ?? 0) - (img.data[j] ?? 0),
    (img.data[i + 1] ?? 0) - (img.data[j + 1] ?? 0),
    (img.data[i + 2] ?? 0) - (img.data[j + 2] ?? 0),
  );
  return Math.max(0, d - EDGE_NOISE_FLOOR);
}

/** edge[t] = total colour change between line t-1 and t. */
export function edgeProfile(img: RgbaImage, axis: 'x' | 'y'): number[] {
  const len = axis === 'x' ? img.width : img.height;
  const lines = axis === 'x' ? img.height : img.width;
  const raw = new Array<number>(len).fill(0);
  for (let t = 1; t < len; t++) {
    let sum = 0;
    for (let l = 0; l < lines; l++) {
      const a = axis === 'x' ? px(img, t - 1, l) : px(img, l, t - 1);
      const b = axis === 'x' ? px(img, t, l) : px(img, l, t);
      sum += rgbDiff(img, a, b);
    }
    raw[t] = sum;
  }
  return raw;
}

interface EdgeCluster {
  /** Energy-weighted centre position, in px. */
  at: number;
  weight: number;
}

/** Groups the profile into edges (a blurred seam spreads over ~3 px) with sub-pixel centres. */
function edgeClusters(profile: readonly number[]): EdgeCluster[] {
  const clusters: EdgeCluster[] = [];
  let sum = 0;
  let moment = 0;
  let gap = 0;
  const flush = () => {
    if (sum > 0) clusters.push({ at: moment / sum, weight: sum });
    sum = 0;
    moment = 0;
  };
  for (let t = 0; t < profile.length; t++) {
    const v = profile[t] ?? 0;
    if (v > 0) {
      sum += v;
      moment += v * t;
      gap = 0;
    } else if (++gap >= 2) {
      flush();
    }
  }
  flush();
  const heaviest = Math.max(0, ...clusters.map((c) => c.weight));
  return clusters.filter((c) => c.weight >= heaviest * MIN_EDGE_WEIGHT);
}

/** Best (coverage, offset): share of edge weight lying within EDGE_TOLERANCE of a comb. */
function combCoverage(
  edges: readonly EdgeCluster[],
  starts: readonly number[],
  pitch: number,
  total: number,
): { coverage: number; offset: number } {
  let best = { coverage: -1, offset: 0 };
  for (const offset of starts) {
    let hit = 0;
    for (const e of edges) {
      const d = (((e.at - offset) % pitch) + pitch) % pitch;
      if (Math.min(d, pitch - d) <= EDGE_TOLERANCE) hit += e.weight;
    }
    const coverage = hit / total;
    if (coverage > best.coverage) best = { coverage, offset };
  }
  return best;
}

function detectAxis(profile: readonly number[]): { pitch: number; offset: number } {
  const edges = edgeClusters(profile);
  const total = edges.reduce((a, e) => a + e.weight, 0);
  if (edges.length < 2) return { pitch: 1, offset: 0 };
  const strongest = [...edges].sort((a, b) => b.weight - a.weight).slice(0, OFFSET_CANDIDATES);
  const scores: { pitch: number; lift: number; offset: number; coverage: number }[] = [];
  const maxPitch = Math.min(MAX_PITCH, profile.length / MIN_COMB_POINTS);
  // Fine enough that the comb drifts only a fraction of a pixel over the whole image.
  for (
    let p = MIN_PITCH;
    p <= maxPitch;
    p += Math.max(MIN_PITCH_STEP, (0.3 * p) / profile.length)
  ) {
    const { coverage, offset } = combCoverage(
      edges,
      strongest.map((e) => e.at),
      p,
      total,
    );
    scores.push({ pitch: p, lift: coverage / ((2 * EDGE_TOLERANCE) / p), offset, coverage });
  }
  // A multiple of the true pitch misses edges (low coverage); a divisor covers everything but
  // only by chance (low lift). So: keep combs that explain nearly all edges, take the highest lift.
  const covers = (s: { coverage: number }) => s.coverage >= MIN_COVERAGE;
  const peak = Math.max(0, ...scores.filter(covers).map((s) => s.lift));
  if (peak < MIN_COMB_CONTRAST) return { pitch: 1, offset: 0 };

  // Average the contiguous plateau of pitches within 3 % of the peak around the best one.
  const bestIndex = scores.findIndex((s) => s.lift === peak && covers(s));
  const near = (i: number) => {
    const s = scores[i];
    return s !== undefined && covers(s) && s.lift >= peak * 0.97;
  };
  let lo = bestIndex;
  let hi = bestIndex;
  while (near(lo - 1)) lo--;
  while (near(hi + 1)) hi++;
  const plateau = scores.slice(lo, hi + 1);
  const pitch = plateau.reduce((a, s) => a + s.pitch, 0) / plateau.length;
  return { pitch, offset: scores[bestIndex]?.offset ?? 0 };
}

/**
 * Estimates the (fractional) size of one "pixel block" along each axis. Same-colour runs are
 * unreliable in AI output (blurred seams split every run), so this works on block *edges*: the
 * period of the comb that best aligns with the strongest colour changes is the pitch. Uneven
 * 6/7 px alternation gives ~6.5.
 */
export function detectBlockSize(img: RgbaImage): BlockSize {
  const x = detectAxis(edgeProfile(img, 'x'));
  const y = detectAxis(edgeProfile(img, 'y'));
  return { x: x.pitch, y: y.pitch, offsetX: x.offset, offsetY: y.offset };
}

// ---------------------------------------------------------------------------------------------
// 3. Downscale
// ---------------------------------------------------------------------------------------------

export interface DownscaleOptions {
  /** Bucket noisy colours by nearest palette colour instead of a coarse RGB key. */
  palette?: readonly number[];
}

/**
 * Each output pixel is the most common colour among the central pixels of its source block
 * (BLOCK_MARGIN of the block is ignored on every side); never an average. Within the winning
 * bucket the per-channel median is used so noisy blocks still give a real colour. A block is
 * transparent when most of it is.
 */
export function downscale(
  img: RgbaImage,
  target: { width: number; height: number },
  options: DownscaleOptions = {},
): RgbaImage {
  const out = createImage(target.width, target.height);
  const bw = img.width / target.width;
  const bh = img.height / target.height;
  const palette = options.palette;
  const paletteLab = palette?.map(rgbToOklab);
  const paletteCache = new Map<number, number>();

  const bucketKey = (rgb: number): number => {
    if (!palette)
      return ((rgb >> 3) & 0x1f) | (((rgb >> 11) & 0x1f) << 5) | (((rgb >> 19) & 0x1f) << 10);
    let k = paletteCache.get(rgb);
    if (k === undefined) {
      k = nearestColor(rgb, palette, paletteLab).color;
      paletteCache.set(rgb, k);
    }
    return k;
  };

  for (let ty = 0; ty < target.height; ty++) {
    for (let tx = 0; tx < target.width; tx++) {
      const x0 = tx * bw;
      const y0 = ty * bh;
      const ix0 = Math.round(x0);
      const iy0 = Math.round(y0);
      const ix1 = Math.min(img.width, Math.max(ix0 + 1, Math.round(x0 + bw)));
      const iy1 = Math.min(img.height, Math.max(iy0 + 1, Math.round(y0 + bh)));

      let opaqueCount = 0;
      for (let y = iy0; y < iy1; y++) {
        for (let x = ix0; x < ix1; x++) if (getAlpha(img, x, y) >= OPAQUE) opaqueCount++;
      }
      const total = (ix1 - ix0) * (iy1 - iy0);
      if (opaqueCount * 2 <= total) continue; // stays transparent

      let cx0 = Math.ceil(x0 + bw * BLOCK_MARGIN);
      let cx1 = Math.ceil(x0 + bw * (1 - BLOCK_MARGIN));
      let cy0 = Math.ceil(y0 + bh * BLOCK_MARGIN);
      let cy1 = Math.ceil(y0 + bh * (1 - BLOCK_MARGIN));
      if (cx1 <= cx0) [cx0, cx1] = [Math.floor(x0 + bw / 2), Math.floor(x0 + bw / 2) + 1];
      if (cy1 <= cy0) [cy0, cy1] = [Math.floor(y0 + bh / 2), Math.floor(y0 + bh / 2) + 1];

      const collect = (xa: number, xb: number, ya: number, yb: number) => {
        const buckets = new Map<number, number[]>();
        for (let y = Math.max(0, ya); y < Math.min(img.height, yb); y++) {
          for (let x = Math.max(0, xa); x < Math.min(img.width, xb); x++) {
            if (getAlpha(img, x, y) < OPAQUE) continue;
            const rgb = getRgb(img, x, y);
            const k = bucketKey(rgb);
            const list = buckets.get(k);
            if (list) list.push(rgb);
            else buckets.set(k, [rgb]);
          }
        }
        return buckets;
      };

      let buckets = collect(cx0, cx1, cy0, cy1);
      if (!buckets.size) buckets = collect(ix0, ix1, iy0, iy1);
      let winner: number[] = [];
      for (const list of buckets.values()) if (list.length > winner.length) winner = list;
      if (!winner.length) continue;
      setPixel(out, tx, ty, medianColor(winner));
    }
  }
  return out;
}

function medianColor(colors: readonly number[]): number {
  const med = (shift: number) => {
    const v = colors.map((c) => (c >> shift) & 0xff).sort((a, b) => a - b);
    return v[Math.floor(v.length / 2)] ?? 0;
  };
  return (med(16) << 16) | (med(8) << 8) | med(0);
}

// ---------------------------------------------------------------------------------------------
// 4. Palette matching
// ---------------------------------------------------------------------------------------------

export interface FarColor {
  /** Source colour that had no close palette match. */
  color: number;
  nearest: number;
  distance: number;
  count: number;
}

export interface MatchPaletteResult {
  image: RgbaImage;
  /** Colours further than the threshold from every palette colour, most frequent first. */
  far: FarColor[];
}

export function matchPalette(
  img: RgbaImage,
  palette: readonly number[],
  threshold = FAR_FROM_PALETTE_THRESHOLD,
): MatchPaletteResult {
  const paletteLab = palette.map(rgbToOklab);
  const cache = new Map<number, { color: number; distance: number }>();
  const farCounts = new Map<number, FarColor>();
  const out = createImage(img.width, img.height);

  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      if (getAlpha(img, x, y) < OPAQUE) continue;
      const rgb = getRgb(img, x, y);
      let match = cache.get(rgb);
      if (!match) {
        match = nearestColor(rgb, palette, paletteLab);
        cache.set(rgb, match);
      }
      setPixel(out, x, y, match.color);
      if (match.distance > threshold) {
        const entry = farCounts.get(rgb);
        if (entry) entry.count++;
        else
          farCounts.set(rgb, {
            color: rgb,
            nearest: match.color,
            distance: match.distance,
            count: 1,
          });
      }
    }
  }
  // Noise makes one source colour show up as many near-identical ones: report them together.
  const far: FarColor[] = [];
  const lab = (c: number) => rgbToOklab(c);
  for (const f of [...farCounts.values()].sort((a, b) => b.count - a.count || a.color - b.color)) {
    const group = far.find((g) => oklabDistance(lab(g.color), lab(f.color)) < FAR_GROUP_DISTANCE);
    if (group) group.count += f.count;
    else far.push({ ...f });
  }
  return { image: out, far };
}

// ---------------------------------------------------------------------------------------------
// 5. Trim and anchor
// ---------------------------------------------------------------------------------------------

export interface TrimAnchorResult {
  image: RgbaImage;
  /** True when there were no opaque pixels at all. */
  empty: boolean;
  /** Content size when it does not fit the target (it is then clipped at the right/bottom). */
  overflow?: { contentWidth: number; contentHeight: number };
}

export function opaqueBounds(
  img: RgbaImage,
): { x0: number; y0: number; x1: number; y1: number } | undefined {
  let x0 = img.width;
  let y0 = img.height;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      if (getAlpha(img, x, y) < OPAQUE) continue;
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    }
  }
  return x1 < 0 ? undefined : { x0, y0, x1, y1 };
}

/** Crops to the opaque bounding box and places it in a `target`-sized canvas by `anchor`. */
export function trimAndAnchor(
  img: RgbaImage,
  target: { width: number; height: number },
  anchor: ArtAnchor,
): TrimAnchorResult {
  const out = createImage(target.width, target.height);
  const b = opaqueBounds(img);
  if (!b) return { image: out, empty: true };
  const cw = b.x1 - b.x0 + 1;
  const ch = b.y1 - b.y0 + 1;
  let dx = 0;
  let dy = 0;
  if (anchor === 'bottom-center') {
    dx = Math.floor((target.width - cw) / 2);
    dy = target.height - ch;
  } else if (anchor === 'center') {
    dx = Math.floor((target.width - cw) / 2);
    dy = Math.floor((target.height - ch) / 2);
  }
  // Oversized content keeps its top-left corner in view rather than being cut on both sides.
  dx = cw > target.width ? 0 : dx;
  dy = ch > target.height ? 0 : dy;
  blit(img, b.x0, b.y0, cw, ch, out, dx, dy);
  const overflow =
    cw > target.width || ch > target.height ? { contentWidth: cw, contentHeight: ch } : undefined;
  return overflow ? { image: out, empty: false, overflow } : { image: out, empty: false };
}

// ---------------------------------------------------------------------------------------------
// 7. Seam check
// ---------------------------------------------------------------------------------------------

export interface SeamEdge {
  edge: 'left-right' | 'top-bottom';
  /** Fraction of wrap pairs that differ more than the texture's own neighbour differences. */
  mismatchFraction: number;
  /** Inclusive row (left-right) or column (top-bottom) ranges that mismatch. */
  ranges: { start: number; end: number }[];
  ok: boolean;
}

/** OKLab difference of two pixels; a transparent/opaque pair counts as maximally different. */
function pixelDifference(img: RgbaImage, ax: number, ay: number, bx: number, by: number): number {
  const ta = getAlpha(img, ax, ay) < OPAQUE;
  const tb = getAlpha(img, bx, by) < OPAQUE;
  if (ta || tb) return ta === tb ? 0 : 1;
  return oklabDistance(rgbToOklab(getRgb(img, ax, ay)), rgbToOklab(getRgb(img, bx, by)));
}

/**
 * Wrap pairs (last line → first line) judged against interior neighbour pairs along the same
 * axis. `axis` 'x' compares columns (left/right edge, one pair per row); 'y' compares rows.
 */
function compareWrap(
  img: RgbaImage,
  axis: 'x' | 'y',
  tolerance: number,
): { fraction: number; ranges: { start: number; end: number }[]; ok: boolean } {
  const along = axis === 'x' ? img.width : img.height;
  const lines = axis === 'x' ? img.height : img.width;
  const at = (i: number, j: number): [number, number] => (axis === 'x' ? [i, j] : [j, i]);

  const interior: number[] = [];
  for (let j = 0; j < lines; j++) {
    for (let i = 0; i + 1 < along; i++) {
      const [ax, ay] = at(i, j);
      const [bx, by] = at(i + 1, j);
      interior.push(pixelDifference(img, ax, ay, bx, by));
    }
  }
  interior.sort((p, q) => p - q);
  const percentile = interior[Math.floor((interior.length - 1) * SEAM_PERCENTILE)] ?? 0;
  const threshold = Math.max(tolerance, percentile);
  const interiorMean = interior.reduce((sum, d) => sum + d, 0) / Math.max(1, interior.length);

  const ranges: { start: number; end: number }[] = [];
  let mismatches = 0;
  let wrapSum = 0;
  let open: number | undefined;
  for (let j = 0; j < lines; j++) {
    const [ax, ay] = at(along - 1, j);
    const [bx, by] = at(0, j);
    const d = pixelDifference(img, ax, ay, bx, by);
    wrapSum += d;
    if (d > threshold) {
      mismatches++;
      open ??= j;
    } else if (open !== undefined) {
      ranges.push({ start: open, end: j - 1 });
      open = undefined;
    }
  }
  if (open !== undefined) ranges.push({ start: open, end: lines - 1 });
  const fraction = lines ? mismatches / lines : 0;
  const wrapMean = wrapSum / Math.max(1, lines);
  const ok =
    fraction <= SEAM_FAIL_FRACTION || wrapMean <= interiorMean * SEAM_RELATIVE_FAIL + tolerance / 4;
  return { fraction, ranges, ok };
}

/** Compares the wrap-around edges of a seamless image ('x': left/right, 'xy': also top/bottom). */
export function checkSeams(
  img: RgbaImage,
  tileable: 'x' | 'xy',
  tolerance = SEAM_TOLERANCE,
): SeamEdge[] {
  const result: SeamEdge[] = [];
  const lr = compareWrap(img, 'x', tolerance);
  result.push({
    edge: 'left-right',
    mismatchFraction: lr.fraction,
    ranges: lr.ranges,
    ok: lr.ok,
  });
  if (tileable === 'xy') {
    const tb = compareWrap(img, 'y', tolerance);
    result.push({
      edge: 'top-bottom',
      mismatchFraction: tb.fraction,
      ranges: tb.ranges,
      ok: tb.ok,
    });
  }
  return result;
}

/** Human-readable seam problems, e.g. "left/right edge: 12% mismatch, rows 30–34". */
export function describeSeams(seams: readonly SeamEdge[]): string[] {
  return seams
    .filter((s) => !s.ok)
    .map((s) => {
      const what = s.edge === 'left-right' ? 'rows' : 'columns';
      const spans = s.ranges
        .map((r) => (r.start === r.end ? `${r.start}` : `${r.start}–${r.end}`))
        .join(', ');
      return `${s.edge.replace('-', '/')} edge: ${(s.mismatchFraction * 100).toFixed(0)}% mismatch, ${what} ${spans}`;
    });
}

// ---------------------------------------------------------------------------------------------
// 6. Whole-asset pipeline (single image or sheet)
// ---------------------------------------------------------------------------------------------

export type ImportEntry = Pick<ArtManifestEntry, 'targetSize' | 'grid' | 'anchor' | 'tileable'>;

export interface ImportResult {
  image: RgbaImage;
  /** Pitch actually used to cut blocks, and the one detected from the pixels (source px/pixel). */
  pitch: { usedX: number; usedY: number; detectedX: number; detectedY: number };
  /** Fraction of the raw image removed as background (0 when the image has no key colour). */
  removedFraction: number;
  far: FarColor[];
  seams: SeamEdge[];
  /** Problems worth showing to the user (cut-off content, grid mismatch, empty frames...). */
  warnings: string[];
}

/**
 * Opaque blobs smaller than this fraction of the largest one are treated as stray specks (noise,
 * a corner watermark) rather than part of the sprite, so they don't stretch its crop.
 */
const SPECK_FRACTION = 0.05;
/** ...and blobs smaller than this many art pixels (pitch² raw pixels each) always are. */
const SPECK_MIN_ART_PIXELS = 0.5;

/**
 * Clears small opaque blobs (8-connected) that are far smaller than the main sprite. Sprites may
 * have detached parts (sparkles, spores), so only blobs below SPECK_FRACTION of the largest blob
 * go. Returns how many blobs were removed.
 */
export function dropStraySpecks(img: RgbaImage, pitch: number): number {
  const { width, height } = img;
  const label = new Int32Array(width * height).fill(-1);
  const sizes: number[] = [];
  const stack: number[] = [];
  for (let start = 0; start < width * height; start++) {
    if (label[start] !== -1 || (img.data[start * 4 + 3] ?? 0) < OPAQUE) continue;
    const id = sizes.length;
    let size = 0;
    label[start] = id;
    stack.push(start);
    while (stack.length) {
      const p = stack.pop() ?? 0;
      size++;
      const px0 = p % width;
      const py0 = Math.floor(p / width);
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const x = px0 + dx;
          const y = py0 + dy;
          if (x < 0 || y < 0 || x >= width || y >= height) continue;
          const q = y * width + x;
          if (label[q] !== -1 || (img.data[q * 4 + 3] ?? 0) < OPAQUE) continue;
          label[q] = id;
          stack.push(q);
        }
      }
    }
    sizes.push(size);
  }
  if (sizes.length <= 1) return 0;
  const largest = Math.max(...sizes);
  const minSize = Math.max(
    largest * SPECK_FRACTION,
    Math.max(1, pitch) ** 2 * SPECK_MIN_ART_PIXELS,
  );
  let dropped = 0;
  const drop = sizes.map((s) => {
    const d = s < minSize;
    if (d) dropped++;
    return d;
  });
  if (!dropped) return 0;
  for (let i = 0; i < width * height; i++) {
    const id = label[i] ?? -1;
    if (id >= 0 && drop[id]) img.data[i * 4 + 3] = 0;
  }
  return dropped;
}

/** AI pixels are square: a pitch is trusted only when both axes found one and they agree. */
const PITCH_AXIS_AGREEMENT = 0.15;

/**
 * True pixel size of a cropped sprite. Uses the detected block pitch when it is trustworthy and
 * the result fits the target frame; otherwise fits the content into targetSize (sprites are
 * usually drawn to fill their frame), keeping the aspect ratio.
 */
function spriteSize(
  cell: RgbaImage,
  detected: { x: number; y: number },
  target: { width: number; height: number } | undefined,
  warnings: string[],
): { width: number; height: number } {
  const trusted =
    detected.x > 1 &&
    detected.y > 1 &&
    Math.abs(detected.x - detected.y) / Math.max(detected.x, detected.y) <= PITCH_AXIS_AGREEMENT;
  if (trusted) {
    const pitch = (detected.x + detected.y) / 2;
    const size = {
      width: Math.max(1, Math.round(cell.width / pitch)),
      height: Math.max(1, Math.round(cell.height / pitch)),
    };
    if (!target || (size.width <= target.width && size.height <= target.height)) return size;
    warnings.push(
      `detected pixel pitch ${pitch.toFixed(2)} gives ${size.width}x${size.height}, larger than targetSize ${target.width}x${target.height}; check targetSize (fitted instead)`,
    );
  }
  if (!target) {
    warnings.push('no pixel grid detected and no targetSize; kept at source size');
    return { width: cell.width, height: cell.height };
  }
  if (!trusted) warnings.push('no reliable pixel grid detected; content fitted to targetSize');
  const scale = Math.max(cell.width / target.width, cell.height / target.height);
  return {
    width: Math.max(1, Math.round(cell.width / scale)),
    height: Math.max(1, Math.round(cell.height / scale)),
  };
}

/** Runs pipeline steps 1–7 on a raw image according to its manifest entry. */
export function importImage(
  raw: RgbaImage,
  entry: ImportEntry,
  palette: readonly number[],
): ImportResult {
  const warnings: string[] = [];
  let removedFraction = 0;
  let work = raw;
  if (hasKeyColor(raw)) {
    const r = removeBackground(raw);
    work = r.image;
    removedFraction = r.removedFraction;
  }

  const detected = detectBlockSize(work);
  const pitchKnown = detected.x > 1 && detected.y > 1;
  const cols = entry.grid?.columns ?? 1;
  const rows = entry.grid?.rows ?? 1;
  if (entry.grid && !entry.targetSize) throw new Error('a sheet needs a targetSize (frame size)');

  // Textures fill the whole image, so the image *is* the grid. Sprites usually sit inside a much
  // larger canvas with an arbitrary margin, so each cell is cropped to its opaque content first;
  // sprite edges are whole blocks, which also aligns the block grid regardless of where it starts.
  const cells: { image: RgbaImage; content: { width: number; height: number } }[] = [];
  let usedX = 0;
  let usedY = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const sx0 = Math.round((c * work.width) / cols);
      const sx1 = Math.round(((c + 1) * work.width) / cols);
      const sy0 = Math.round((r * work.height) / rows);
      const sy1 = Math.round(((r + 1) * work.height) / rows);
      let cell = createImage(sx1 - sx0, sy1 - sy0);
      blit(work, sx0, sy0, cell.width, cell.height, cell, 0, 0);

      let content: { width: number; height: number };
      if (entry.tileable || entry.grid) {
        // Textures and sheets: the image is the grid (sheets must be cropped to their grid).
        content = entry.targetSize ?? {
          width: Math.max(1, Math.round(cell.width / detected.x)),
          height: Math.max(1, Math.round(cell.height / detected.y)),
        };
      } else {
        const dropped = dropStraySpecks(cell, (detected.x + detected.y) / 2);
        if (dropped > 0) {
          warnings.push(
            `ignored ${dropped} stray speck(s) away from the sprite (check the raw image)`,
          );
        }
        const bounds = opaqueBounds(cell);
        if (bounds) {
          const width = bounds.x1 - bounds.x0 + 1;
          const height = bounds.y1 - bounds.y0 + 1;
          const cropped = createImage(width, height);
          blit(cell, bounds.x0, bounds.y0, width, height, cropped, 0, 0);
          cell = cropped;
        }
        content = spriteSize(cell, detected, entry.targetSize, warnings);
      }
      usedX = cell.width / content.width;
      usedY = cell.height / content.height;
      cells.push({ image: cell, content });
    }
  }

  const frame = entry.targetSize ?? cells[0]?.content ?? { width: 1, height: 1 };
  const out = createImage(frame.width * cols, frame.height * rows);
  const far = new Map<number, FarColor>();

  cells.forEach(({ image, content }, index) => {
    const c = index % cols;
    const r = Math.floor(index / cols);
    const small = downscale(image, content, { palette });
    const matched = matchPalette(small, palette);
    for (const f of matched.far) {
      const e = far.get(f.color);
      if (e) e.count += f.count;
      else far.set(f.color, { ...f });
    }
    const label = entry.grid ? `frame ${c},${r}` : 'image';
    let placed = matched.image;
    if (!entry.tileable) {
      const t = trimAndAnchor(matched.image, frame, entry.anchor);
      placed = t.image;
      if (t.empty) warnings.push(`${label}: no opaque pixels`);
      if (t.overflow) {
        warnings.push(
          `${label}: content ${t.overflow.contentWidth}x${t.overflow.contentHeight} does not fit ${frame.width}x${frame.height} (clipped)`,
        );
      }
    }
    blit(placed, 0, 0, frame.width, frame.height, out, c * frame.width, r * frame.height);
  });

  if (
    (entry.tileable || entry.grid) &&
    entry.targetSize &&
    pitchKnown &&
    Math.abs(detected.x - usedX) / usedX > 0.1
  ) {
    warnings.push(
      `detected pixel pitch ${detected.x.toFixed(2)}x${detected.y.toFixed(2)} differs from targetSize pitch ${usedX.toFixed(2)}x${usedY.toFixed(2)}; check targetSize`,
    );
  } else if (
    (entry.tileable || entry.grid) &&
    Math.abs(usedX - usedY) / Math.max(usedX, usedY) > PITCH_AXIS_AGREEMENT
  ) {
    // Works even when no grid was detected: AI pixels are square, so unequal pitches mean the
    // image isn't exactly the sheet/texture (extra margin, or wrong targetSize/grid).
    warnings.push(
      `pixels come out non-square (${usedX.toFixed(2)}x${usedY.toFixed(2)} source px each); crop the image to its grid or check targetSize/grid — the pitch differs from targetSize`,
    );
  }
  const seams = entry.tileable ? checkSeams(out, entry.tileable) : [];
  return {
    image: out,
    pitch: { usedX, usedY, detectedX: detected.x, detectedY: detected.y },
    removedFraction,
    far: [...far.values()].sort((a, b) => b.count - a.count || a.color - b.color),
    seams,
    warnings,
  };
}
