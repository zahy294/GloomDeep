import { describe, expect, it } from 'vitest';
import { FOLK } from '../../src/data/npcs';
import { ITEMS } from '../../src/data/items';
import { spriteAsset } from '../../src/data/spriteAssets';
import { getAlpha } from '../../tools/lib/image';
import { buildItemIcons } from '../../tools/lib/placeholderItems';
import { buildCaravan, buildFolk } from '../../tools/lib/placeholderLife';

function opaque(img: { width: number; height: number; data: Uint8Array }, x0: number, w: number) {
  let top = img.height;
  let bottom = -1;
  for (let y = 0; y < img.height; y++) {
    for (let x = x0; x < x0 + w; x++) {
      if (getAlpha(img as never, x, y) > 0) {
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
      }
    }
  }
  return { top, bottom };
}

describe('folk and caravan placeholders', () => {
  it('folk has two frames per FOLK entry', () => {
    expect(spriteAsset('folk')!.frames).toBe(FOLK.length * 2);
    expect(buildFolk().width).toBe(FOLK.length * 2 * 24);
  });

  it('Pip is a short figure standing on the bottom edge', () => {
    const i = FOLK.findIndex((n) => n.key === 'child');
    const { top, bottom } = opaque(buildFolk(), i * 2 * 24, 24);
    expect(bottom).toBe(39);
    expect(bottom - top + 1).toBeLessThan(30);
  });

  it('caravan: two 64x32 frames resting on the ground line', () => {
    const def = spriteAsset('caravan')!;
    expect([def.frameWidth, def.frameHeight, def.frames]).toEqual([64, 32, 2]);
    const img = buildCaravan();
    expect([img.width, img.height]).toEqual([128, 32]);
    for (let f = 0; f < 2; f++) expect(opaque(img, f * 64, 64).bottom).toBe(31);
  });

  it('item icons cover every icon index, glimmer and locket drawn', () => {
    const used = Math.max(...ITEMS.map((i) => i.icon ?? -1)) + 1;
    expect(spriteAsset('items')!.frames).toBe(used);
    const img = buildItemIcons();
    for (const f of [23, 24]) expect(opaque(img, f * 16, 16).bottom).toBeGreaterThan(0);
  });
});
