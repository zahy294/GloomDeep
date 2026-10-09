import { describe, expect, it } from 'vitest';
import {
  defaultWorldName,
  formatPlayTime,
  formatRelativeTime,
  parseSeed,
} from '../../src/ui/worldSelectHelpers';

describe('parseSeed', () => {
  it('returns null for blank', () => {
    expect(parseSeed('')).toBeNull();
    expect(parseSeed('   ')).toBeNull();
  });
  it('uses numbers as-is', () => {
    expect(parseSeed('42')).toBe(42);
    expect(parseSeed(' -7 ')).toBe(-7);
  });
  it('hashes integers too large for 32 bits instead of wrapping them onto another seed', () => {
    expect(parseSeed('4294967338')).not.toBe(42);
    expect(parseSeed('4294967338')).toBe(parseSeed('4294967338'));
  });
  it('hashes text deterministically to a 32-bit int', () => {
    const a = parseSeed('elderglade');
    expect(a).toBe(parseSeed('elderglade'));
    expect(a).not.toBe(parseSeed('elderglades'));
    expect(Number.isInteger(a)).toBe(true);
    expect(a!).toBeGreaterThanOrEqual(-(2 ** 31));
    expect(a!).toBeLessThan(2 ** 31);
  });
});

describe('formatRelativeTime', () => {
  const now = 1_000_000_000_000;
  it('formats ranges', () => {
    expect(formatRelativeTime(now - 5_000, now)).toBe('just now');
    expect(formatRelativeTime(now - 60_000, now)).toBe('1 minute ago');
    expect(formatRelativeTime(now - 3 * 3_600_000, now)).toBe('3 hours ago');
    expect(formatRelativeTime(now - 3 * 86_400_000, now)).toBe('3 days ago');
    expect(formatRelativeTime(now + 5000, now)).toBe('just now');
  });
});

describe('formatPlayTime', () => {
  it('formats', () => {
    expect(formatPlayTime(10)).toBe('< 1 min');
    expect(formatPlayTime(300)).toBe('5 min');
    expect(formatPlayTime(4320)).toBe('1 h 12 min');
  });
});

describe('defaultWorldName', () => {
  it('counts up and avoids clashes', () => {
    expect(defaultWorldName([])).toBe('Glade 1');
    expect(defaultWorldName([{ name: 'Glade 2' }])).toBe('Glade 3');
    expect(defaultWorldName([{ name: 'Glade 2' }, { name: 'x' }])).toBe('Glade 3');
  });
});
