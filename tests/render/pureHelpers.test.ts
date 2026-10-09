import { describe, expect, it } from 'vitest';
import { parseDebugParams } from '../../src/debugParams';
import { CHUNK_RENDER } from '../../src/config';
import { approach, clampAbs, clampScroll } from '../../src/render/cameraMath';
import { chunkRangeFor, inRange, rangeSize } from '../../src/render/chunkMath';
import { viewSize } from '../../src/render/integerScale';

describe('viewSize', () => {
  it('scales 960×540 by ×2 on a 1080p screen', () => {
    expect(viewSize(1920, 1080, 1)).toEqual({ zoom: 2, height: 540 });
  });

  it('crops rows to keep ×2 in a windowed 1080p browser instead of dropping to ×1', () => {
    expect(viewSize(1920, 950, 1)).toEqual({ zoom: 2, height: 474 }); // even row count
    expect(viewSize(1920, 900, 1)).toEqual({ zoom: 2, height: 450 });
  });

  it('never crops below the minimum height; drops a zoom level instead', () => {
    expect(viewSize(1920, 800, 1)).toEqual({ zoom: 1, height: 540 }); // 400 rows at ×2 is too few
  });

  it('uses the largest whole number that fits the width, letterboxing extra height', () => {
    expect(viewSize(2560, 1440, 1)).toEqual({ zoom: 2, height: 540 }); // ×2.67 would stretch
    expect(viewSize(3840, 2160, 1)).toEqual({ zoom: 4, height: 540 });
  });

  it('counts device pixels, so OS display scaling still gives whole-number game pixels', () => {
    // A 1080p screen at 150% scaling reports a 1280×720 CSS viewport.
    expect(viewSize(1280, 720, 1.5)).toEqual({ zoom: 2, height: 540 });
    // A 4K screen at 150% reports 2560×1440 CSS.
    expect(viewSize(2560, 1440, 1.5)).toEqual({ zoom: 4, height: 540 });
  });

  it('never drops below ×1 on small windows', () => {
    expect(viewSize(800, 400, 1)).toEqual({ zoom: 1, height: 540 });
    expect(viewSize(960, 500, 1)).toEqual({ zoom: 1, height: 500 });
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
    assetId: null,
    time: null,
    quality: null,
    pack: null,
    biome: null,
    spot: null,
    size: null,
    rain: null,
    kit: null,
    spawns: true,
    enemy: null,
    wisp: false,
    critter: null,
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
      assetId: null,
      time: null,
      quality: null,
      pack: null,
      biome: null,
      spot: null,
      size: null,
      rain: null,
      kit: null,
      spawns: true,
      enemy: null,
      wisp: false,
      critter: null,
    });
  });

  it('reads the debug biome, cave spot and world size', () => {
    expect(parseDebugParams('?biome=weeping_mire&spot=cave&size=small')).toMatchObject({
      biome: 'weeping_mire',
      spot: 'cave',
      size: 'small',
    });
    expect(parseDebugParams('?biome=a/b&spot=sky&size=huge')).toMatchObject({
      biome: null,
      spot: null,
      size: null,
    });
  });

  it('reads a debug kit name', () => {
    expect(parseDebugParams('?kit=build').kit).toBe('build');
    expect(parseDebugParams('?kit=a/b').kit).toBeNull();
  });

  it('reads a forced rain intensity, clamped to 0..1', () => {
    expect(parseDebugParams('?rain=1').rain).toBe(1);
    expect(parseDebugParams('?rain=0.4').rain).toBe(0.4);
    expect(parseDebugParams('?rain=7').rain).toBe(1);
    expect(parseDebugParams('?rain=abc').rain).toBeNull();
    expect(parseDebugParams('?rain=').rain).toBeNull();
  });

  it('reads the art-test scene, asset id, time and pack folder', () => {
    expect(
      parseDebugParams('?scene=art-test&id=soil_base&time=night&pack=packed-demo'),
    ).toMatchObject({
      scene: 'art-test',
      assetId: 'soil_base',
      time: 'night',
      quality: null,
      pack: 'packed-demo',
    });
  });

  it('accepts named times (day = noon) and quality, rejects unknown or inherited names', () => {
    expect(parseDebugParams('?time=sunset&quality=low')).toMatchObject({
      time: 'sunset',
      quality: 'low',
    });
    expect(parseDebugParams('?time=day').time).toBe('noon');
    expect(parseDebugParams('?time=constructor&quality=ultra')).toMatchObject({
      time: null,
      quality: null,
    });
  });

  it('rejects ids and pack names with path characters', () => {
    expect(parseDebugParams('?id=../secret&pack=a/b')).toMatchObject({ assetId: null, pack: null });
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
