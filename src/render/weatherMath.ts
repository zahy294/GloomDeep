import { WEATHER_FX } from '../config';
import type { ParticleKind, ParticleRule } from '../data/biomeVisuals';
import { VISUALS } from './biomeBlend';

/** How strongly a biome particle rule applies right now (0..1), from the time of day. */
export function ruleStrength(
  when: ParticleRule['when'],
  time: { daylight: number; night: number; dusk: number },
): number {
  switch (when) {
    case 'always':
      return 1;
    case 'day':
      return time.daylight;
    case 'dusk':
      return time.dusk;
    case 'night':
      return time.night;
  }
}

/**
 * Particles of `kind` wanted alive at the camera: each place's rule count, weighted by how much
 * the camera is in that place (`weights`, VISUALS order) and by the time of day.
 */
export function particleTarget(
  weights: Float32Array,
  kind: ParticleKind,
  time: { daylight: number; night: number; dusk: number },
): number {
  let total = 0;
  for (let i = 0; i < VISUALS.length; i++) {
    const w = weights[i] ?? 0;
    if (w <= 0) continue;
    const rules = VISUALS[i]?.particles;
    if (!rules) continue;
    for (const rule of rules) {
      if (rule.kind === kind) total += w * rule.count * ruleStrength(rule.when, time);
    }
  }
  return total;
}

/** Sideways speed of falling rain for a wind of −1..1. */
export function rainDrift(wind: number): number {
  return wind * WEATHER_FX.rain.windDrift;
}

/**
 * Sprite rotation (radians, clockwise positive) that lays a vertical streak along the velocity of
 * a falling drop: a drop moving right as it falls leans with its top to the left.
 */
export function streakRotation(vx: number, vy: number): number {
  return -Math.atan2(vx, vy);
}

/** Raindrops wanted alive: none in dry weather or indoors, all of them in a downpour. */
export function rainTargetCount(rain: number, outdoors: number, density: number): number {
  if (rain <= WEATHER_FX.rain.minIntensity) return 0;
  return Math.round(WEATHER_FX.caps.rain * Math.min(1, rain) * outdoors * density);
}

/** Seconds a drop takes to cross the spawn margin and the whole view height. */
export function rainFallSeconds(viewHeight: number): number {
  return (viewHeight + 2 * WEATHER_FX.rain.marginPx) / WEATHER_FX.rain.fallSpeed;
}

/**
 * Horizontal range to spawn drops over, at the top of the view, so that after drifting for
 * `fallSeconds` at `drift` px/s they cover the view's whole width.
 */
export function rainSpawnRange(
  viewX: number,
  viewWidth: number,
  drift: number,
  fallSeconds: number,
  padPx: number,
  out: { min: number; max: number } = { min: 0, max: 0 },
): { min: number; max: number } {
  const shift = drift * fallSeconds * 0.5;
  out.min = viewX - shift - padPx;
  out.max = viewX + viewWidth - shift + padPx;
  return out;
}
