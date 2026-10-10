import { describe, expect, it } from 'vitest';
import { bossHealthPercent, phasePips } from '../../src/ui/BossBar';

describe('phasePips', () => {
  it('marks earlier phases done, the current one lit and the rest dark', () => {
    expect(phasePips(1, 3)).toEqual(['done', 'current', 'todo']);
    expect(phasePips(0, 1)).toEqual(['current']);
  });
  it('handles no phases', () => {
    expect(phasePips(0, 0)).toEqual([]);
  });
});

describe('bossHealthPercent', () => {
  it('clamps to 0..100', () => {
    expect(bossHealthPercent(-1)).toBe(0);
    expect(bossHealthPercent(0.456)).toBe(46);
    expect(bossHealthPercent(3)).toBe(100);
  });
});
