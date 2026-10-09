/**
 * Sprite assets the game draws (everything that isn't terrain). Each has a placeholder sheet so
 * the game always runs; `art:pack` swaps in the approved manifest asset with the same id.
 */
import { SURFACE_BIOMES } from './biomes';

export interface SpriteAssetDef {
  /** Same id as the art/manifest.json entry that replaces the placeholder. */
  readonly id: string;
  /** Placeholder sheet, relative to assets/placeholder/ (written by gen-placeholder-art). */
  readonly placeholder: string;
  readonly frameWidth: number;
  readonly frameHeight: number;
  /** Frames in the sheet (row-major). */
  readonly frames: number;
  /**
   * Packed as its own `<id>.png` instead of into the sprite atlas, and loaded as the texture
   * `<id>`. Needed for anything a TileSprite repeats (atlas frames bleed when repeated).
   * A standalone asset is one image: frames 1, frame size = image size.
   */
  readonly standalone?: boolean;
}

/** Parallax layers per surface biome; layer 0 is the farthest. */
export const PARALLAX_LAYERS = 4;
export const PARALLAX_SIZE = { width: 480, height: 240 } as const;
export const FG_CANOPY_ID = 'fg-canopy';
export const FG_CANOPY_SIZE = { width: 480, height: 120 } as const;

export function parallaxAssetId(biome: string, layer: number): string {
  return `parallax-${biome}-${layer}`;
}

const PARALLAX_ASSETS: readonly SpriteAssetDef[] = SURFACE_BIOMES.flatMap((biome) =>
  Array.from({ length: PARALLAX_LAYERS }, (_, layer): SpriteAssetDef => {
    const id = parallaxAssetId(biome.key, layer);
    return {
      id,
      placeholder: `sprites/${id}.png`,
      frameWidth: PARALLAX_SIZE.width,
      frameHeight: PARALLAX_SIZE.height,
      frames: 1,
      standalone: true,
    };
  }),
);

export const SPRITE_ASSETS: readonly SpriteAssetDef[] = [
  {
    id: 'player-parts',
    placeholder: 'sprites/player-parts.png',
    frameWidth: 16,
    frameHeight: 16,
    frames: 12,
  },
  /** Ground and ceiling flora, frame order = `decor.frame` in src/data/tiles.ts. */
  { id: 'flora', placeholder: 'sprites/flora.png', frameWidth: 16, frameHeight: 32, frames: 13 },
  /** Sapling decorations: elder, moonbirch, willow. */
  {
    id: 'saplings',
    placeholder: 'sprites/saplings.png',
    frameWidth: 48,
    frameHeight: 80,
    frames: 3,
  },
  /** Item icons (frame = `icon` in src/data/items.ts): pickaxes, bars, lenses, flare. */
  { id: 'items', placeholder: 'sprites/items.png', frameWidth: 16, frameHeight: 16, frames: 12 },
  /** Particle textures: leaf, petal, raindrop, spore, ember, firefly, mote. */
  {
    id: 'particles',
    placeholder: 'sprites/particles.png',
    frameWidth: 8,
    frameHeight: 8,
    frames: 7,
  },
  ...PARALLAX_ASSETS,
  {
    id: FG_CANOPY_ID,
    placeholder: `sprites/${FG_CANOPY_ID}.png`,
    frameWidth: FG_CANOPY_SIZE.width,
    frameHeight: FG_CANOPY_SIZE.height,
    frames: 1,
    standalone: true,
  },
];

export function spriteAsset(id: string): SpriteAssetDef | undefined {
  return SPRITE_ASSETS.find((s) => s.id === id);
}

/** Frame indices in the `particles` sheet. */
export const PARTICLE_FRAME = {
  leaf: 0,
  petal: 1,
  raindrop: 2,
  spore: 3,
  ember: 4,
  firefly: 5,
  mote: 6,
} as const;
