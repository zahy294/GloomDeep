import { describe, expect, it } from 'vitest';
import { parseDebugParams } from '../../src/debugParams';
import { integerZoom } from '../../src/render/integerScale';

describe('integerZoom', () => {
  it('scales 960×540 by ×2 on a 1080p window', () => {
    expect(integerZoom(1920, 1080, 1)).toBe(2);
  });

  it('uses the largest whole number that fits both dimensions', () => {
    expect(integerZoom(2560, 1440, 1)).toBe(2); // ×2.67 would stretch; letterbox instead
    expect(integerZoom(3840, 2160, 1)).toBe(4);
    expect(integerZoom(1920, 900, 1)).toBe(1); // height limits it
  });

  it('counts device pixels, so OS display scaling still gives whole-number game pixels', () => {
    // A 1080p screen at 150% scaling reports a 1280×720 CSS viewport.
    expect(integerZoom(1280, 720, 1.5)).toBe(2);
    // A 4K screen at 150% reports 2560×1440 CSS.
    expect(integerZoom(2560, 1440, 1.5)).toBe(4);
  });

  it('never drops below ×1 on small windows', () => {
    expect(integerZoom(800, 400, 1)).toBe(1);
  });
});

describe('parseDebugParams', () => {
  it('defaults to the title screen with UI and no seed', () => {
    expect(parseDebugParams('')).toEqual({ seed: null, scene: 'title', showUi: true });
  });

  it('reads seed, scene and ui', () => {
    expect(parseDebugParams('?seed=42&scene=game&ui=0')).toEqual({
      seed: 42,
      scene: 'game',
      showUi: false,
    });
  });

  it('ignores malformed values', () => {
    expect(parseDebugParams('?seed=abc&scene=nope')).toEqual({
      seed: null,
      scene: 'title',
      showUi: true,
    });
  });
});
