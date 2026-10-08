/** Display depths, back to front, following the render layer table in GLOAMDEEP_PLAN.md 2.2. */
export const Depth = {
  sky: 1,
  backgroundWalls: 5,
  foregroundTiles: 8,
  entities: 10,
  particles: 12,
  debug: 100,
} as const;
