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

export const WORLD = {
  /** World size in tiles (plan 3.1: a medium Terraria-sized world). */
  width: 4200,
  height: 1200,
  /** Chunk edge in tiles. Rendering loads/unloads and re-uploads whole chunks. */
  chunkSize: 128,
} as const;

/** Parameters for the M1 test world (flat ground + hills + caves). Replaced by real worldgen in M4. */
export const TEST_WORLD = {
  defaultSeed: 1,
  /** Surface height as a fraction of world height, before hills. */
  surfaceLevel: 0.3,
  /** Hills: sum of smooth 1D noise octaves, amplitude in tiles, wavelength in tiles. */
  hillOctaves: [
    { amplitude: 28, wavelength: 420 },
    { amplitude: 9, wavelength: 96 },
    { amplitude: 3, wavelength: 24 },
  ],
  /** Half-width (tiles) of the flat clearing around the spawn point, and the blend into hills. */
  flatSpawnHalfWidth: 40,
  flatSpawnBlendWidth: 30,
  /** Soil thickness below the grass, in tiles (min..max, varies with 1D noise). */
  soilDepthMin: 6,
  soilDepthMax: 18,
  soilWavelength: 40,
  /** 2D noise caves: a tile is carved when the blended noise > threshold. */
  caveWavelength: 48,
  /** Second, finer noise octave: wavelength = caveWavelength / ratio, blended in by weight. */
  caveDetailRatio: 3,
  caveDetailWeight: 0.35,
  caveThreshold: 0.66,
  /** Caves never come closer than this to the surface, so the spawn area is solid ground. */
  caveMinDepth: 20,
  /** Moss patches and lumen crystal veins in the stone (2D noise above threshold). */
  mossWavelength: 20,
  mossNoiseThreshold: 0.76,
  crystalWavelength: 6,
  crystalNoiseThreshold: 0.86,
  crystalMinDepth: 120,
} as const;

/** Player feel parameters (plan 3.3). Pixels and seconds. */
export const PLAYER = {
  /** Collider size; the drawn sprite is ~20×40 and centred on it. */
  width: 12,
  height: 38,
  maxRunSpeed: 150,
  groundAcceleration: 1400,
  airAcceleration: 900,
  groundFriction: 1800,
  airFriction: 250,
  gravity: 1500,
  maxFallSpeed: 720,
  /** Initial jump speed; ~4.5 tiles high at full hold. */
  jumpSpeed: 470,
  /** Releasing jump while rising multiplies upward speed by this (variable jump height). */
  jumpCutMultiplier: 0.45,
  /** Ledges up to this height (px) are climbed automatically while walking, like stairs. */
  stepUpHeight: 16,
  coyoteTime: 0.1,
  jumpBufferTime: 0.1,
} as const;

/** Physics resolution: the largest distance a body moves before re-checking tiles. */
export const PHYSICS = {
  maxSubstepDistance: 8,
  /** How far below the feet (px) to look for ground when not moving down. */
  groundProbe: 1,
} as const;

/** Render-side smoothing for the player sprite (purely visual). */
export const PLAYER_VIEW = {
  /** A 1-tile auto step-up snaps the body 16 px; the sprite eases over it at this rate (1/s). */
  stepUpSmoothRate: 30,
} as const;

export const CAMERA = {
  /** Fraction of the remaining distance covered per second, as 1 - exp(-rate·dt). Higher = snappier. */
  followRate: 9,
  /** Look-ahead: camera leads the player by velocity × this, clamped to maxLookAhead. */
  lookAheadTime: 0.35,
  maxLookAheadX: 96,
  maxLookAheadY: 48,
  /** How fast the look-ahead offset itself eases in/out. */
  lookAheadRate: 3,
} as const;

export const CHUNK_RENDER = {
  /** Chunks within this many pixels outside the camera view are kept loaded (preloading). */
  preloadMarginPx: 512,
  /**
   * Pooled GPU layers. View + margin (960×540 + 2×512) is smaller than one 2048 px chunk, so it
   * touches at most 2×2 chunks; 6 leaves headroom. ChunkRenderer throws if this is ever too small.
   */
  poolSize: 6,
  /** Off-screen chunks filled per frame; chunks already in view are always filled immediately. */
  maxPreloadsPerFrame: 1,
} as const;

export const DEBUG = {
  /** How often the F3 overlay text refreshes (Hz). */
  overlayRefreshHz: 4,
} as const;

export const PLACEHOLDER_ATLAS = {
  /** Tiles per row in the generated placeholder tile atlas. */
  columns: 8,
  /** Seed for the speckle pattern; keeps the generated atlas byte-identical between runs. */
  seed: 0x9e3779b9,
  /** Out of 256: chance a pixel gets a light or dark speckle. */
  speckleChance: 28,
} as const;
