/** Tunable values. Systems read from here (or src/data/) instead of hard-coding numbers. */

export const DISPLAY = {
  /** Internal render resolution; the canvas is scaled up by whole numbers only. */
  width: 960,
  height: 540,
  /** Never scale below this, even if the window is smaller than the internal resolution. */
  minZoom: 1,
  /** Colour behind the letterbox bars. */
  letterboxColor: '#05080a',
} as const;

export const TILE_SIZE = 16;

export const SIM = {
  /** Fixed simulation rate; rendering interpolates between steps. */
  stepsPerSecond: 60,
  /**
   * Upper bound on catch-up steps per frame. After a long stall (tab in background, breakpoint)
   * the backlog is dropped instead of freezing while the simulation fast-forwards.
   */
  maxStepsPerFrame: 5,
} as const;

export const PLACEHOLDER_ATLAS = {
  /** Tiles per row in the generated placeholder tile atlas. */
  columns: 8,
  /** Seed for the speckle pattern; keeps the generated atlas byte-identical between runs. */
  seed: 0x9e3779b9,
  /** Out of 256: chance a pixel gets a light or dark speckle. */
  speckleChance: 28,
} as const;
