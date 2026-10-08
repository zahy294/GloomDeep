import { describe, expect, it } from 'vitest';
import { parseDebugParams } from '../../src/debugParams';
import { CHUNK_RENDER } from '../../src/config';
import { approach, clampAbs, clampScroll } from '../../src/render/cameraMath';
import { chunkRangeFor, inRange, rangeSize } from '../../src/render/chunkMath';
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
  const defaults = {
    seed: null,
    scene: 'title',
    showUi: true,
    x: null,
    y: null,
    debugOverlay: false,
  };

  it('defaults to the title screen with UI, normal spawn and no seed', () => {
    expect(parseDebugParams('')).toEqual(defaults);
  });

  it('reads seed, scene, ui, spawn tile and debug overlay', () => {
    expect(parseDebugParams('?seed=42&scene=game&ui=0&x=2100&y=300&debug=1')).toEqual({
      seed: 42,
      scene: 'game',
      showUi: false,
      x: 2100,
      y: 300,
      debugOverlay: true,
    });
  });

  it('ignores malformed values', () => {
    expect(parseDebugParams('?seed=abc&scene=nope&x=1.5&y=')).toEqual(defaults);
  });
});

describe('chunkRangeFor', () => {
  const CHUNK_PX = 128 * 16;

  it('covers only the chunk under a small view with no margin', () => {
    const r = chunkRangeFor({ x: 100, y: 100, width: 960, height: 540 }, 0, CHUNK_PX, 33, 10);
    expect(r).toEqual({ cx0: 0, cy0: 0, cx1: 0, cy1: 0 });
    expect(rangeSize(r)).toBe(1);
  });

  it('includes neighbours when the view or the margin crosses chunk edges', () => {
    const r = chunkRangeFor({ x: 1500, y: 1800, width: 960, height: 540 }, 0, CHUNK_PX, 33, 10);
    expect(r).toEqual({ cx0: 0, cy0: 0, cx1: 1, cy1: 1 });
    const withMargin = chunkRangeFor(
      { x: 2100, y: 2100, width: 960, height: 540 },
      512,
      CHUNK_PX,
      33,
      10,
    );
    expect(withMargin).toEqual({ cx0: 0, cy0: 0, cx1: 1, cy1: 1 });
  });

  it('does not pull in the next chunk when the view ends exactly on an edge', () => {
    const r = chunkRangeFor(
      { x: CHUNK_PX - 960, y: 0, width: 960, height: 540 },
      0,
      CHUNK_PX,
      33,
      10,
    );
    expect(r.cx1).toBe(0);
  });

  it('clamps to the world grid', () => {
    const r = chunkRangeFor({ x: -5000, y: 99999, width: 960, height: 540 }, 512, CHUNK_PX, 33, 10);
    expect(r).toEqual({ cx0: 0, cy0: 9, cx1: 0, cy1: 9 });
    expect(inRange(r, 0, 9)).toBe(true);
    expect(inRange(r, 1, 9)).toBe(false);
  });

  it('never needs more than the configured pool at 960×540 with the preload margin', () => {
    let worst = 0;
    for (let x = 0; x < CHUNK_PX * 2; x += 37) {
      for (let y = 0; y < CHUNK_PX * 2; y += 41) {
        const r = chunkRangeFor(
          { x, y, width: 960, height: 540 },
          CHUNK_RENDER.preloadMarginPx,
          CHUNK_PX,
          33,
          10,
        );
        worst = Math.max(worst, rangeSize(r));
      }
    }
    expect(worst).toBeLessThanOrEqual(CHUNK_RENDER.poolSize);
  });
});

describe('camera maths', () => {
  it('approach is frame-rate independent', () => {
    let at60 = 0;
    for (let i = 0; i < 60; i++) at60 = approach(at60, 100, 9, 1 / 60);
    let at144 = 0;
    for (let i = 0; i < 144; i++) at144 = approach(at144, 100, 9, 1 / 144);
    expect(at60).toBeCloseTo(at144, 6);
    expect(at60).toBeGreaterThan(99);
  });

  it('clampScroll keeps the view inside the world, centring when the world is smaller', () => {
    expect(clampScroll(-50, 960, 67200)).toBe(0);
    expect(clampScroll(99999, 960, 67200)).toBe(67200 - 960);
    expect(clampScroll(500, 960, 67200)).toBe(500);
    expect(clampScroll(0, 960, 800)).toBe(-80);
  });

  it('clampAbs limits look-ahead both ways', () => {
    expect(clampAbs(500, 96)).toBe(96);
    expect(clampAbs(-500, 96)).toBe(-96);
    expect(clampAbs(10, 96)).toBe(10);
  });
});
