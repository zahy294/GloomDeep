import { describe, expect, it } from 'vitest';
import { TITLE_SCENE } from '../src/config';
import { PARALLAX_LAYERS } from '../src/data/spriteAssets';

describe('title scene config', () => {
  it('has one tint, alpha, speed and sink per parallax layer', () => {
    for (const list of [
      TITLE_SCENE.layerTints,
      TITLE_SCENE.layerAlpha,
      TITLE_SCENE.layerSpeeds,
      TITLE_SCENE.layerSink,
    ])
      expect(list).toHaveLength(PARALLAX_LAYERS);
  });

  it('stays within the object budget', () => {
    const objects =
      TITLE_SCENE.stars.count + TITLE_SCENE.fireflies.count * 2 + TITLE_SCENE.groundGlows.count;
    expect(objects).toBeLessThan(150);
  });
});
