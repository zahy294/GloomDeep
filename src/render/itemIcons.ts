import { PLACEHOLDER_ATLAS, TILE_SIZE } from '../config';
import { ITEMS } from '../data/items';
import { tileId } from '../data/tiles';
import { FRAME_COUNT, iconFrame } from '../sim/world/autotile';

/**
 * Atlas frame used as each item's icon (tiles atlas), or -1. Block items show their tile's
 * isolated shape; dedicated item icons arrive with the item art (M6 / art pipeline).
 */
const ICON_FRAME = ITEMS.map((item) => (item.placesTile ? iconFrame(tileId(item.placesTile)) : -1));

export function itemIconFrame(itemId: number): number {
  return ICON_FRAME[itemId] ?? -1;
}

/** Pixel offset of an atlas frame, for CSS `background-position` in the DOM UI. */
export function framePixelOffset(frame: number): { x: number; y: number } {
  return {
    x: (frame % PLACEHOLDER_ATLAS.columns) * TILE_SIZE,
    y: Math.floor(frame / PLACEHOLDER_ATLAS.columns) * TILE_SIZE,
  };
}

/** Size of the tiles atlas in pixels (for CSS `background-size`). */
export const ATLAS_PIXEL_SIZE = {
  width: PLACEHOLDER_ATLAS.columns * TILE_SIZE,
  height: Math.ceil(FRAME_COUNT / PLACEHOLDER_ATLAS.columns) * TILE_SIZE,
} as const;
