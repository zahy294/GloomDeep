/** Display depths, back to front, following the render layer table in GLOAMDEEP_PLAN.md 2.2. */
export const Depth = {
  sky: 1,
  backgroundWalls: 5,
  foregroundTiles: 8,
  /** Crack overlay and the tile cursor sit just above the tiles they mark. */
  tileOverlay: 9,
  entities: 10,
  particles: 12,
  /** Multiplied over everything below it (plan 2.2 layer 13). */
  lightMap: 13,
  /** Additive halos above the light map, so glows stay bright in the dark (layer 14). */
  glow: 14,
  debug: 100,
} as const;
