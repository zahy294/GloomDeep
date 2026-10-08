/** Colour maths for the art tools. OKLab is used for every "nearest colour" decision (plan 2.9.6). */

export interface Lab {
  L: number;
  a: number;
  b: number;
}

const toLinear = (c: number) => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};

/** sRGB 0xRRGGBB → OKLab (Björn Ottosson's reference matrices). */
export function rgbToOklab(rgb: number): Lab {
  const r = toLinear((rgb >> 16) & 0xff);
  const g = toLinear((rgb >> 8) & 0xff);
  const b = toLinear(rgb & 0xff);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return {
    L: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  };
}

const fromLinear = (v: number) => {
  const c = v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055;
  return Math.max(0, Math.min(255, Math.round(c * 255)));
};

/** OKLab → sRGB 0xRRGGBB (clamped). */
export function oklabToRgb({ L, a, b }: Lab): number {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const r = fromLinear(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s);
  const g = fromLinear(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s);
  const bl = fromLinear(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s);
  return (r << 16) | (g << 8) | bl;
}

/** Euclidean distance in OKLab (≈ perceptual difference; ~0.02 is barely visible). */
export function oklabDistance(p: Lab, q: Lab): number {
  return Math.hypot(p.L - q.L, p.a - q.a, p.b - q.b);
}

/** Nearest palette colour to `rgb`, with its OKLab distance. Palette Labs can be precomputed. */
export function nearestColor(
  rgb: number,
  palette: readonly number[],
  paletteLab: readonly Lab[] = palette.map(rgbToOklab),
): { color: number; distance: number } {
  const lab = rgbToOklab(rgb);
  let best = palette[0] ?? 0;
  let bestDistance = Infinity;
  for (let i = 0; i < palette.length; i++) {
    const q = paletteLab[i];
    if (!q) continue;
    const d = oklabDistance(lab, q);
    if (d < bestDistance) {
      bestDistance = d;
      best = palette[i] ?? best;
    }
  }
  return { color: best, distance: bestDistance };
}

/** RGB of an RGBA buffer pixel as 0xRRGGBB. */
export function rgbAt(data: Uint8Array, i: number): number {
  return ((data[i] ?? 0) << 16) | ((data[i + 1] ?? 0) << 8) | (data[i + 2] ?? 0);
}

export function toHex(rgb: number): string {
  return `#${rgb.toString(16).padStart(6, '0')}`;
}
