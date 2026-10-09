/**
 * Schema of `art/manifest.json` (plan 2.9.3): one entry per asset going through the art pipeline.
 * The art tools read and write it; the game only ever sees the packed output in `assets/packed/`.
 */

export type ArtCategory =
  | 'reference'
  | 'parallax'
  | 'tree'
  | 'foliage'
  | 'terrain'
  | 'player'
  | 'item'
  | 'enemy'
  | 'npc'
  | 'boss'
  | 'ui';

export type ArtStatus = 'raw' | 'cleaned' | 'approved';

/** Where the asset's origin point sits (trees and characters stand on their bottom-centre). */
export type ArtAnchor = 'bottom-center' | 'center' | 'top-left';

export interface ArtSource {
  kind: 'nano-banana' | 'hand' | 'procedural' | 'pack';
  /** Required for anything not generated or drawn for this project (CLAUDE.md "Art"). */
  license?: string;
}

export interface ArtPrompt {
  /** Template file name in art/prompts/, e.g. "single-object.md". */
  template: string;
  /** The bracketed parts filled into the template. */
  specifics: string;
}

export interface ArtManifestEntry {
  /** Unique id; the raw file is named after it. */
  id: string;
  category: ArtCategory;
  /** Path of the untouched AI output, relative to `art/raw/` (e.g. "terrain/soil.png"). */
  raw: string;
  /** True pixel size of one image or one frame after cleanup. */
  targetSize?: { width: number; height: number };
  /** For sheets: frames laid out in a grid of `columns × rows`, each `targetSize`. */
  grid?: { columns: number; rows: number };
  anchor: ArtAnchor;
  source: ArtSource;
  prompt?: ArtPrompt;
  status: ArtStatus;
  /** Seamless textures/layers: which edges must line up ("x" for parallax, "xy" for textures). */
  tileable?: 'x' | 'xy';
  /** Terrain only: the tile key (src/data/tiles.ts) whose autotile set this texture generates. */
  material?: string;
}

export interface ArtManifest {
  version: 1;
  assets: ArtManifestEntry[];
}

/** Packed output the game loads (`assets/packed/pack.json`). */
export interface PackInfo {
  /** Per tile key: whether the packed atlas uses approved art or the placeholder. */
  tiles: Record<string, 'approved' | 'placeholder'>;
  /** Per sprite asset id (src/data/spriteAssets.ts): approved art or placeholder. */
  sprites: Record<string, 'approved' | 'placeholder'>;
  /** Ids of standalone sprite assets, written as `<id>.png` next to the atlas instead of packed. */
  standalone: string[];
}

/** Frames of every sprite asset inside `assets/packed/sprites.png` (`sprites.json`). */
export interface SpriteAtlasInfo {
  /** Asset id → frame rectangles in atlas pixels, in sheet order (row-major). */
  frames: Record<string, { x: number; y: number; width: number; height: number }[]>;
}

/** Cleaned/approved assets available to the art-test scene (`assets/packed/preview/preview.json`). */
export interface PreviewInfo {
  assets: {
    id: string;
    category: ArtCategory;
    status: ArtStatus;
    /** File inside `preview/` (the cleaned sheet, or the generated autotile set for terrain). */
    file: string;
    frameWidth: number;
    frameHeight: number;
    anchor: ArtAnchor;
    /** Terrain only: the tile key it replaces. */
    material?: string;
  }[];
  /** True if `preview/style-reference.png` exists. */
  hasStyleReference: boolean;
}
