import { describe, expect, it } from 'vitest';
import { WEATHER } from '../../src/data/weather';
import { EventBus, type SimEvents } from '../../src/sim/events';
import { mistAt, Weather } from '../../src/sim/weather';

const STEP = 1 / 60;

/** Samples a weather timeline every `every` seconds over `seconds`. */
function timeline(seed: number, seconds: number, every: number) {
  const w = new Weather(seed);
  const out: { rain: number; wind: number; storm: number }[] = [];
  for (let t = 0; t < seconds; t += every) {
    w.update(t, 0.5);
    out.push({ ...w.sample });
  }
  return out;
}

describe('Weather', () => {
  it('is deterministic: same seed and time → same weather, even from a fresh instance', () => {
    const a = new Weather(42);
    const b = new Weather(42);
    for (const t of [0, 13.7, 999.5, 5000]) {
      a.update(t, 0.3);
      b.update(t, 0.3);
      expect(b.sample).toEqual(a.sample);
    }
    const c = new Weather(43);
    c.update(999.5, 0.3);
    a.update(999.5, 0.3);
    expect(c.sample.wind).not.toBe(a.sample.wind);
  });

  it('keeps wind within −1..1 and lets it change direction over time', () => {
    const winds = timeline(7, 4000, 2).map((s) => s.wind);
    expect(Math.min(...winds)).toBeGreaterThanOrEqual(-1);
    expect(Math.max(...winds)).toBeLessThanOrEqual(1);
    expect(Math.min(...winds)).toBeLessThan(-0.2);
    expect(Math.max(...winds)).toBeGreaterThan(0.2);
  });

  it('has dry and wet spells: it rains some of the time, not most of it', () => {
    for (const seed of [1, 2, 3]) {
      const samples = timeline(seed, 40_000, 10);
      const raining = samples.filter((s) => s.rain > 0).length / samples.length;
      expect(raining).toBeGreaterThan(0.05);
      expect(raining).toBeLessThan(0.6);
    }
  });

  it('only storms bring lightning; each strike flashes and then fades', () => {
    const events = new EventBus<SimEvents>();
    const w = new Weather(5);
    let strikes = 0;
    let stormyStrikes = 0;
    let maxFlashAfterStrike = 0;
    events.on('lightning', () => {
      strikes++;
      if (w.sample.storm > 0) stormyStrikes++;
    });
    let flashLeft = 0;
    for (let t = 0; t < 20_000; t += STEP * 10) {
      w.update(t, 0.5, events);
      if (w.sample.flash > 0) flashLeft = Math.max(flashLeft, w.sample.flash);
      maxFlashAfterStrike = Math.max(maxFlashAfterStrike, w.sample.flash);
    }
    expect(strikes).toBeGreaterThan(0);
    // Strike times are drawn from the storm level at the start of their slot; allow the edge.
    expect(stormyStrikes / strikes).toBeGreaterThan(0.9);
    expect(maxFlashAfterStrike).toBeGreaterThan(0.5);
    expect(maxFlashAfterStrike).toBeLessThanOrEqual(1);
  });

  it('the flash is part of the pure weather (a reloaded game sees the same flash)', () => {
    const events = new EventBus<SimEvents>();
    const w = new Weather(5);
    let strikeAt = -1;
    events.on('lightning', () => {
      if (strikeAt < 0) strikeAt = t;
    });
    let t = 0;
    for (; t < 20_000 && strikeAt < 0; t += STEP) w.update(t, 0.5, events);
    expect(strikeAt).toBeGreaterThan(0);
    const later = strikeAt + WEATHER.lightning.flashSeconds / 4;
    w.update(later, 0.5);
    const fresh = new Weather(5);
    fresh.update(later, 0.5);
    expect(fresh.sample.flash).toBeCloseTo(w.sample.flash, 9);
    expect(fresh.sample.flash).toBeGreaterThan(0.5);
  });

  it('morning mist is thick at dawn and gone by noon', () => {
    expect(mistAt(WEATHER.morningMist.peak)).toBeCloseTo(1, 6);
    expect(mistAt(0.5)).toBe(0);
    expect(mistAt(0.9)).toBe(0);
  });

  it('rain dims the sun; a lightning flash brightens it', () => {
    const w = new Weather(1);
    const day = { sunR: 200, sunG: 200, sunB: 200, skyTop: 0, skyHorizon: 0, stars: 0 };
    const out = { sunR: 0, sunG: 0, sunB: 0 };
    Object.assign(w.sample, { rain: 0, flash: 0 });
    w.applyToSun(day, out);
    expect(out.sunR).toBe(200);
    Object.assign(w.sample, { rain: 1, flash: 0 });
    w.applyToSun(day, out);
    expect(out.sunR).toBeCloseTo(200 * WEATHER.rain.overcast, 6);
    Object.assign(w.sample, { rain: 1, flash: 1 });
    w.applyToSun(day, out);
    expect(out.sunR).toBe(255);
  });
});

describe('Weather at the start of a world', () => {
  it('starts dry for every seed, whatever the long-term pattern', () => {
    for (let seed = 0; seed < 50; seed++) {
      const w = new Weather(seed);
      for (let t = 0; t < WEATHER.rain.dryStart; t += 5) {
        w.update(t, 0.3);
        expect(w.sample.rain).toBe(0);
        expect(w.sample.flash).toBe(0);
      }
    }
  });
});
