import { describe, expect, it } from 'vitest';
import {
  ambienceLevels,
  emptyLevels,
  midiToHz,
  musicMix,
  nextDegree,
  scaleNote,
  type AudioInputs,
} from '../../src/audio/mix';
import { AUDIO } from '../../src/config';
import { VISUALS } from '../../src/render/biomeBlend';
import { mulberry32 } from '../../src/sim/random';

const GLADE = VISUALS.findIndex((v) => v.key === 'elderglade');
const EMBER = VISUALS.findIndex((v) => v.key === 'ember_roots');

function input(over: Partial<AudioInputs> = {}, weightsAt = GLADE): AudioInputs {
  const weights = new Float32Array(VISUALS.length);
  weights[weightsAt] = 1;
  return {
    weights,
    outdoors: 1,
    daylight: 1,
    night: 0,
    dusk: 0,
    wind: 0.5,
    rain: 0,
    underwater: false,
    ...over,
  };
}

describe('ambienceLevels', () => {
  it('birds sing in the glade by day and fall silent at night, when crickets start', () => {
    const day = ambienceLevels(input(), VISUALS, emptyLevels());
    expect(day.birds).toBeGreaterThan(0.5);
    expect(day.crickets).toBe(0);
    const night = ambienceLevels(input({ daylight: 0, night: 1 }), VISUALS, emptyLevels());
    expect(night.birds).toBe(0);
    expect(night.crickets).toBeGreaterThan(0.2);
  });

  it('the Ember Roots rumble and have no birds', () => {
    const l = ambienceLevels(input({}, EMBER), VISUALS, emptyLevels());
    expect(l.rumble).toBeGreaterThan(0.5);
    expect(l.birds).toBe(0);
  });

  it('rain is heard outdoors, not underground, and silences the birds', () => {
    const out = ambienceLevels(input({ rain: 1 }), VISUALS, emptyLevels());
    expect(out.rain).toBe(1);
    expect(out.birds).toBe(0);
    const under = ambienceLevels(input({ rain: 1, outdoors: 0 }), VISUALS, emptyLevels());
    expect(under.rain).toBe(0);
  });

  it('stronger wind is louder, never fully silent', () => {
    const calm = ambienceLevels(input({ wind: 0 }), VISUALS, emptyLevels());
    const gale = ambienceLevels(input({ wind: -1 }), VISUALS, emptyLevels());
    expect(calm.wind).toBeGreaterThan(0);
    expect(gale.wind).toBeGreaterThan(calm.wind);
  });

  it('is muffled under water', () => {
    const dry = ambienceLevels(input(), VISUALS, emptyLevels());
    const wet = ambienceLevels(input({ underwater: true }), VISUALS, emptyLevels());
    expect(wet.birds).toBeCloseTo(dry.birds * AUDIO.underwaterAiry, 6);
  });
});

describe('musicMix', () => {
  it('plays one place alone, or crossfades the two most present places', () => {
    const w = new Float32Array(VISUALS.length);
    w[GLADE] = 1;
    expect(musicMix(w)).toEqual([{ index: GLADE, gain: 1 }]);
    w[GLADE] = 0.6;
    w[1] = 0.3;
    w[2] = 0.1;
    const mix = musicMix(w);
    expect(mix.map((m) => m.index)).toEqual([GLADE, 1]);
    expect(mix[0]!.gain).toBeCloseTo(0.6 / 0.9, 6);
  });

  it('ignores a barely-present second place', () => {
    const w = new Float32Array(VISUALS.length);
    w[GLADE] = 0.97;
    w[1] = AUDIO.musicMinWeight / 2;
    expect(musicMix(w)).toHaveLength(1);
  });
});

describe('notes', () => {
  it('maps scale degrees across octaves and MIDI to Hz', () => {
    const scale = [0, 2, 4, 7, 9];
    expect(scaleNote(60, scale, 0)).toBe(60);
    expect(scaleNote(60, scale, 3)).toBe(67);
    expect(scaleNote(60, scale, 5)).toBe(72);
    expect(scaleNote(60, scale, -1)).toBe(57);
    expect(midiToHz(69)).toBe(440);
    expect(midiToHz(81)).toBeCloseTo(880, 6);
  });

  it('melodies move in small steps and stay in range', () => {
    const random = mulberry32(3);
    let d = 0;
    for (let i = 0; i < 2000; i++) {
      const next = nextDegree(d, random);
      expect(Math.abs(next - d)).toBeLessThanOrEqual(2);
      expect(Math.abs(next)).toBeLessThan(AUDIO.melodyRange);
      d = next;
    }
  });
});
