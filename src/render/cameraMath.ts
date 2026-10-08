/** Pure camera maths (no Phaser) so follow behaviour is unit-tested. */

/**
 * Frame-rate-independent exponential approach: covers the fraction 1 - e^(-rate·dt) of the
 * remaining distance, so the feel is the same at 30, 60 or 144 FPS.
 */
export function approach(current: number, target: number, rate: number, dt: number): number {
  return target + (current - target) * Math.exp(-rate * dt);
}

/** Clamps a camera scroll so the view never shows outside the world (centres if the world is smaller). */
export function clampScroll(scroll: number, viewSize: number, worldSize: number): number {
  if (worldSize <= viewSize) return (worldSize - viewSize) / 2;
  return Math.min(worldSize - viewSize, Math.max(0, scroll));
}

export function clampAbs(value: number, max: number): number {
  return Math.max(-max, Math.min(max, value));
}
