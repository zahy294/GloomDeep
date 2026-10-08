import { describe, expect, it } from 'vitest';
import { PALETTE } from '../../src/data/palette';
import { TILES, tileById } from '../../src/data/tiles';

describe('tile registry', () => {
  it('stores every tile at the index equal to its id (tileById relies on this)', () => {
    TILES.forEach((tile, index) => expect(tile.id).toBe(index));
    for (const tile of TILES) expect(tileById(tile.id)).toBe(tile);
  });

  it('starts with non-solid air at id 0', () => {
    expect(TILES[0]).toMatchObject({ key: 'air', solid: false });
  });

  it('has unique keys and only references existing palette ramps', () => {
    expect(new Set(TILES.map((t) => t.key)).size).toBe(TILES.length);
    for (const tile of TILES) {
      if (tile.placeholderRamp) expect(PALETTE).toHaveProperty(tile.placeholderRamp);
    }
  });
});
