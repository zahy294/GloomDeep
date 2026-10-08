import { describe, expect, it } from 'vitest';
import { PALETTE_COLORS } from '../../src/data/palette';
import { TILES } from '../../src/data/tiles';
import { buildPlaceholderAtlas } from '../../tools/lib/placeholderAtlas';

const opts = { tileSize: 16, columns: 8, seed: 1234, speckleChance: 28 };

describe('placeholder tile atlas', () => {
  it('is deterministic for a given seed', () => {
    const a = buildPlaceholderAtlas(TILES, opts);
    const b = buildPlaceholderAtlas(TILES, opts);
    expect(Buffer.from(a.data).equals(Buffer.from(b.data))).toBe(true);
  });

  it('places tile id N at frame N and sizes the atlas to fit every tile', () => {
    const atlas = buildPlaceholderAtlas(TILES, opts);
    expect(atlas.width).toBe(8 * 16);
    expect(atlas.height).toBe(Math.ceil(TILES.length / 8) * 16);
    for (const tile of TILES) expect(atlas.frames[tile.key]).toBe(tile.id);
  });

  it('leaves air transparent and only uses master-palette colours elsewhere', () => {
    const atlas = buildPlaceholderAtlas(TILES, opts);
    const palette = new Set(PALETTE_COLORS);

    for (let i = 0; i < atlas.data.length; i += 4) {
      const pixel = i / 4;
      const x = pixel % atlas.width;
      const y = Math.floor(pixel / atlas.width);
      const tileId = Math.floor(y / 16) * 8 + Math.floor(x / 16);
      const alpha = atlas.data[i + 3];
      const hasArt = TILES[tileId]?.placeholderRamp != null;

      expect(alpha).toBe(hasArt ? 255 : 0);
      if (hasArt) {
        const rgb = (atlas.data[i]! << 16) | (atlas.data[i + 1]! << 8) | atlas.data[i + 2]!;
        expect(palette.has(rgb)).toBe(true);
      }
    }
  });

  it('rejects a registry whose ids do not match their positions', () => {
    const broken = [TILES[0]!, { ...TILES[2]!, id: 5 }];
    expect(() => buildPlaceholderAtlas(broken, opts)).toThrow(/id 5/);
  });
});
