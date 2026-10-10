/**
 * Day–night keyframes (plan 2.4), interpolated smoothly by day fraction (0 = midnight, 0.25 =
 * dawn, 0.5 = noon, 0.75 = dusk). `sun` is the sunlight colour/strength fed into the light grid
 * (0–255); the sky colours are for the sky gradient (top of the screen → horizon).
 */
export interface DayKeyframe {
  readonly t: number;
  readonly sun: readonly [number, number, number];
  readonly skyTop: number;
  readonly skyHorizon: number;
  /** 0–1: how visible stars are. */
  readonly stars: number;
}

export const DAY_KEYFRAMES: readonly DayKeyframe[] = [
  { t: 0.0, sun: [40, 48, 82], skyTop: 0x07060c, skyHorizon: 0x14243a, stars: 1 },
  { t: 0.2, sun: [44, 50, 86], skyTop: 0x0b1f24, skyHorizon: 0x2c3a5c, stars: 0.8 },
  { t: 0.25, sun: [210, 140, 112], skyTop: 0x3c4660, skyHorizon: 0xf0a0b0, stars: 0.2 },
  { t: 0.32, sun: [240, 222, 196], skyTop: 0x5e6c8a, skyHorizon: 0xf2cc5a, stars: 0 },
  { t: 0.5, sun: [255, 250, 238], skyTop: 0x5e86a6, skyHorizon: 0xd6e0f0, stars: 0 },
  { t: 0.68, sun: [248, 226, 190], skyTop: 0x5e6c8a, skyHorizon: 0xffd88a, stars: 0 },
  { t: 0.75, sun: [236, 128, 70], skyTop: 0x45365a, skyHorizon: 0xdc6420, stars: 0.1 },
  { t: 0.8, sun: [70, 54, 84], skyTop: 0x14101e, skyHorizon: 0x5a2440, stars: 0.6 },
  { t: 1.0, sun: [40, 48, 82], skyTop: 0x07060c, skyHorizon: 0x14243a, stars: 1 },
];

/** Named times for the `?time=` debug parameter and debug keys. */
export const NAMED_TIMES = {
  midnight: 0,
  dawn: 0.25,
  morning: 0.32,
  noon: 0.5,
  sunset: 0.74,
  dusk: 0.75,
  night: 0.9,
} as const;

export type NamedTime = keyof typeof NAMED_TIMES;

/** The sky of a Dimming night (M12): Dimming mixes the night sky towards these (DIMMING.skyMix). */
export const DIMMING_SKY = { top: 0x05030a, horizon: 0x1a0f2a } as const;
