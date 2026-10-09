import { describe, expect, it } from 'vitest';
import {
  gradeMatrix,
  isIdentity,
  matrixChanged,
  noiseSample,
  stepToward,
  type GradeParams,
  edgeFade,
} from '../../src/render/gradeMath';

const neutral: GradeParams = { tint: 0xffffff, saturation: 1, contrast: 1, brightness: 1 };
const apply = (m: number[], rgb: [number, number, number]) =>
  [0, 1, 2].map((row) => {
    const o = row * 5;
    return (
      (m[o] ?? 0) * rgb[0] + (m[o + 1] ?? 0) * rgb[1] + (m[o + 2] ?? 0) * rgb[2] + (m[o + 4] ?? 0)
    );
  });

describe('gradeMatrix', () => {
  it('is the identity for neutral parameters', () => {
    const m = new Array<number>(20).fill(9);
    gradeMatrix(neutral, m);
    expect(isIdentity(m, 1e-6)).toBe(true);
  });

  it('multiplies channels by the tint and brightness', () => {
    const m = new Array<number>(20).fill(0);
    gradeMatrix({ ...neutral, tint: 0x80ff00, brightness: 0.5 }, m);
    const [r, g, b] = apply(m, [200, 200, 200]);
    expect(r).toBeCloseTo((200 * 128) / 255 / 2, 3);
    expect(g).toBeCloseTo(100, 3);
    expect(b).toBeCloseTo(0, 3);
  });

  it('gives luma rows at saturation 0 (greyscale)', () => {
    const m = new Array<number>(20).fill(0);
    gradeMatrix({ ...neutral, saturation: 0 }, m);
    for (let row = 0; row < 3; row++) {
      expect(m[row * 5]).toBeCloseTo(0.299);
      expect(m[row * 5 + 1]).toBeCloseTo(0.587);
      expect(m[row * 5 + 2]).toBeCloseTo(0.114);
    }
  });

  it('keeps mid-grey fixed under contrast and spreads the rest', () => {
    const m = new Array<number>(20).fill(0);
    gradeMatrix({ ...neutral, contrast: 1.5 }, m);
    expect(apply(m, [127.5, 127.5, 127.5])[0]).toBeCloseTo(127.5);
    expect(apply(m, [200, 200, 200])[0]).toBeCloseTo(127.5 + 72.5 * 1.5);
  });

  it('leaves alpha alone', () => {
    const m = new Array<number>(20).fill(0);
    gradeMatrix({ tint: 0x123456, saturation: 0.3, contrast: 2, brightness: 0.4 }, m);
    expect(m.slice(15)).toEqual([0, 0, 0, 1, 0]);
  });
});

describe('helpers', () => {
  it('matrixChanged respects the epsilon', () => {
    const a = new Float32Array(20);
    const b = new Float32Array(20);
    b[4] = 0.01;
    expect(matrixChanged(a, b, 0.05)).toBe(false);
    b[4] = 0.2;
    expect(matrixChanged(a, b, 0.05)).toBe(true);
  });

  it('stepToward never overshoots', () => {
    expect(stepToward(0, 1, 0.3)).toBeCloseTo(0.3);
    expect(stepToward(0.9, 1, 0.3)).toBe(1);
    expect(stepToward(1, 0, 0.4)).toBeCloseTo(0.6);
  });

  it('noiseSample stays inside 0..1', () => {
    for (let i = 0; i < 200; i++) {
      for (const channel of [0, 1]) {
        const n = noiseSample((i * 7) / 200, (i * 13) / 200, channel, 1.3);
        expect(n).toBeGreaterThanOrEqual(0);
        expect(n).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe('edgeFade', () => {
  it('is 1 in the middle and 0 on every edge of the displacement map', () => {
    expect(edgeFade(0.5, 0.5, 0.06)).toBe(1);
    for (const [u, v] of [
      [0, 0.5],
      [1, 0.5],
      [0.5, 0],
      [0.5, 1],
    ] as const) {
      expect(edgeFade(u, v, 0.06)).toBe(0);
    }
    expect(edgeFade(0.03, 0.5, 0.06)).toBeGreaterThan(0);
    expect(edgeFade(0.03, 0.5, 0.06)).toBeLessThan(1);
  });
});
