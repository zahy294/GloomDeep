import { describe, expect, it } from 'vitest';
import { FOLIAGE, TILE_SIZE } from '../../src/config';
import {
  bendTarget,
  decorPlacement,
  pivotSign,
  positionHash,
  swayRotation,
  swayTiming,
} from '../../src/render/foliageMath';

describe('decorPlacement', () => {
  it('stands ground plants on the bottom-centre of their tile', () => {
    expect(decorPlacement('ground', 3, 5)).toEqual({
      x: 3.5 * TILE_SIZE,
      y: 6 * TILE_SIZE,
      originX: 0.5,
      originY: 1,
    });
  });

  it('hangs ceiling plants from the top-centre of their tile', () => {
    expect(decorPlacement('ceiling', 3, 5)).toEqual({
      x: 3.5 * TILE_SIZE,
      y: 5 * TILE_SIZE,
      originX: 0.5,
      originY: 0,
    });
  });

  it('centres wall decorations in their tile', () => {
    const p = decorPlacement('wall', 0, 0);
    expect(p).toEqual({ x: TILE_SIZE / 2, y: TILE_SIZE / 2, originX: 0.5, originY: 0.5 });
  });
});

describe('positionHash and swayTiming', () => {
  it('is stable and in 0..1', () => {
    expect(positionHash(10, 20)).toBe(positionHash(10, 20));
    for (let i = 0; i < 50; i++) {
      const h = positionHash(i, i * 3);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThan(1);
    }
  });

  it('gives neighbouring tiles different phases and keeps periods in range', () => {
    const a = swayTiming(100, 40);
    const b = swayTiming(101, 40);
    expect(a.delayMs).not.toBe(b.delayMs);
    const { periodMs, periodJitter } = FOLIAGE.sway;
    for (let x = 0; x < 40; x++) {
      const t = swayTiming(x, 7);
      expect(t.periodMs).toBeGreaterThanOrEqual(periodMs * (1 - periodJitter));
      expect(t.periodMs).toBeLessThanOrEqual(periodMs * (1 + periodJitter));
      expect(t.delayMs).toBeLessThan(2 * t.periodMs);
    }
  });
});

describe('swayRotation', () => {
  it('swings symmetrically about upright in calm air', () => {
    const r = swayRotation(0.2, 0, 1, 0);
    expect(r.base + r.amplitude / 2).toBeCloseTo(0);
    expect(r.amplitude).toBeGreaterThan(0);
  });

  it('swings wider and leans further as the wind picks up', () => {
    const calm = swayRotation(0.2, 0, 1, 0);
    const gale = swayRotation(0.2, 1, 1, 0);
    expect(gale.amplitude).toBeGreaterThan(calm.amplitude);
    expect(gale.base + gale.amplitude / 2).toBeGreaterThan(0);
  });

  it('leans hanging plants the other way round', () => {
    const ground = swayRotation(0.2, 0.8, pivotSign('ground'), 0);
    const hanging = swayRotation(0.2, 0.8, pivotSign('ceiling'), 0);
    expect(ground.base + ground.amplitude / 2).toBeCloseTo(-(hanging.base + hanging.amplitude / 2));
  });

  it('shifts the whole swing by the bend', () => {
    const a = swayRotation(0.2, 0.3, 1, 0);
    const b = swayRotation(0.2, 0.3, 1, 0.25);
    expect(b.base - a.base).toBeCloseTo(0.25);
    expect(b.amplitude).toBeCloseTo(a.amplitude);
  });

  it('does not move rigid plants', () => {
    const r = swayRotation(0, 1, 1, 0);
    expect(r.base).toBeCloseTo(0);
    expect(r.amplitude).toBe(0);
  });
});

describe('bendTarget', () => {
  it('leans away from the player, left or right', () => {
    expect(bendTarget(110, 100, 0.25, 1)).toBeGreaterThan(0);
    expect(bendTarget(90, 100, 0.25, 1)).toBeLessThan(0);
  });

  it('leans hanging plants the other way', () => {
    expect(bendTarget(110, 100, 0.25, -1)).toBeLessThan(0);
  });

  it('is zero beyond the radius, and grows as the player gets closer', () => {
    const r = FOLIAGE.bend.radiusPx;
    expect(bendTarget(100 + r, 100, 0.25, 1)).toBe(0);
    expect(bendTarget(100 + r * 2, 100, 0.25, 1)).toBe(0);
    expect(bendTarget(100 + r * 0.25, 100, 0.25, 1)).toBeGreaterThan(
      bendTarget(100 + r * 0.75, 100, 0.25, 1),
    );
  });

  it('never exceeds the maximum bend and ignores rigid plants', () => {
    expect(Math.abs(bendTarget(100, 100, 10, 1))).toBeLessThanOrEqual(FOLIAGE.bend.maxRadians);
    expect(bendTarget(105, 100, 0, 1)).toBe(0);
  });
});
