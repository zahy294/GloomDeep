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
  /** Default world size in tiles (plan 3.1: a medium Terraria-sized world). */
  width: 4200,
  height: 1200,
  /** Chunk edge in tiles. Rendering loads/unloads and re-uploads whole chunks. */
  chunkSize: 128,
} as const;

/** World sizes offered when creating a world (plan 5: "world select and create (name, seed, size)"). */
export const WORLD_SIZES = {
  small: { width: 2800, height: 900 },
  medium: { width: WORLD.width, height: WORLD.height },
  large: { width: 6400, height: 1800 },
} as const;

/** Saving (plan 3.5). */
export const SAVE = {
  /** Seconds between autosaves while playing. */
  autosaveSeconds: 120,
  /** Rotating backups kept per world (newest first). */
  backups: 3,
  /**
   * The newest save becomes a backup only once it is this much newer than the previous backup;
   * otherwise it is overwritten. Keeps tab-switch saves from pushing out all the older backups.
   */
  backupSpacingSeconds: 120,
} as const;

/** World generation (plan 3.2). Distances in tiles unless noted. */
export const WORLDGEN = {
  /** Surface height as a fraction of world height, before hills. */
  surfaceLevel: 0.26,
  hillOctaves: [
    { amplitude: 30, wavelength: 420 },
    { amplitude: 10, wavelength: 96 },
    { amplitude: 3, wavelength: 24 },
  ],
  /** Flat, cave-free clearing around the spawn (the starting glade), and its blend into hills. */
  spawnHalfWidth: 40,
  spawnBlendWidth: 30,
  /** Elderglade covers this fraction of the width in the middle; the sides go to the other two. */
  centreBiomeFraction: 0.42,
  /** Biome borders wiggle by up to this much and blend terrain over this width. */
  biomeBorderWiggle: 40,
  biomeBlendWidth: 50,
  soilDepthMin: 6,
  soilDepthMax: 18,
  soilWavelength: 40,
  subsoilDepth: 5,
  /** Depth-layer boundaries wiggle by up to this many rows. */
  layerWiggle: 10,
  layerWiggleWavelength: 70,
  /** Noise wavelength of the secondary rock blended into each layer. */
  altRockWavelength: 18,
  /** Noise caves (as in M1) + worms + caverns. */
  caveWavelength: 48,
  caveDetailRatio: 3,
  caveDetailWeight: 0.35,
  caveMinDepth: 20,
  wormsPerThousandColumns: 6,
  wormLengthMin: 150,
  wormLengthMax: 500,
  wormRadiusMin: 1.5,
  wormRadiusMax: 3,
  /** Worms start this far from the world's sides, at most this fraction of the height down. */
  wormEdgeMargin: 20,
  wormStartDepthFraction: 0.6,
  /** Max turn per step (radians, ± half) and vertical squash: mostly horizontal tunnels. */
  wormTurn: 0.6,
  wormVerticalScale: 0.6,
  /** Large open caverns (low-frequency noise). */
  cavernWavelength: 140,
  cavernThreshold: 0.78,
  /** Surface pools fill dips up to this wide. */
  poolMaxWidth: 16,
  /** Underground lakes: cave air where this noise is high fills with the layer liquid. */
  lakeWavelength: 60,
  lakeThreshold: 0.7,
  /** Ore veins: average cells per vein (random-walk blobs). */
  veinCells: 9,
  /** Vein length = ore.size² × this × a random factor in [veinSizeRandomMin, +1). */
  veinSizeScale: 0.4,
  veinSizeRandomMin: 0.5,
  /** Secondary rock: noise above 1 − altRockAmount × this becomes the alt rock. */
  altRockSpread: 2.2,
  /** Feature clumps (glowcaps, roots, crystals) placed on cave surfaces: max size in tiles. */
  featureClumpMax: 4,
  /** Chance per exposed cave cell of a clump = layer featureAmount × this. */
  featureChanceScale: 0.25,
  /** Initial Gloam noise: wavelength, and strength × (gloamNoiseBase + noise). */
  gloamWavelength: 30,
  gloamNoiseBase: 0.5,
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

/** Code-driven player animation from parts (plan 2.9.8). Radians, pixels and seconds. */
export const PLAYER_ANIM = {
  /** Horizontal distance per walk frame (4 frames per stride). */
  strideFramePx: 7,
  /** Below this speed the player counts as standing (px/s). */
  walkSpeedThreshold: 12,
  /** Arms swing ± this while walking, opposite to each other. */
  walkArmSwing: 0.55,
  /** Body bobs up this many pixels on the passing frames. */
  walkBob: 1,
  /** Idle breathing: bob amplitude (px) and speed (rad/s). */
  idleBob: 1,
  idleBreathRate: 2.2,
  /** Arms lift while rising and spread while falling. */
  jumpArmRise: 2.4,
  fallArmSpread: 1.2,
  /** The back arm moves this fraction of the front arm, the other way, while airborne. */
  jumpBackArmFactor: 0.5,
  /** Mining swing: arc from (aim - back) to (aim + forward), full swings per second. */
  swingBack: 1.3,
  swingForward: 0.5,
  swingRate: 3.2,
  /** Hood trails behind horizontal motion (px per px/s), clamped, eased at this rate. */
  hoodTrailPerSpeed: 0.012,
  hoodTrailMax: 2,
  hoodTrailRate: 10,
} as const;

/** Render-side smoothing for the player sprite (purely visual). */
export const PLAYER_VIEW = {
  /** A 1-tile auto step-up snaps the body 16 px; the sprite eases over it at this rate (1/s). */
  stepUpSmoothRate: 30,
} as const;

/** Mining and building (plan 3.4 MiningSystem / BuildingSystem). */
export const MINING = {
  /** Max distance (tiles) from the player's centre to the target tile's centre. */
  reachTiles: 6,
  /** Hardness units removed per second at base power (tool tiers multiply this in M6). */
  basePower: 1,
  /** Visible crack stages drawn over a tile while it is mined. */
  crackStages: 4,
} as const;

export const BUILDING = {
  reachTiles: 6,
  /** Seconds between placements while the button is held. */
  placeInterval: 0.1,
} as const;

export const INVENTORY = {
  slots: 40,
  /** The first N slots are the hotbar. */
  hotbarSlots: 10,
} as const;

/** Dropped item entities (plan 2.8: "item flies to the player"). Pixels and seconds. */
export const ITEM_DROP = {
  size: 8,
  gravity: 900,
  maxFallSpeed: 480,
  /** Random upward/sideways pop when a drop spawns. */
  popSpeedX: 60,
  popSpeedY: 140,
  /** Horizontal slow-down on the ground (px/s²). */
  groundFriction: 600,
  /** Can't be collected for this long after spawning, so the pop is visible. */
  pickupDelay: 0.25,
  /**
   * Within this distance (px, centre to centre) the drop flies towards the player. Covers the
   * mining reach (6 tiles) plus a tile, so anything you can mine comes to you...
   */
  magnetRadius: 112,
  magnetAcceleration: 2400,
  magnetMaxSpeed: 420,
  /** ...and within this distance it is collected. */
  pickupRadius: 14,
  /** Drops left lying around longer than this vanish (keeps entity counts bounded). */
  despawnAfter: 600,
} as const;

/** Feedback on mining and building (plan 2.8). */
export const FEEDBACK = {
  /** Debris particles when a tile breaks / while it is being mined / when one is placed. */
  breakParticles: 10,
  mineParticlesPerSecond: 14,
  placeParticles: 5,
  particleLifespanMs: 450,
  particleSpeedMin: 30,
  particleSpeedMax: 110,
  particleGravity: 500,
  /** Screen shake when a tile breaks: peak offset (px) and how long it takes to fade (s). */
  breakShakeAmplitude: 2,
  breakShakeDuration: 0.12,
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
  /** Shake never exceeds this many pixels, however many shakes stack up. */
  maxShake: 6,
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

/**
 * Light grid (plan 2.3). Each tile stores R, G, B in 0–255. Light spreads by flood fill, losing a
 * fixed amount per tile depending on what the tile is made of.
 */
export const LIGHT = {
  /** Loss per tile through open air / non-solid tiles (per channel). 255 ÷ 16 ≈ a 16-tile reach. */
  airFalloff: 16,
  /** Loss per tile through solid blocks: light only creeps a few tiles into walls. */
  solidFalloff: 56,
  /**
   * The region recomputed around the camera, in tiles: the view (60×34) plus a border so the
   * camera's look-ahead never reaches the edge, plus a margin that only feeds light inwards
   * (sources up to `margin` tiles outside still reach the visible area). Only the inner part is
   * written back to the world.
   */
  innerWidth: 72,
  innerHeight: 46,
  margin: 16,
  /** Recomputations per second (the lantern and flicker move every frame). */
  updateHz: 30,
  /** A job not answered within this many seconds is abandoned and re-submitted. */
  jobTimeoutSeconds: 1,
} as const;

/** Day–night cycle (plan 2.4). Day fraction: 0 = midnight, 0.25 = dawn, 0.5 = noon, 0.75 = dusk. */
export const TIME = {
  /** One full day in real seconds (~20 minutes). */
  dayLengthSeconds: 1200,
  /** Where a new world starts. */
  startDayFraction: 0.3,
} as const;

/** The lantern and its fuel (plan 1.4). */
export const LUMEN = {
  max: 100,
  /** Lumen per second while the lantern burns (scaled by the lens's drain multiplier). */
  drainPerSecond: 0.5,
  /** Lumen restored by burning one Lumen Crystal from the inventory. */
  perCrystal: 25,
  start: 100,
} as const;

/** Additive glow pass (plan 2.3 "Glow and bloom"). */
export const GLOW = {
  /** Halo diameter as a multiple of the light's radius in pixels. */
  sizePerRadius: 0.9,
  /** Halo opacity for emissive tiles and the lantern. */
  tileAlpha: 0.55,
  lanternAlpha: 0.45,
  /** Most halos drawn at once (pooled sprites). */
  maxSprites: 160,
} as const;

export const DEBUG = {
  /** How often the F3 overlay text refreshes (Hz). */
  overlayRefreshHz: 4,
  /** World seed for `?scene=game` starts without `seed=`. */
  defaultSeed: 1,
} as const;

/** Blob autotiling (plan 2.6). */
export const AUTOTILE = {
  /** Distinct shapes in an 8-neighbour blob tileset. */
  blobShapes: 47,
  /** Visual variations per shape, chosen by a hash of the tile position. */
  variations: 3,
} as const;

export const PLACEHOLDER_ATLAS = {
  /** Frames per row in the generated placeholder atlases. */
  columns: 48,
  /** Seed for the speckle pattern; keeps the generated atlas byte-identical between runs. */
  seed: 0x9e3779b9,
  /** Out of 256: chance a pixel gets a light or dark speckle. */
  speckleChance: 28,
} as const;
