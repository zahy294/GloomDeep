import { ATMOSPHERE } from '../config';

const clamp01 = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t);

/** Linear mix of two 0xRRGGBB colours. */
export function mixColor(a: number, b: number, t: number): number {
  const k = clamp01(t);
  const r = ((a >> 16) & 0xff) * (1 - k) + ((b >> 16) & 0xff) * k;
  const g = ((a >> 8) & 0xff) * (1 - k) + ((b >> 8) & 0xff) * k;
  const bl = (a & 0xff) * (1 - k) + (b & 0xff) * k;
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(bl);
}

/** Per-channel multiply of two colours (a * b / 255). */
export function multiplyColor(a: number, b: number): number {
  const r = (((a >> 16) & 0xff) * ((b >> 16) & 0xff)) / 255;
  const g = (((a >> 8) & 0xff) * ((b >> 8) & 0xff)) / 255;
  const bl = ((a & 0xff) * (b & 0xff)) / 255;
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(bl);
}

/** Sum of absolute channel differences, to decide whether a tint changed enough to re-apply. */
export function colorDistance(a: number, b: number): number {
  return (
    Math.abs(((a >> 16) & 0xff) - ((b >> 16) & 0xff)) +
    Math.abs(((a >> 8) & 0xff) - ((b >> 8) & 0xff)) +
    Math.abs((a & 0xff) - (b & 0xff))
  );
}

/**
 * Screen y of a parallax layer's bottom edge. `below` is how far (world px) the camera centre is
 * under the ground line: positive underground, so the layer rises and slides off the top.
 */
export function parallaxBottom(
  viewHeight: number,
  below: number,
  layer: number,
  fractions: readonly number[] = ATMOSPHERE.parallax.bottomFraction,
  factors: readonly number[] = ATMOSPHERE.parallax.verticalFactor,
): number {
  return viewHeight * (fractions[layer] ?? 1) - below * (factors[layer] ?? 0);
}

/** Time-of-day light on a tint: white at noon, darker and slightly blue at night (never black). */
export function daylightTint(
  daylight: number,
  nightFloor: number = ATMOSPHERE.parallax.nightFloor,
  nightTint: number = ATMOSPHERE.parallax.nightTint,
): number {
  const level = nightFloor + (1 - nightFloor) * clamp01(daylight);
  const dim = mixColor(0x000000, 0xffffff, level);
  const cool = mixColor(nightTint, 0xffffff, clamp01(daylight));
  return multiplyColor(dim, cool);
}

/**
 * Tint of one parallax layer. Placeholders get their biome colour hazed towards the sky horizon
 * (farther layers more) and then the time-of-day light; approved art is fully coloured with the
 * haze painted in, so it gets only the time-of-day light.
 */
export function layerTint(
  approved: boolean,
  base: number,
  haze: number,
  horizon: number,
  daylight: number,
): number {
  const light = daylightTint(daylight);
  return approved ? light : multiplyColor(mixColor(base, horizon, haze), light);
}

/** Back/front mist opacity: the biome's mist thickened by morning mist, scaled per layer and by presence. */
export function mistAlpha(
  base: number,
  dawnBoost: number,
  weatherMist: number,
  scale: number,
  presence: number,
): number {
  return Math.min(1, base * (1 + weatherMist * dawnBoost) * scale * clamp01(presence));
}

/** Sky colour under weather: greyer and darker in rain, pale white in a lightning flash. */
export function weatherSky(colour: number, rain: number, flash: number): number {
  const r = (colour >> 16) & 0xff;
  const g = (colour >> 8) & 0xff;
  const b = colour & 0xff;
  const lum = Math.round(0.3 * r + 0.59 * g + 0.11 * b);
  const grey = mixColor(colour, (lum << 16) | (lum << 8) | lum, rain * ATMOSPHERE.sky.rainGrey);
  const dark = mixColor(grey, 0x000000, rain * ATMOSPHERE.sky.rainDarken);
  return mixColor(dark, ATMOSPHERE.sky.flashColor, flash * ATMOSPHERE.sky.flashMix);
}

/** Foreground canopy opacity from the blended biome weight and how outdoors the camera is. */
export function canopyAlpha(weight: number, outdoors: number, peak: number): number {
  return clamp01(weight) * clamp01(outdoors) * peak;
}
