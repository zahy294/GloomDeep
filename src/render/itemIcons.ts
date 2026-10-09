import { PLACEHOLDER_ATLAS, TILE_SIZE } from '../config';
import { ITEMS } from '../data/items';
import { tileId } from '../data/tiles';
import { FRAME_COUNT, iconFrame } from '../sim/world/autotile';
import { TextureKey } from './scenes/keys';
import { spriteFrame } from './spriteFrames';

/** Sprite sheet holding dedicated item icons (frame = `icon` in src/data/items.ts). */
export const ITEM_ICON_SHEET = 'items';

/**
 * Where an item's icon lives: its own frame in the sprite atlas, or (blocks, stations) the
 * isolated shape of the tile it places in the tile atlas. Null for items with neither.
 */
export type ItemIconRef =
  | { readonly texture: typeof TextureKey.sprites; readonly frame: string }
  | { readonly texture: typeof TextureKey.tiles; readonly frame: number };

const ICONS: readonly (ItemIconRef | null)[] = ITEMS.map((item) => {
  if (item.icon !== undefined) {
    return { texture: TextureKey.sprites, frame: spriteFrame(ITEM_ICON_SHEET, item.icon) };
  }
  if (item.placesTile)
    return { texture: TextureKey.tiles, frame: iconFrame(tileId(item.placesTile)) };
  return null;
});

export function itemIcon(itemId: number): ItemIconRef | null {
  return ICONS[itemId] ?? null;
}

/** Pixel offset of a tile-atlas frame, for CSS `background-position` in the DOM UI. */
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
