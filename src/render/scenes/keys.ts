import type * as Phaser from 'phaser';
export const SceneKey = {
  Boot: 'Boot',
  Title: 'Title',
  Game: 'Game',
  ArtTest: 'ArtTest',
  Sky: 'Sky',
  Glow: 'Glow',
  Front: 'Front',
} as const;

export const TextureKey = {
  /** Foreground blob atlas (frame layout in src/sim/world/autotile.ts). */
  tiles: 'tiles',
  /** Background wall blob atlas, same layout, darker. */
  walls: 'walls',
  /** Mining crack overlay, one frame per stage. */
  cracks: 'cracks',
  /** Every sprite asset (frames named by spriteFrame(id, n)). */
  sprites: 'sprites',
  /** 2×2 white pixel, tinted per particle. */
  particle: 'particle-pixel',
  sun: 'sun',
  moon: 'moon',
  /** Soft white radial falloff for the additive glow pass (linear filtering). */
  glow: 'glow',
  /** Liquid tiles drawn at boot (src/render/liquidFrames.ts layout). */
  liquids: 'liquids',
  /** Seamless vertical strip of falling water, scrolled by the waterfall renderer. */
  waterfall: 'waterfall',
  /** Gloam vein overlay frames drawn at boot (src/render/gloamFrames.ts layout). */
  gloam: 'gloam',
  /** Soft ring for the light-ring effect when a light is placed. */
  ring: 'ring',
} as const;

export const DataKey = {
  sprites: 'sprites-info',
  pack: 'pack-info',
} as const;

/**
 * The game loads only the packed output of `npm run art:pack` (approved art merged with
 * placeholders), never raw or unapproved art. Paths are relative to the pack folder, which is
 * `packed/` inside the Vite public dir (assets/) unless `?pack=` names another one.
 */
export const PackFile = {
  tiles: 'tiles.png',
  walls: 'walls.png',
  cracks: 'cracks.png',
  sprites: 'sprites.png',
  spritesInfo: 'sprites.json',
  info: 'pack.json',
  preview: 'preview/',
} as const;

export const DEFAULT_PACK_DIR = 'packed';

/** Approved/placeholder status per sprite asset from the loaded pack.json (empty if not loaded). */
export function packSprites(cache: Phaser.Cache.CacheManager): Readonly<Record<string, string>> {
  const info = cache.json.get(DataKey.pack) as { sprites?: Record<string, string> } | undefined;
  return info?.sprites ?? {};
}
