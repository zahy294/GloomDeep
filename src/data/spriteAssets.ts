/**
 * Sprite assets the game draws (everything that isn't terrain). Each has a placeholder sheet so
 * the game always runs; `art:pack` swaps in the approved manifest asset with the same id.
 */
import { SURFACE_BIOMES } from './biomes';
import { FOLK } from './npcs';

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
  { id: 'flora', placeholder: 'sprites/flora.png', frameWidth: 16, frameHeight: 32, frames: 16 },
  /** Sapling decorations: elder, moonbirch, willow. */
  {
    id: 'saplings',
    placeholder: 'sprites/saplings.png',
    frameWidth: 48,
    frameHeight: 80,
    frames: 3,
  },
  /** Item icons (frame = `icon` in src/data/items.ts): pickaxes, bars, lenses, flare, weapons. */
  { id: 'items', placeholder: 'sprites/items.png', frameWidth: 16, frameHeight: 16, frames: 25 },
  /** Creatures (src/data/enemies.ts `frame`): two 24×24 frames each. */
  {
    id: 'enemies',
    placeholder: 'sprites/enemies.png',
    frameWidth: 24,
    frameHeight: 24,
    frames: 24,
  },
  /**
   * Boss bodies (M12): two 80×80 frames each, frame = the boss enemy's `frame` in
   * src/data/enemies.ts (+1 for the alternate pose); body centred, standing on the bottom edge.
   */
  { id: 'bosses', placeholder: 'sprites/bosses.png', frameWidth: 80, frameHeight: 80, frames: 8 },
  /** Critters (src/data/critters.ts `frame`): two 16×16 frames each (M10). */
  {
    id: 'critters',
    placeholder: 'sprites/critters.png',
    frameWidth: 16,
    frameHeight: 16,
    frames: 14,
  },
  /** Villagers, the Old Dryad and townsfolk (src/data/npcs.ts FOLK): two 24×40 frames each. */
  {
    id: 'folk',
    placeholder: 'sprites/folk.png',
    frameWidth: 24,
    frameHeight: 40,
    frames: FOLK.length * 2,
  },
  /** The caravan (M11): a covered wagon pulled by a stag; two walking frames, ground at the bottom. */
  {
    id: 'caravan',
    placeholder: 'sprites/caravan.png',
    frameWidth: 64,
    frameHeight: 32,
    frames: 2,
  },
  /** Particle textures: leaf, petal, raindrop, spore, ember, firefly, mote, sky lantern, spark, boss shots (dust, bolt, shard, orb, slam). */
  {
    id: 'particles',
    placeholder: 'sprites/particles.png',
    frameWidth: 8,
    frameHeight: 8,
    frames: 14,
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
  skyLantern: 7,
  spark: 8,
  /** Hostile boss shots (M12). */
  dust: 9,
  bolt: 10,
  shard: 11,
  orb: 12,
  slam: 13,
} as const;
