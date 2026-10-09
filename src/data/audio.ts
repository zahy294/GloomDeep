/**
 * Procedural sound design (plan 3.6) used until real recordings are approved. Frequencies in Hz,
 * times in seconds, gains 0..1. Each ambient event fires at `rate` × layer level per second.
 */
export const SOUND_DESIGN = {
  wind: { filterLow: 280, filterHigh: 900, q: 0.7, gain: 0.32 },
  rain: { filter: 2600, q: 0.6, gain: 0.26 },
  rumble: { filter: 110, toneHz: 46, toneGain: 0.18, gain: 0.5 },
  birds: {
    rate: 0.45,
    chirps: [2, 5],
    from: [2200, 3400],
    to: [3000, 4600],
    length: [0.06, 0.14],
    gap: 0.05,
    gain: 0.07,
  },
  crickets: {
    rate: 1.4,
    hz: [4200, 5200],
    pulseHz: 28,
    length: [0.18, 0.4],
    gain: 0.025,
  },
  drips: { rate: 0.6, hz: [700, 1600], drop: 0.55, decay: 0.35, gain: 0.12, echo: 0.28 },
  chimes: { rate: 0.18, octaveUp: 24, decay: 2.8, gain: 0.06 },
  thunder: { filter: 180, decay: 3.2, gain: 0.7, crackFilter: 1800, crackGain: 0.25 },
  music: {
    /** Pads: a new chord every `chordBeats`, voiced root–fifth–octave(+third) from the scale. */
    chordBeats: 16,
    padAttack: 3,
    padRelease: 4,
    padGain: 0.05,
    /** Melody: chance per beat of a note, its length in beats, octave above the pad. */
    melodyChance: 0.32,
    melodyBeats: 2,
    melodyOctave: 12,
    melodyGain: 0.06,
    melodyAttack: 0.02,
    melodyDecay: 2.2,
  },
  /** Oscillator types and low-pass cutoff per music timbre (biomeVisuals.ts `music.timbre`). */
  timbres: {
    warm: { pad: 'triangle', lead: 'triangle', cutoff: 1400 },
    glass: { pad: 'sine', lead: 'sine', cutoff: 5200 },
    hollow: { pad: 'square', lead: 'triangle', cutoff: 700 },
    low: { pad: 'sawtooth', lead: 'triangle', cutoff: 420 },
  },
} as const;

export type Timbre = keyof typeof SOUND_DESIGN.timbres;
