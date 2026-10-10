import { describe, expect, it } from 'vitest';
import { BOSSES } from '../../src/data/bosses';
import { ENEMIES } from '../../src/data/enemies';
import { getAlpha } from '../../tools/lib/image';
import { buildBosses } from '../../tools/lib/placeholderBosses';
import { buildEnemies } from '../../tools/lib/placeholderEnemies';

function frameHasPixels(img: Parameters<typeof getAlpha>[0], frame: number, size: number) {
  for (let y = 0; y < img.height; y++)
    for (let x = frame * size; x < (frame + 1) * size; x++)
      if (getAlpha(img, x, y) > 0) return true;
  return false;
}

describe('boss and enemy placeholders', () => {
  it('bosses sheet is 8 frames of 80x80, each with pixels', () => {
    const img = buildBosses();
    expect([img.width, img.height]).toEqual([80 * 8, 80]);
    for (let f = 0; f < 8; f++) expect(frameHasPixels(img, f, 80)).toBe(true);
  });

  it('every non-boss enemy has both frames drawn in the enemies sheet', () => {
    const bossKeys = new Set(BOSSES.map((b) => b.enemy));
    const img = buildEnemies();
    for (const e of ENEMIES.filter((x) => !bossKeys.has(x.key))) {
      expect(frameHasPixels(img, e.frame, 24), e.key).toBe(true);
      expect(frameHasPixels(img, e.frame + 1, 24), e.key).toBe(true);
    }
  });
});
