/** Display depths, back to front, following the render layer table in GLOAMDEEP_PLAN.md 2.2. */
export const Depth = {
  sky: 1,
  backgroundWalls: 5,
  foregroundTiles: 8,
  /** Ground plants, vines and saplings, between the tiles and the entities (plan 2.2 layer 9). */
  foliage: 9.5,
  /** Crack overlay and the tile cursor sit just above the tiles they mark. */
  tileOverlay: 9,
  entities: 10,
  /** Falling water, just behind the liquids and in front of the entities it spills past. */
  waterfalls: 10.4,
  /** Captures the scene so far for pool reflections; liquids and what they reflect draw after it. */
  reflectionCapture: 10.8,
  /** Water and lava, in front of entities so a swimmer is tinted by it (plan 2.2 layer 11). */
  liquids: 11,
  /** The flipped capture, drawn into pools above the water body. */
  reflections: 11.1,
  particles: 12,
  /** Multiplied over everything below it (plan 2.2 layer 13). */
  lightMap: 13,
  /**
   * Gloam veins over the tiles and walls they corrupt: above the light map, so the living
   * darkness still shows (faintly pulsing) where no light reaches.
   */
  gloam: 13.5,
  /** Additive halos above the light map, so glows stay bright in the dark (layer 14). */
  glow: 14,
  debug: 100,
} as const;
