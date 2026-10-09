import { describe, expect, it } from 'vitest';
import { WEATHER_FX } from '../../src/config';
import { VISUALS } from '../../src/render/biomeBlend';
import {
  particleTarget,
  rainDrift,
  rainFallSeconds,
  rainSpawnRange,
  rainTargetCount,
  ruleStrength,
  streakRotation,
} from '../../src/render/weatherMath';

const noon = { daylight: 1, night: 0, dusk: 0 };
const midnight = { daylight: 0, night: 1, dusk: 0 };

describe('streakRotation', () => {
  it('is upright for straight-down rain', () => {
    expect(streakRotation(0, 500)).toBeCloseTo(0);
  });

  it('tilts the top back against the direction of travel', () => {
    expect(streakRotation(100, 500)).toBeLessThan(0);
    expect(streakRotation(-100, 500)).toBeGreaterThan(0);
  });
});

describe('rainDrift', () => {
  it('follows the wind direction and strength', () => {
    expect(rainDrift(0)).toBe(0);
    expect(rainDrift(1)).toBe(WEATHER_FX.rain.windDrift);
    expect(rainDrift(-0.5)).toBeCloseTo(-WEATHER_FX.rain.windDrift / 2);
  });
});

describe('rainTargetCount', () => {
  it('is zero in dry weather and indoors', () => {
    expect(rainTargetCount(0, 1, 1)).toBe(0);
    expect(rainTargetCount(WEATHER_FX.rain.minIntensity, 1, 1)).toBe(0);
    expect(rainTargetCount(1, 0, 1)).toBe(0);
  });

  it('scales with intensity, outdoors and the quality density', () => {
    expect(rainTargetCount(1, 1, 1)).toBe(WEATHER_FX.caps.rain);
    expect(rainTargetCount(0.5, 1, 1)).toBe(Math.round(WEATHER_FX.caps.rain / 2));
    expect(rainTargetCount(1, 1, 0.35)).toBeLessThan(rainTargetCount(1, 1, 0.7));
  });
});

describe('rainSpawnRange', () => {
  it('covers the view width and shifts upwind of the drift', () => {
    const calm = rainSpawnRange(1000, 960, 0, rainFallSeconds(540), 32);
    expect(calm.min).toBe(968);
    expect(calm.max).toBe(1992);
    const windy = rainSpawnRange(1000, 960, 200, rainFallSeconds(540), 32);
    expect(windy.min).toBeLessThan(calm.min);
    expect(windy.max - windy.min).toBe(calm.max - calm.min);
  });
});

describe('ruleStrength and particleTarget', () => {
  it('follows the time of day', () => {
    expect(ruleStrength('always', noon)).toBe(1);
    expect(ruleStrength('day', noon)).toBe(1);
    expect(ruleStrength('night', noon)).toBe(0);
    expect(ruleStrength('night', midnight)).toBe(1);
    expect(ruleStrength('dusk', { daylight: 0.4, night: 0.6, dusk: 0.7 })).toBe(0.7);
  });

  it('wants leaves in the elderglade and petals in the moonpetal vale', () => {
    const at = (key: string) => {
      const w = new Float32Array(VISUALS.length);
      w[VISUALS.findIndex((v) => v.key === key)] = 1;
      return w;
    };
    expect(particleTarget(at('elderglade'), 'leaf', noon)).toBeGreaterThan(0);
    expect(particleTarget(at('elderglade'), 'petal', noon)).toBe(0);
    expect(particleTarget(at('moonpetal_vale'), 'petal', noon)).toBeGreaterThan(0);
  });

  it('blends the counts of neighbouring places by weight', () => {
    const w = new Float32Array(VISUALS.length);
    const ei = VISUALS.findIndex((v) => v.key === 'elderglade');
    w[ei] = 0.5;
    const half = particleTarget(w, 'leaf', noon);
    w[ei] = 1;
    expect(particleTarget(w, 'leaf', noon)).toBeCloseTo(half * 2);
  });
});
