import { describe, expect, it } from 'vitest';
import { viewSize } from '../src/render/integerScale';
import { DEFAULT_SETTINGS, keyLabel, keyName, mergeSettings, rebind } from '../src/settings';

describe('Settings (M13)', () => {
  it('fill missing or broken fields from the defaults', () => {
    const s = mergeSettings({
      quality: 'medium',
      volume: { master: 0.5, music: 7, ambience: 0.2, sfx: -1 },
      scale: 99,
      keys: { jump: ['K'], moveLeft: 'nope' } as never,
    });
    expect(s.quality).toBe('medium');
    expect(s.volume).toEqual({ master: 0.5, music: 1, ambience: 0.2, sfx: 1 });
    expect(s.scale).toBe('auto');
    expect(s.keys.jump).toEqual(['K']);
    expect(s.keys.moveLeft).toEqual(DEFAULT_SETTINGS.keys.moveLeft);
    expect(s.keys.toggleGuide).toEqual(['H']);
    expect(mergeSettings({ quality: 'ultra' } as never).quality).toBe('high');
  });

  it('binds and clears slots; a key may serve several controls but not twice on one', () => {
    const keys = rebind(DEFAULT_SETTINGS.keys, 'toggleLantern', 0, 'E');
    expect(keys.toggleLantern[0]).toBe('E');
    expect(keys.toggleInventory).toContain('E');
    const cleared = rebind(keys, 'jump', 1, null);
    expect(cleared.jump).toEqual(['SPACE', 'UP']);
    const moved = rebind(DEFAULT_SETTINGS.keys, 'jump', 2, 'SPACE');
    expect(moved.jump).toEqual(['W', 'SPACE']);
  });

  it('a stored null or junk counts as nothing saved', () => {
    expect(mergeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(mergeSettings([] as never).quality).toBe(DEFAULT_SETTINGS.quality);
  });

  it('turns DOM key codes into Phaser key names, and names into labels', () => {
    expect(keyName('KeyQ')).toBe('Q');
    expect(keyName('Digit3')).toBe('THREE');
    expect(keyName('ArrowLeft')).toBe('LEFT');
    expect(keyName('ShiftRight')).toBe('SHIFT');
    expect(keyName('F5')).toBe('F5');
    expect(keyName('NumLock')).toBeNull();
    // AZERTY: the physical Q key types A, and Phaser's keys follow what it types.
    expect(keyName('KeyQ', 'a')).toBe('A');
    expect(keyLabel('SPACE')).toBe('Space');
    expect(keyLabel('LEFT')).toBe('←');
  });

  it('a display scale caps the whole-number zoom', () => {
    expect(viewSize(3840, 2160, 1)).toEqual({ zoom: 4, height: 540 });
    expect(viewSize(3840, 2160, 1, 2)).toEqual({ zoom: 2, height: 540 });
  });
});
