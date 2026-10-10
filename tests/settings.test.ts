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

  it('a key bound to one control is taken away from any other', () => {
    const keys = rebind(DEFAULT_SETTINGS.keys, 'toggleLantern', 0, 'E');
    expect(keys.toggleLantern[0]).toBe('E');
    expect(keys.toggleInventory).not.toContain('E');
    const cleared = rebind(keys, 'jump', 1, null);
    expect(cleared.jump).toEqual(['SPACE', 'UP']);
  });

  it('turns DOM key codes into Phaser key names, and names into labels', () => {
    expect(keyName('KeyQ')).toBe('Q');
    expect(keyName('Digit3')).toBe('THREE');
    expect(keyName('ArrowLeft')).toBe('LEFT');
    expect(keyName('ShiftRight')).toBe('SHIFT');
    expect(keyName('F5')).toBe('F5');
    expect(keyName('NumLock')).toBeNull();
    expect(keyLabel('SPACE')).toBe('Space');
    expect(keyLabel('LEFT')).toBe('←');
  });

  it('a display scale caps the whole-number zoom', () => {
    expect(viewSize(3840, 2160, 1)).toEqual({ zoom: 4, height: 540 });
    expect(viewSize(3840, 2160, 1, 2)).toEqual({ zoom: 2, height: 540 });
  });
});
