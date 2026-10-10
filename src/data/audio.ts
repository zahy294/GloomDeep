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
    attack: 0.01,
  },
  crickets: {
    rate: 1.4,
    hz: [4200, 5200],
    pulseHz: 28,
    length: [0.18, 0.4],
    gain: 0.025,
    attack: 0.02,
  },
  drips: {
    rate: 0.6,
    hz: [700, 1600],
    drop: 0.55,
    decay: 0.35,
    gain: 0.12,
    echo: 0.28,
    attack: 0.002,
    /** The cave echo is this fraction as loud as the drip. */
    echoGain: 0.35,
  },
  chimes: { rate: 0.18, octaveUp: 24, decay: 2.8, gain: 0.06, attack: 0.005 },
  thunder: {
    filter: 180,
    decay: 3.2,
    gain: 0.7,
    crackFilter: 1800,
    crackGain: 0.25,
    attack: 0.05,
    /** Strike distance varies the delay by `1 - jitter/2 .. 1 + jitter/2` of the base delay. */
    delayJitter: 0.6,
    /** The high crack dies this fraction as slowly as the rumble. */
    crackDecayFactor: 0.2,
  },
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
    /** Scale degrees a new pad chord may be rooted on (repeats weight the pick towards the tonic). */
    chordRootDegrees: [0, 0, 3, 4, 5],
    /** Pad chord tones as scale-degree offsets from the chord root. */
    chordTones: [0, 2, 4],
    /** Pad oscillators are detuned randomly by up to half of this many cents each way. */
    padDetuneCents: 8,
    /** Delay before a freshly created music voice plays its first beat (s). */
    firstBeatDelay: 0.1,
  },
  /**
   * Combat sound effects (M8): an optional filtered noise burst and an optional pitch-swept tone.
   * Hz, seconds, gains 0..1.
   */
  sfxAttack: 0.004,
  sfx: {
    swing: { noise: { type: 'bandpass', hz: 1400, decay: 0.12, gain: 0.12 } },
    shoot: { noise: { type: 'highpass', hz: 2600, decay: 0.08, gain: 0.1 } },
    beam: { tone: { type: 'sine', from: 900, to: 1500, decay: 0.18, gain: 0.08 } },
    hit: {
      noise: { type: 'lowpass', hz: 900, decay: 0.09, gain: 0.2 },
      tone: { type: 'square', from: 220, to: 90, decay: 0.1, gain: 0.05 },
    },
    hurt: { tone: { type: 'sawtooth', from: 330, to: 110, decay: 0.25, gain: 0.08 } },
    kill: {
      noise: { type: 'lowpass', hz: 600, decay: 0.25, gain: 0.18 },
      tone: { type: 'triangle', from: 520, to: 70, decay: 0.32, gain: 0.08 },
    },
    dissolve: { tone: { type: 'sine', from: 1200, to: 180, decay: 0.6, gain: 0.07 } },
    respawn: { tone: { type: 'triangle', from: 440, to: 880, decay: 0.5, gain: 0.07 } },
    // M9 materials.
    splash: { noise: { type: 'bandpass', hz: 900, decay: 0.3, gain: 0.16 } },
    hiss: { noise: { type: 'highpass', hz: 3000, decay: 0.7, gain: 0.12 } },
    ignite: { noise: { type: 'lowpass', hz: 1800, decay: 0.35, gain: 0.12 } },
    thud: {
      noise: { type: 'lowpass', hz: 300, decay: 0.18, gain: 0.25 },
      tone: { type: 'sine', from: 120, to: 50, decay: 0.15, gain: 0.08 },
    },
    // M10 life and village.
    talk: { tone: { type: 'triangle', from: 520, to: 600, decay: 0.12, gain: 0.05 } },
    arrive: { tone: { type: 'triangle', from: 392, to: 784, decay: 0.8, gain: 0.07 } },
    bounce: { tone: { type: 'sine', from: 180, to: 520, decay: 0.25, gain: 0.09 } },
    flutter: { noise: { type: 'bandpass', hz: 2200, decay: 0.25, gain: 0.08 } },
    catch: { tone: { type: 'sine', from: 1300, to: 1900, decay: 0.3, gain: 0.06 } },
    wisp: { tone: { type: 'sine', from: 1600, to: 2400, decay: 0.9, gain: 0.05 } },
    travel: {
      noise: { type: 'highpass', hz: 2400, decay: 0.6, gain: 0.08 },
      tone: { type: 'sine', from: 300, to: 1200, decay: 0.7, gain: 0.07 },
    },
    // M11 towns and folk.
    coin: { tone: { type: 'square', from: 1800, to: 2400, decay: 0.14, gain: 0.04 } },
    quest: { tone: { type: 'triangle', from: 523, to: 1046, decay: 1.1, gain: 0.08 } },
    lamp: {
      noise: { type: 'lowpass', hz: 1400, decay: 0.3, gain: 0.08 },
      tone: { type: 'sine', from: 440, to: 660, decay: 0.4, gain: 0.05 },
    },
    lift: { noise: { type: 'bandpass', hz: 500, decay: 0.7, gain: 0.1 } },
    relight: {
      noise: { type: 'highpass', hz: 1800, decay: 1.2, gain: 0.07 },
      tone: { type: 'sine', from: 196, to: 392, decay: 1.8, gain: 0.1 },
    },
    firework: {
      noise: { type: 'lowpass', hz: 700, decay: 0.5, gain: 0.16 },
      tone: { type: 'sine', from: 900, to: 300, decay: 0.3, gain: 0.04 },
    },
  },
  /** Gain envelope shared by every sound: floor it decays to, minimum decay after the attack, tail before stopping. */
  envelope: { floor: 0.0001, minDecay: 0.01, tail: 0.05 },
  /** Random stereo position spread: pan is drawn from -half..+half. */
  panSpread: 1.6,
  /** Oscillator types and low-pass cutoff per music timbre (biomeVisuals.ts `music.timbre`). */
  timbres: {
    warm: { pad: 'triangle', lead: 'triangle', cutoff: 1400 },
    glass: { pad: 'sine', lead: 'sine', cutoff: 5200 },
    hollow: { pad: 'square', lead: 'triangle', cutoff: 700 },
    low: { pad: 'sawtooth', lead: 'triangle', cutoff: 420 },
  },
} as const;

export type Timbre = keyof typeof SOUND_DESIGN.timbres;
export type SfxKind = keyof typeof SOUND_DESIGN.sfx;
