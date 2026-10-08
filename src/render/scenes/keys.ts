export const SceneKey = {
  Boot: 'Boot',
  Title: 'Title',
  Game: 'Game',
} as const;

export const TextureKey = {
  /** Foreground blob atlas (frame layout in src/sim/world/autotile.ts). */
  placeholderTiles: 'placeholder-tiles',
  /** Background wall blob atlas, same layout, darker. */
  placeholderWalls: 'placeholder-walls',
  /** Mining crack overlay, one frame per stage. */
  cracks: 'placeholder-cracks',
  /** 2×2 white pixel, tinted per particle. */
  particle: 'particle-pixel',
} as const;

/** Atlas image URLs, also used by the DOM UI for item icons. */
export const AtlasUrl = {
  tiles: 'placeholder/tiles.png',
  walls: 'placeholder/walls.png',
  cracks: 'placeholder/cracks.png',
} as const;
