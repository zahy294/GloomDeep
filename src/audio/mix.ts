import { AUDIO } from '../config';
import type { BiomeVisual } from '../data/biomeVisuals';

/** What the audio needs from the frame's visual state (see src/render/VisualState.ts). */
export interface AudioInputs {
  readonly weights: Float32Array;
  readonly outdoors: number;
  readonly daylight: number;
  readonly night: number;
  readonly dusk: number;
  readonly wind: number;
  readonly rain: number;
  readonly underwater: boolean;
}

export interface AmbienceLevels {
  wind: number;
  rain: number;
  birds: number;
  crickets: number;
  drips: number;
  chimes: number;
  rumble: number;
}

export function emptyLevels(): AmbienceLevels {
  return { wind: 0, rain: 0, birds: 0, crickets: 0, drips: 0, chimes: 0, rumble: 0 };
}

/** Accumulator reused by every `ambienceLevels` call (audio is single-threaded, called per frame). */
const scratch = emptyLevels();

/**
 * Ambient layer levels (0..1) for this moment: each place's ambience blended by its weight, then
 * shaped by time and weather — birds sing by day, crickets at dusk and night, wind follows the
 * wind strength, rain is heard outdoors. Writes into `out`.
 */
export function ambienceLevels(
  input: AudioInputs,
  visuals: readonly BiomeVisual[],
  out: AmbienceLevels,
): AmbienceLevels {
  const o = scratch;
  o.wind = o.birds = o.crickets = o.drips = o.chimes = o.rumble = 0;
  let total = 0;
  for (let i = 0; i < visuals.length; i++) {
    const w = input.weights[i] ?? 0;
    const v = visuals[i];
    if (w <= 0 || !v) continue;
    total += w;
    o.wind += v.ambience.wind * w;
    o.birds += v.ambience.birds * w;
    o.crickets += v.ambience.crickets * w;
    o.drips += v.ambience.drips * w;
    o.chimes += v.ambience.chimes * w;
    o.rumble += v.ambience.rumble * w;
  }
  const norm = total > 0 ? 1 / total : 0;
  const windStrength = AUDIO.windFloor + (1 - AUDIO.windFloor) * Math.abs(input.wind);
  out.wind = clamp01(o.wind * norm * windStrength + input.rain * input.outdoors * AUDIO.rainWind);
  out.rain = clamp01(input.rain * input.outdoors);
  out.birds = clamp01(o.birds * norm * input.daylight * (1 - input.rain));
  out.crickets = clamp01(o.crickets * norm * Math.max(input.night, input.dusk));
  out.drips = clamp01(o.drips * norm);
  out.chimes = clamp01(o.chimes * norm);
  out.rumble = clamp01(o.rumble * norm);
  if (input.underwater) {
    // Muffled: high, airy layers fade under water (plan 3.6).
    out.birds *= AUDIO.underwaterAiry;
    out.crickets *= AUDIO.underwaterAiry;
    out.chimes *= AUDIO.underwaterAiry;
    out.wind *= AUDIO.underwaterAiry;
  }
  return out;
}

export interface MusicShare {
  index: number;
  gain: number;
}

/** Reusable result of `musicMix`: the first `count` entries of `shares` are valid. */
export interface MusicMix {
  count: number;
  readonly shares: [MusicShare, MusicShare];
}

export function createMusicMix(): MusicMix {
  return {
    count: 0,
    shares: [
      { index: 0, gain: 0 },
      { index: 0, gain: 0 },
    ],
  };
}

/**
 * The (up to) two most present places and their music gains, for crossfading biome music.
 * Writes into `out` so the per-frame call allocates nothing.
 */
export function musicMix(weights: Float32Array, out: MusicMix): MusicMix {
  let a = -1;
  let b = -1;
  for (let i = 0; i < weights.length; i++) {
    const w = weights[i] ?? 0;
    if (a < 0 || w > (weights[a] ?? 0)) {
      b = a;
      a = i;
    } else if (b < 0 || w > (weights[b] ?? 0)) {
      b = i;
    }
  }
  const wa = a >= 0 ? (weights[a] ?? 0) : 0;
  const wb = b >= 0 ? (weights[b] ?? 0) : 0;
  const sum = wa + wb;
  out.count = 0;
  if (a >= 0 && wa > 0) addShare(out, a, wa / sum);
  if (b >= 0 && wb > AUDIO.musicMinWeight) addShare(out, b, wb / sum);
  return out;
}

function addShare(out: MusicMix, index: number, gain: number): void {
  const share = out.shares[out.count];
  if (!share) return;
  share.index = index;
  share.gain = gain;
  out.count++;
}

/** MIDI note → frequency (Hz). */
export function midiToHz(note: number): number {
  return 440 * 2 ** ((note - 69) / 12);
}

/** A note from the scale: degree index, octave offset from the root. */
export function scaleNote(root: number, scale: readonly number[], degree: number): number {
  const n = scale.length;
  const octave = Math.floor(degree / n);
  const step = scale[((degree % n) + n) % n] ?? 0;
  return root + octave * 12 + step;
}

/**
 * Next melody degree: a small step from the previous one (−2..+2 degrees), kept within
 * ±AUDIO.melodyRange degrees of the root so lines wander but stay singable.
 */
export function nextDegree(previous: number, random: () => number): number {
  const step = Math.floor(random() * 5) - 2;
  const next = previous + step;
  const r = AUDIO.melodyRange;
  return next >= r ? r - 1 : next <= -r ? -r + 1 : next;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
