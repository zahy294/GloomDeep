/**
 * Sprite assets the game draws (everything that isn't terrain). Each has a placeholder sheet so
 * the game always runs; `art:pack` swaps in the approved manifest asset with the same id.
 */
export interface SpriteAssetDef {
  /** Same id as the art/manifest.json entry that replaces the placeholder. */
  readonly id: string;
  /** Placeholder sheet, relative to assets/placeholder/ (written by gen-placeholder-art). */
  readonly placeholder: string;
  readonly frameWidth: number;
  readonly frameHeight: number;
  /** Frames in the sheet (row-major). */
  readonly frames: number;
}

export const SPRITE_ASSETS: readonly SpriteAssetDef[] = [
  {
    id: 'player-parts',
    placeholder: 'sprites/player-parts.png',
    frameWidth: 16,
    frameHeight: 16,
    frames: 12,
  },
];

export function spriteAsset(id: string): SpriteAssetDef | undefined {
  return SPRITE_ASSETS.find((s) => s.id === id);
}
