import { DAY_KEYFRAMES, type DayKeyframe } from '../data/dayCycle';

export interface DaySample {
  /** Sunlight 0–255 per channel. */
  sunR: number;
  sunG: number;
  sunB: number;
  skyTop: number;
  skyHorizon: number;
  stars: number;
}

const smooth = (t: number) => t * t * (3 - 2 * t);

function lerpColor(a: number, b: number, t: number): number {
  const ch = (shift: number) =>
    Math.round(((a >> shift) & 0xff) + (((b >> shift) & 0xff) - ((a >> shift) & 0xff)) * t);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

/**
 * Smoothly interpolated day-cycle values at `dayFraction` (0..1, wraps). Writes into `out` so the
 * per-frame sky and per-step light updates don't allocate.
 */
export function sampleDayCycle(
  dayFraction: number,
  out: DaySample = { sunR: 0, sunG: 0, sunB: 0, skyTop: 0, skyHorizon: 0, stars: 0 },
  keys: readonly DayKeyframe[] = DAY_KEYFRAMES,
): DaySample {
  const t = ((dayFraction % 1) + 1) % 1;
  let i = 0;
  while (i < keys.length - 2 && (keys[i + 1]?.t ?? 1) <= t) i++;
  const a = keys[i];
  const b = keys[i + 1] ?? a;
  if (!a || !b) return out;
  const span = b.t - a.t;
  const k = span > 0 ? smooth(Math.min(1, Math.max(0, (t - a.t) / span))) : 0;
  out.sunR = a.sun[0] + (b.sun[0] - a.sun[0]) * k;
  out.sunG = a.sun[1] + (b.sun[1] - a.sun[1]) * k;
  out.sunB = a.sun[2] + (b.sun[2] - a.sun[2]) * k;
  out.skyTop = lerpColor(a.skyTop, b.skyTop, k);
  out.skyHorizon = lerpColor(a.skyHorizon, b.skyHorizon, k);
  out.stars = a.stars + (b.stars - a.stars) * k;
  return out;
}
