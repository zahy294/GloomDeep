import { describe, expect, it } from 'vitest';
import {
  canopyAlpha,
  colorDistance,
  mistAlpha,
  mixColor,
  multiplyColor,
  parallaxBottom,
  layerTint,
  weatherSky,
} from '../../src/render/atmosphereMath';

describe('colour helpers', () => {
  it('mixes and multiplies', () => {
    expect(mixColor(0x000000, 0xffffff, 0.5)).toBe(0x808080);
    expect(mixColor(0x102030, 0x102030, 0.7)).toBe(0x102030);
    expect(multiplyColor(0xff8000, 0x808080)).toBe(0x804000);
    expect(colorDistance(0x010203, 0x020406)).toBe(6);
  });
});

describe('parallaxBottom', () => {
  const fractions = [0.5, 1];
  const factors = [0.1, 0.3];
  it('sits at the fraction at ground level', () => {
    expect(parallaxBottom(500, 0, 0, fractions, factors)).toBe(250);
    expect(parallaxBottom(500, 0, 1, fractions, factors)).toBe(500);
  });
  it('rises underground, nearer layers faster, and sinks when above the ground line', () => {
    expect(parallaxBottom(500, 100, 1, fractions, factors)).toBe(470);
    expect(parallaxBottom(500, 100, 0, fractions, factors)).toBe(240);
    expect(parallaxBottom(500, -100, 0, fractions, factors)).toBe(260);
  });
});

describe('parallaxTint', () => {
  const base = 0x205030;
  const horizon = 0xa0c0ff;
  it('hazier layers are closer to the horizon colour', () => {
    const near = layerTint(false, base, 0.1, horizon, 1);
    const far = layerTint(false, base, 0.8, horizon, 1);
    expect(colorDistance(far, horizon)).toBeLessThan(colorDistance(near, horizon));
  });
  it('night is darker than day but never black', () => {
    const day = layerTint(false, base, 0.3, horizon, 1);
    const night = layerTint(false, base, 0.3, horizon, 0);
    expect(colorDistance(night, 0)).toBeLessThan(colorDistance(day, 0));
    expect(night).not.toBe(0);
  });
});

describe('layerTint approval', () => {
  it('approved art ignores biome colour and haze', () => {
    expect(layerTint(true, 0x205030, 0.8, 0xa0c0ff, 1)).toBe(0xffffff);
    expect(layerTint(true, 0x111111, 0.1, 0x000000, 1)).toBe(0xffffff);
  });
  it('approved art still dims and cools at night', () => {
    const night = layerTint(true, 0x205030, 0.8, 0xa0c0ff, 0);
    expect(night).not.toBe(0xffffff);
    expect(night & 0xff).toBeGreaterThan((night >> 16) & 0xff);
  });
});

describe('mistAlpha', () => {
  it('thickens with morning mist and fades with presence', () => {
    expect(mistAlpha(0.2, 0.5, 0, 1, 1)).toBeCloseTo(0.2);
    expect(mistAlpha(0.2, 0.5, 1, 1, 1)).toBeCloseTo(0.3);
    expect(mistAlpha(0.2, 0.5, 1, 1, 0)).toBe(0);
    expect(mistAlpha(0.2, 0, 0, 0.5, 1)).toBeCloseTo(0.1);
  });
});

describe('weatherSky', () => {
  it('is unchanged in clear weather, greyer in rain, pale in a flash', () => {
    expect(weatherSky(0x3060c0, 0, 0)).toBe(0x3060c0);
    const rainy = weatherSky(0x3060c0, 1, 0);
    expect(colorDistance(rainy, 0x3060c0)).toBeGreaterThan(30);
    const flash = weatherSky(0x3060c0, 0, 1);
    expect(flash & 0xff).toBeGreaterThan(0xc0);
    expect((flash >> 16) & 0xff).toBeGreaterThan(0x80);
  });
});

describe('canopyAlpha', () => {
  it('needs both the biome and the outdoors', () => {
    expect(canopyAlpha(1, 1, 0.9)).toBeCloseTo(0.9);
    expect(canopyAlpha(0, 1, 0.9)).toBe(0);
    expect(canopyAlpha(1, 0, 0.9)).toBe(0);
  });
});
