/**
 * Weather and wind (plan 2.4). The sim derives them from the world seed and the simulated time, so
 * they are deterministic and need nothing saved. Biome-specific looks (Mire fog, petals, embers)
 * are render data in biomeVisuals.ts; this is the shared sky over the whole world.
 * Times are simulated seconds.
 */
export const WEATHER = {
  wind: {
    /** Slow drift of the prevailing wind (−1 = full west, +1 = full east). */
    wavelength: 140,
    /** Short gusts layered on top. */
    gustWavelength: 6,
    gustWeight: 0.3,
    /** Rain makes it windier: wind magnitude is scaled up by this at full rain. */
    rainBoost: 0.5,
  },
  rain: {
    /** Wet and dry spells: rain where this slow noise rises above `start`, full rain at `full`. */
    wavelength: 520,
    start: 0.6,
    full: 0.78,
    /** Sunlight multiplier at full rain (overcast). */
    overcast: 0.7,
    /** A new world starts dry: no rain before `dryStart` s, then the pattern fades in. */
    dryStart: 600,
    dryFade: 240,
  },
  storm: {
    /** Rain above this intensity can bring lightning, more often the heavier it rains. */
    start: 0.8,
    /** Mean seconds between strikes at the heaviest rain. */
    meanInterval: 8,
    /** Strike times are drawn per slot of this length (s). */
    slotSeconds: 1,
  },
  lightning: {
    /** The flash decays to nothing over this long... */
    flashSeconds: 0.45,
    /** ...starting from this much extra sunlight per channel (0–255). */
    sunBoost: 170,
    /** Thunder follows the flash after this delay (audio, s). */
    thunderDelay: 1.6,
  },
  /** Morning mist: thick around dawn, burnt off by midday (day fractions; 0.25 = dawn). */
  morningMist: { peak: 0.26, halfWidth: 0.09 },
} as const;
