/** Tunable values. Systems read from here (or src/data/) instead of hard-coding numbers. */

export const DISPLAY = {
  /** Internal render resolution; the canvas is scaled up by whole numbers only. */
  width: 960,
  height: 540,
  /**
   * Rows may be cropped down to this height to keep a larger whole-number zoom (a windowed 1080p
   * browser is ~950 px tall: ×2 with 474 rows instead of ×1 with 540).
   */
  minHeight: 432,
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

/** Blending biome looks by camera position (src/render/biomeBlend.ts). Tiles and seconds. */
export const BIOME_BLEND = {
  /** Still fully "surface" this many rows below the ground, fully underground after the fade. */
  surfaceDepth: 18,
  surfaceFade: 24,
  /** Surface biomes are averaged over ±columnRadius columns, sampled every columnStep. */
  columnRadius: 48,
  columnStep: 4,
  /** Depth layers blend over this many rows each side of a boundary. */
  layerFade: 20,
  /** A crossing fades over about this long (plan 2.5: ~2 s). */
  transitionSeconds: 2,
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
  /**
   * Cave entrances (Minecraft-like): winding tunnels from the surface down into the depths.
   * They descend in switchbacks at a walkable slope (angles from horizontal, radians), so you can
   * walk down and climb back out; small chambers open up along the way.
   */
  /** Towns (M11): caves, pools and features keep this many tiles clear of a town's prefab. */
  townMargin: 3,
  /**
   * Boss arenas (M12): rows kept between an arena and its layer's top (below a ward) or bottom,
   * columns kept from the world's sides, and candidate places tried.
   */
  arenaLayerGap: 8,
  arenaEdgeMargin: 4,
  arenaAttempts: 60,
  /** The ground eases into a surface town's level over this many columns each side. */
  townBlendWidth: 24,
  /** Giant trees, ruins and fairy rings keep this many columns clear of a surface town. */
  townClearance: 22,
  /**
   * The tunnel down to an underground town: it opens at the surface `mouthOffset` columns out from
   * the town's gate, winds down in switchbacks no wider than `band` columns, and ends in a
   * corridor `corridorHeight` rows tall into the gate.
   */
  townTunnel: { mouthOffset: 40, band: 46, corridorHeight: 4 },
  caveEntrances: {
    perThousandColumns: 1.5,
    /** One entrance this far (columns) from the spawn, on a random side, so it's easy to find. */
    nearSpawnMin: 60,
    nearSpawnMax: 110,
    /** Entrances keep at least this many columns apart and away from the spawn glade. */
    spacing: 120,
    /** How deep they reach, as a fraction of the world's height. */
    depthFraction: 0.55,
    minSlope: 0.4,
    maxSlope: 0.9,
    turn: 0.25,
    /** Steps between switchbacks (the tunnel reverses horizontal direction). */
    switchbackMin: 25,
    switchbackMax: 55,
    radius: 2.2,
    mouthRadius: 3.2,
    /** Chance per step of a small chamber, and its radius. */
    chamberChance: 0.02,
    chamberRadius: 4.5,
    maxSteps: 3000,
    /** Giant trees stay this many columns away from a mouth. */
    treeClearance: 14,
    /** Loose silt and gravel this many tiles around a tunnel become stone (it can't cave in). */
    firmRing: 2,
  },
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
  /** Giant trees (src/data/trees.ts holds the species). */
  trees: {
    /** No trees this close to the world's sides, or this close to the world's top. */
    edgeMargin: 60,
    skyMargin: 4,
    /** Where no species grows, step this far to the next candidate site. */
    emptySiteStep: 40,
    /** Ground within ±siteHalfWidth of the trunk may differ by at most maxSlope rows. */
    siteHalfWidth: 6,
    maxSlope: 3,
    /** Trunk walls continue this far into the ground; the trunk never gets narrower than this. */
    trunkFooting: 3,
    minTrunkWidth: 2,
    /** Branches rise one row every this many tiles. */
    branchRiseEvery: 4,
    /** Canopy lumps: placed this far out (fraction of the radii), sized relative to the crown. */
    lumpReach: 0.8,
    lumpSize: 0.55,
    lumpMinScale: 0.6,
    /** Willow curtains: fraction of columns with a strand, shortest strand as a fraction. */
    droopDensity: 0.45,
    droopMin: 0.35,
    /** Hanging vines/moss: fraction of underside columns, longest chain. */
    hangingDensity: 0.22,
    hangingMaxLength: 6,
    /** Roots: chance per step of growing outward (otherwise down). */
    rootOutward: 0.6,
  },
  /** Flora and ruins (src/data/flora.ts holds the rules). */
  flora: {
    /** Saplings are drawn 3 tiles wide: keep them at least this many columns apart. */
    saplingSpacing: 5,
    /** Ruins: tries per wanted ruin, clear flat ground on either side, and how high to look for a
     * giant tree trunk (so ruins never stand inside one). */
    ruinAttempts: 20,
    ruinClearance: 8,
    trunkCheckHeight: 6,
  },
  /** Feature clumps (glowcaps, roots, crystals) placed on cave surfaces: max size in tiles. */
  featureClumpMax: 4,
  /** Chance per exposed cave cell of a clump = layer featureAmount × this. */
  featureChanceScale: 0.25,
  /** Azure lens secrets: chance an ore vein with a veiled form is placed veiled (looks like rock). */
  veiledVeinChance: 0.35,
  /**
   * Veiled spirit-platform bridges: a pit cut into a cave floor, spanned flush with the floor by a
   * hidden platform (walk on without the Azure lens and you fall in). Per 1000 columns.
   */
  spiritBridges: {
    perThousandColumns: 5,
    attemptsPerBridge: 400,
    minSpan: 4,
    maxSpan: 9,
    pitDepthMin: 5,
    pitDepthMax: 9,
  },
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
  /** Bare hands (no pickaxe carried): mines tier-0 tiles (soil, wood, plants) at this power. */
  handTier: 0,
  handPower: 0.6,
  /** Visible crack stages drawn over a tile while it is mined. */
  crackStages: 4,
} as const;

export const BUILDING = {
  reachTiles: 6,
  /** Seconds between placements while the button is held. */
  placeInterval: 0.1,
  /** Seconds between bucket scoops or pours while held. */
  bucketInterval: 0.25,
  /** Doors are this many tiles tall (the player is 2.4). */
  doorHeight: 3,
} as const;

export const INVENTORY = {
  slots: 40,
  /** The first N slots are the hotbar. */
  hotbarSlots: 10,
} as const;

/** Crafting (plan 3.4 CraftingSystem). */
export const CRAFTING = {
  /** A station counts when its tile centre is within this many tiles of the player's centre. */
  stationReach: 5,
  /** Most crafts one "craft all" request may make (keeps a held click from emptying the bag). */
  maxBatch: 99,
} as const;

/** Player health (plan 5 HUD). Damage sources arrive with combat (M8). */
export const HEALTH = {
  max: 100,
  /** Health regained per second, after `regenDelay` seconds without damage. */
  regenPerSecond: 1,
  regenDelay: 6,
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
  /** Items thrown out of the inventory: launch speed and the wait before they can be picked up. */
  throwSpeedX: 160,
  throwSpeedY: 120,
  throwPickupDelay: 2,
  /** Drops left lying around longer than this vanish (keeps entity counts bounded). */
  despawnAfter: 600,
} as const;

/** Feedback on mining and building (plan 2.8). */
export const FEEDBACK = {
  /** Debris particles when a tile breaks / while it is being mined / when one is placed. */
  breakParticles: 10,
  mineParticlesPerSecond: 14,
  placeParticles: 5,
  /** Spore puff when bouncing off a glowcap; sparkle when catching a firefly. */
  bounceParticles: 10,
  catchParticles: 6,
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
  /**
   * Outdoors the camera aims this many pixels above the player, so the view shows more of the
   * forest and sky and less dark soil; underground it centres on the player again.
   */
  surfaceLift: 88,
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
  /** Loss per tile through water, per channel: red goes first, so deep water looks blue. */
  waterFalloff: { r: 44, g: 30, b: 20 },
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
  /** Touching a glowing plant brightens it for this long (plan 2.0 bioluminescence)... */
  /** Sunlight never drops below this fraction under a leaf canopy (a dim, dappled forest floor). */
  canopyMinSun: 0.4,
  touchSeconds: 4,
  /** ...with its light radius multiplied by up to this much, fading back over that time. */
  touchRadiusBoost: 1.8,
} as const;

/** Day–night cycle (plan 2.4). Day fraction: 0 = midnight, 0.25 = dawn, 0.5 = noon, 0.75 = dusk. */
export const TIME = {
  /** One full day in real seconds (~20 minutes). */
  dayLengthSeconds: 1200,
  /** Where a new world starts. */
  startDayFraction: 0.3,
} as const;

/**
 * The Gloam (plan 1.4): a 0–255 level per cell that grows in darkness and burns away in light.
 * It only changes where the light grid is current (the region around the camera).
 */
export const GLOAM = {
  /** Updates per second over the light region. */
  tickHz: 4,
  /** Brightest channel at or below which a cell counts as dark (Gloam grows). */
  darkLight: 24,
  /** Brightest channel at or above which light burns Gloam away. */
  cleanseLight: 40,
  /** Gloam lost per second in full (255) light; scales with the light level. */
  cleansePerSecond: 160,
  /** Gloam gained per second in darkness next to full (255) Gloam; scales with the source. */
  growPerSecond: 5,
  /** A cell grows only if it or a neighbour has at least this much Gloam. */
  spreadMin: 16,
  /** Overlay levels: Gloam at or above each value draws the next, thicker vein frame. */
  visibleLevels: [40, 110, 180] as readonly number[],
  /** Placing a light burns Gloam in this radius at once (the light ring, plan 2.8). */
  burstRadius: 6,
  /** Gloam removed at the centre of the burst (fades to 0 at the edge). */
  burstStrength: 255,
  /** Crimson lens: cells lit by its cone lose this much more Gloam per second. */
  crimsonBurnPerSecond: 400,
  /** Overlay pulse: period (s) and alpha range. */
  pulseSeconds: 3.2,
  pulseMinAlpha: 0.65,
  /** Camera: Gloam around the view drains colour by up to this much saturation. */
  maxDesaturate: 0.45,
  /** Fraction of sampled cells under Gloam at which the drain is full. */
  desaturateAtCoverage: 0.5,
  /** Fraction of the gap to the new coverage closed per HUD refresh (eases the colour drain). */
  coverageEase: 0.5,
} as const;

/** Lens effects (plan 1.4). The cone itself (colour, range, angle) is in src/data/lenses.ts. */
export const LENS_FX = {
  /** Amber: health regained per second while the lantern burns. */
  amberHealPerSecond: 0.8,
  /** Verdant: cells of the cone examined per second (random picks; keeps it cheap). */
  conePicksPerSecond: 120,
  /** A cone cell must be at least this bright (the cone actually reaches it, not behind a wall). */
  coneMinLight: 60,
  /** Azure sees a little into rock: veiled tiles show where the cone's light is at least this. */
  revealMinLight: 8,
  /** Verdant: chance that a picked cell grows one stage. */
  verdantGrowChance: 0.08,
} as const;

/**
 * Liquids (plan 2.7, M9): a 0–255 amount per cell (world.liquid) that falls and spreads, only in
 * a region around the camera (plan 3.4: "only near the player").
 */
export const LIQUID = {
  /** Water ticks per second; lava moves on every `lavaEvery`-th tick (it is thick). */
  tickHz: 20,
  lavaEvery: 4,
  /** The active region, tiles, centred on the view. */
  activeWidth: 96,
  activeHeight: 64,
  max: 255,
  /** Liquid only spreads sideways from cells holding more than this (no endless thin films). */
  minSpread: 8,
  /** Sideways flow per tick: this share of the difference with the neighbour. */
  spreadShare: 1 / 3,
  /** A cell needs at least this much to count as liquid for swimming, light and splashes. */
  wetAmount: 96,
  /** Chance per lava tick that lava touching something flammable sets it alight. */
  lavaIgniteChance: 0.08,
} as const;

/** Swimming and lava (PlayerSystem, M9). Pixels and seconds. */
export const SWIM = {
  gravityFactor: 0.3,
  maxFallSpeed: 90,
  speedFactor: 0.55,
  /** Each jump press (or holding jump) swims upward at this speed. */
  swimUpSpeed: 200,
  /** Lava: damage per touch (with the usual invulnerability window between touches). */
  lavaDamage: 22,
} as const;

/** Falling silt and gravel (FallingSystem, M9). Pixels and seconds. */
export const FALLING = {
  gravity: 900,
  maxFallSpeed: 600,
  /** Damage to whatever a falling block lands on, if it falls at least `damageSpeed`. */
  damage: 18,
  damageSpeed: 200,
} as const;

/** Fire (FireSystem, M9). Seconds and tiles. */
export const FIRE = {
  tickHz: 6,
  /** Chance per second that fire jumps to each flammable neighbour (8 around, same cell's wall). */
  spreadPerSecond: 1.2,
  /** Fires stop spreading past this many burning cells (keeps a forest fire affordable). */
  maxBurning: 400,
  /** Burning cells sent to the light job as point lights (nearest first). */
  maxLights: 48,
  /** Water in a cell puts its fire out; rain puts out sky-exposed fires at this chance per second. */
  rainOutPerSecond: 0.5,
  /** Touching a burning cell hurts (with the usual invulnerability window). */
  damage: 8,
  /** A resting flare sets what it lies on (or next to) alight at this chance per second. */
  flareIgnitePerSecond: 0.8,
} as const;

/** Liquids, fire and falling blocks on screen (src/render/MaterialsRenderer.ts). Pixels, s, ms. */
export const MATERIALS_VIEW = {
  /** Liquid surfaces ripple: the wave phase advances this often (seconds). */
  waveSeconds: 0.35,
  splashCount: 10,
  splashLifeMs: 500,
  splashSpeedMin: 40,
  splashSpeedMax: 140,
  splashGravity: 500,
  steamCount: 8,
  steamLifeMs: 1400,
  steamSpeedMin: 10,
  steamSpeedMax: 40,
  steamLift: 30,
  steamScaleStart: 0.2,
  steamScaleEnd: 0.6,
  steamAlpha: 0.5,
  dustCount: 6,
  /** Flames: animation rate, per-cell phase offsets, at most this many drawn, wall flames dimmer. */
  flameRate: 10,
  flamePhaseX: 0.7,
  flamePhaseY: 1.3,
  maxFlames: 160,
  wallFlameAlpha: 0.7,
  flameHaloPx: 40,
  flameHaloAlpha: 0.45,
  /** Embers: one from every `emberEvery`-th flame each `emberInterval` seconds. */
  emberInterval: 0.25,
  emberEvery: 3,
  emberLifeMs: 1200,
  emberSpeedMin: 10,
  emberSpeedMax: 35,
  emberLift: 25,
  /** At most one ignition crackle per this many seconds. */
  igniteSoundGap: 0.6,
} as const;

/** Living flora (src/sim/systems/FloraSystem.ts, M10). Light levels 0–255, seconds, pixels. */
export const FLORA_FX = {
  tickHz: 2,
  /** Lumen blooms open at this light and close again at or below this. */
  bloomOpenLight: 90,
  // Above an open bloom's own glow (~56 at its cell), or it would keep itself open forever.
  bloomCloseLight: 64,
  /** Glowmoss: cells picked per cell of the region per second, chance one spreads, and how dark. */
  mossPicksPerCell: 0.02,
  mossSpreadChance: 0.25,
  mossDarkLight: 40,
  /** Fairy rings: this many mushrooms within `ringRadius` tiles, at night. */
  ringRadius: 4,
  ringMushrooms: 4,
  faeSeconds: 90,
  faeSpeed: 1.2,
  faeJump: 1.15,
  faeLanternDrain: 0.5,
  /** Glowcaps bounce you when you land at least this fast (px/s). */
  bounceMinSpeed: 280,
} as const;

/** Wisps that lead to secrets (src/sim/systems/WispSystem.ts, M10). Tiles, pixels, seconds. */
export const WISP = {
  /** How often one may appear (at night or underground), and the chance it does. */
  interval: 45,
  chance: 0.6,
  /** Secrets are looked for this far, but not this close (you're already there). */
  searchTiles: 100,
  minTiles: 8,
  /** Visited secrets are remembered by cells this many tiles wide. */
  secretCell: 12,
  /** It stays at most `leadTiles` ahead, waiting `waitTiles` from the player; arrives within. */
  leadTiles: 9,
  waitTiles: 5,
  arriveTiles: 4,
  speed: 70,
  lifeSeconds: 150,
  /** Appears this many pixels from the player; bobs as it drifts. */
  appearOffset: 40,
  bobRate: 3,
  bob: 20,
} as const;

/** Critters (src/sim/systems/CritterSystem.ts, M10). Pixels and seconds. */
export const CRITTER = {
  spawnInterval: 0.6,
  attemptsPerTick: 8,
  max: 26,
  /** A jar catches a critter whose centre is this close to the cursor. */
  catchRadius: 12,
  idleSeconds: 3,
  fleeSeconds: 2.5,
  gravity: 900,
  maxFall: 500,
  stepUp: 8,
  /** Hops: seconds between, idle and fleeing jump speeds. */
  hopSeconds: 1.8,
  hop: 160,
  fleeHop: 260,
  /** Flutter paths: wander frequency and how quickly they steer. */
  wanderRate: 1.1,
  steer: 3,
  /** Startled perchers fly up at this share of their speed, flapping. */
  flyLift: 0.6,
  flapRate: 14,
  flapBob: 40,
  /** Moths: look for light this often, this far (tiles), at least this bright; circle it. */
  lightSearchSeconds: 2,
  lightSearchRadius: 10,
  mothMinLight: 110,
  orbitRate: 3,
  orbitRadius: 14,
  /** Moths steer towards their orbit point this hard (per second). */
  orbitPull: 2,
  /** Flutter paths: vertical wander runs this much faster than horizontal (so they loop). */
  wanderSkew: 1.3,
  /** Fleeing frogs hop this much more often; swimming fish bob by this share of their speed. */
  fleeHopPace: 0.3,
  swimBob: 0.3,
  /** Light-shy critters startle when light rises this much above where they settled. */
  startleRise: 40,
  /** Fluttering groups scatter over this many tiles. */
  groupSpread: 3,
  /** Moths sample every this-many tiles when looking for light. */
  lightSearchStep: 2,
  /** Fish look this many pixels past their nose for the water's edge, and this many steps ahead below. */
  swimLookAhead: 2,
  swimLookSteps: 4,
} as const;

/** Your village (plan 1.7, M10): homes and folk. Tiles and seconds. */
export const SETTLEMENT = {
  /** How often homes are re-checked and newcomers considered. */
  checkSeconds: 2,
  /** A home's open space: at least / at most this many cells (bigger = not closed in). */
  minCells: 30,
  maxCells: 220,
  /** Share of a home's cells that need a background wall behind them. */
  wallCoverage: 0.9,
  /** Cells of headroom a resident needs where they stand. */
  standHeight: 3,
  /** Villagers stroll inside their home: walking speed and pause between strolls. */
  walkSpeed: 30,
  idleSecondsMin: 2,
  idleSecondsMax: 6,
  /** The Old Dryad stands this many tiles from the spawn tree's trunk. */
  dryadOffset: 3,
  /** Right-clicking someone within this many pixels of the cursor talks to them. */
  talkSlop: 6,
  /** Fast travel works only within this many tiles of a beacon. */
  travelReach: 6,
  /** A strolling villager has arrived within this many pixels of where they meant to go. */
  arrivePx: 2,
} as const;

/** Townsfolk moving on their town's waypoint graph (src/sim/systems/NavSystem.ts). */
export const NAV = {
  /** Pixels per second walking, and riding a lift basket. */
  walkSpeed: 34,
  liftSpeed: 40,
  /** Standing about, they turn round every this many seconds (random in the range). */
  idleTurnMin: 3,
  idleTurnMax: 9,
  /** Horizontal pixels left to walk before they bother facing that way. */
  faceThreshold: 0.5,
} as const;

/** Towns (src/sim/systems/TownSystem.ts, plan 1.7). Shares are 0..1; times in seconds. */
export const TOWN = {
  /** Schedules, lamps and districts are re-checked this often. */
  checkSeconds: 1,
  /** Seconds of night a full street lamp burns (lamps only burn at night; ~3 nights). */
  lampBurnSeconds: 1500,
  /** Below this share of fuel a lamp burns dim; at 0 it goes out. */
  lampDimBelow: 0.35,
  /** How much a dim lamp counts towards the town's light (a lit one counts 1). */
  dimLampWorth: 0.5,
  /** At night, folk in a town lit less than this are afraid and go home. */
  scaredBelow: 0.5,
  /** A town at least this bright keeps the Gloam and creature spawns out of its streets. */
  protectLight: 0.5,
  /** A district counts as reclaimed when this share of its cells or less still holds Gloam... */
  reclaimShare: 0.04,
  /** ...at or above this level. */
  reclaimGloam: 24,
  /** Right-clicking a lift post works within this many tiles of the player. */
  liftReach: 3,
} as const;

/** Trade prices (src/sim/systems/TradeSystem.ts). Multipliers on SHOPS prices. */
export const TRADE = {
  /** A completely dark town charges this much more (scaled by how dark it is). */
  darkMarkup: 0.5,
  /** Each lit road into the town takes this much off. */
  roadDiscount: 0.15,
  /** Prices never fall below this multiple of the base price. */
  minFactor: 0.6,
  /** Traders pay this share of an item's value (times the price factor, if below 1). */
  sellShare: 0.8,
  /** Shopping works within this many tiles of the trader. */
  reachTiles: 8,
} as const;

/** Lit trade roads and caravans (src/sim/systems/RoadSystem.ts). Tiles and seconds. */
export const ROAD = {
  /** The road is checked at points this many columns apart. */
  sampleSpacing: 6,
  /** A point is lit with a placed light (not flora) within this many tiles of it. */
  litRadius: 9,
  /** Look this many rows above and below the ground at a point for that light. */
  litRows: 6,
  /** Re-check after a light is placed or removed, at most this often. */
  checkSeconds: 1,
  /** Caravan: pixels per second, seconds it rests at each end, and its lantern. */
  caravanSpeed: 26,
  caravanRestSeconds: 40,
  caravanLight: 'hanging_lantern',
} as const;

/** Escort quests (src/sim/systems/QuestSystem.ts). Tiles and seconds. */
export const ESCORT = {
  /** They join you when you come this close after accepting. */
  joinTiles: 4,
  /** They walk to within this distance of you, and are teleported up if left this far behind. */
  followTiles: 2.5,
  catchUpTiles: 18,
  walkSpeed: 120,
  jumpSpeed: 420,
  /** Light at their feet (brightest channel) below which they are in the dark... */
  fearLight: 40,
  /** ...and after this many seconds of it (in total, it recovers in light) they run home. */
  fearSeconds: 6,
  /** Fear fades this many times faster than it builds, while lit. */
  calmRate: 0.5,
  /** Arrived: within this many tiles of the village's centre (the spawn). */
  arriveTiles: 8,
} as const;

/** "Find" quests: something lost in a cave (src/sim/systems/QuestSystem.ts). Tiles. */
export const FIND = {
  /** Random tries at a hiding place in the giver's range before settling for the giver's spot. */
  attempts: 400,
  /** Hiding places are at least this many rows below the ground (in a cave, not on a hill). */
  minDepth: 8,
  /** You pick it up when you come this close. */
  pickupTiles: 1.8,
  /** Wisps for an active find appear this often (seconds) and always, day or night. */
  wispInterval: 12,
} as const;

/** Festivals (src/sim/systems/TownSystem.ts): from dusk to dawn (day fractions). */
export const FESTIVAL = {
  startsAt: 0.8,
  endsAt: 0.25,
} as const;

/** Boss fights in general (src/sim/systems/BossSystem.ts; each boss's own numbers: src/data/bosses.ts). */
export const BOSS = {
  /** Seconds of the intro (camera zoom and title card): the boss holds still and can't be hurt. */
  introSeconds: 2.8,
  /** The tile that seals an arena's doorways while the fight is on. */
  sealTile: 'arena_seal',
  /** Fight state is re-checked (arena left, lures, braziers) this often. */
  checkSeconds: 0.25,
  /** Hostile shots: collision radius (px) by default, and the longest any shot lives (s). */
  shotRadius: 4,
  shotLife: 6,
  /** Right-clicking an arena fixture (lever, prism, root-lamp) works within this many tiles. */
  useReach: 4,
  /** Minions appear within this many tiles of the boss. */
  minionSpread: 6,
  /** The fight ends if the player is this many tiles outside the arena rectangle. */
  leaveMargin: 2,
  /**
   * Share of ordinary creature spawns that still happen while a fight is on (0 = none; the
   * boss's own creatures always come). Dimming-night shade waves wait until the fight is over.
   */
  wildSpawns: 0,
} as const;

/**
 * Dimming nights (plan 1.4: "every few in-game days the sun dims further ... the Gloam spreads
 * faster, and waves of shades attack"). Days count from 0 at the world's start; the night that
 * begins on day `firstDay` is the first Dimming night, then every `everyDays` days.
 */
export const DIMMING = {
  firstDay: 2,
  everyDays: 3,
  /** Day fractions: the warning, when it starts deepening, full strength, and fading at dawn. */
  warnAt: 0.62,
  startsAt: 0.76,
  fullAt: 0.82,
  fadeAt: 0.2,
  endsAt: 0.26,
  /** Sunlight × this at full strength on the first Dimming night; each survived one dims it by `deepenBy`, down to `minSun`. */
  sun: 0.45,
  deepenBy: 0.07,
  minSun: 0.2,
  /** Sky colours mixed this far towards the Dimming sky (src/data/dayCycle.ts DIMMING_SKY). */
  skyMix: 0.75,
  /** The Gloam grows this many times faster. */
  gloamGrowth: 4,
  /** Shade waves: seconds between waves, shades per wave (+1 per survived night, up to `waveMax`). */
  waveSeconds: 55,
  waveSize: 3,
  waveMax: 7,
  /** Wave shades rise where the light is at most this, this far (tiles) from the player. */
  waveDarkLight: 60,
  waveMinTiles: 14,
  waveMaxTiles: 26,
  waveAttempts: 60,
  /** At most this many shades at once during a wave night. */
  maxShades: 12,
  /** A town at least this bright keeps a vigil instead of hiding; its lamps burn this much faster. */
  vigilLight: 0.75,
  lampBurnScale: 2,
  /** Dawn after a Dimming night leaves this many Lumen crystals at your feet. */
  dawnGift: { item: 'lumen_crystal', count: 3 },
} as const;

/** Boss fights on screen (src/render/BossRenderer.ts). Pixels, seconds, radians. */
export const BOSS_VIEW = {
  /** Intro: camera zoom, and the share of the intro spent zooming in (and again out). */
  introZoom: 2,
  introEase: 0.25,
  flashSeconds: 0.08,
  /** Animation rates (frames per second) and the stunned Matriarch's tumble. */
  poseRate: 2,
  flapRate: 9,
  tumbleRate: 8,
  tumbleAngle: 0.35,
  /** The Heart's heartbeat: scale wobble and rate (rad/s). */
  pulseRate: 4,
  pulseScale: 0.05,
  submergedAlpha: 0.35,
  haloScale: 2.2,
  haloAlpha: 0.45,
  /** Shots: drawn at their collision diameter × this, at least this many px. */
  shotScale: 1.6,
  shotMinPx: 6,
  /** The Warden's lantern beam: [width px, colour, alpha] strokes, dimmer while it misses. */
  beamStrokes: [
    [6, 0x2fb2b8, 0.25],
    [2, 0xd6e0f0, 0.8],
  ] as readonly (readonly [number, number, number])[],
  beamIdleAlpha: 0.55,
  /** Screen shakes. */
  slamShake: 4,
  hitShake: 3,
  phaseShake: 6,
  shakeSeconds: 0.3,
  phaseShakeSeconds: 0.6,
} as const;

/**
 * Photo mode (M13, src/render/PhotoMode.ts): camera speed (px/s, ×fastFactor with Shift), the
 * saved PNG's whole-number upscale, and the filter presets (mixed into the camera grade).
 */
export const PHOTO = {
  panSpeed: 320,
  fastFactor: 3,
  saveScale: 4,
  presets: {
    none: { label: 'None', tint: 0xffffff, tintMix: 0, saturation: 1, contrast: 1, brightness: 1 },
    warm: {
      label: 'Warm',
      tint: 0xffc890,
      tintMix: 0.25,
      saturation: 1.1,
      contrast: 1.05,
      brightness: 1.04,
    },
    cold: {
      label: 'Cold',
      tint: 0x9ab8ff,
      tintMix: 0.25,
      saturation: 0.9,
      contrast: 1.05,
      brightness: 0.98,
    },
    dream: {
      label: 'Dream',
      tint: 0xf0a0d0,
      tintMix: 0.2,
      saturation: 1.3,
      contrast: 0.92,
      brightness: 1.08,
    },
    noir: {
      label: 'Noir',
      tint: 0xffffff,
      tintMix: 0,
      saturation: 0,
      contrast: 1.25,
      brightness: 1,
    },
  },
} as const;

export type PhotoPresetKey = keyof typeof PHOTO.presets;

/** Dimming nights on screen (sky aurora, colour grade). */
export const DIMMING_FX = {
  /** Grade at full strength: tint mixed in, saturation and brightness multipliers. */
  tint: 0x8a6ad8,
  tintMix: 0.35,
  saturation: 0.7,
  brightness: 0.88,
  /** Aurora ribbons: count, vertical position (share of the view height), amplitude, colours. */
  aurora: {
    ribbons: 3,
    top: 0.12,
    spacing: 0.07,
    height: 26,
    waveAmplitude: 14,
    waveLength: 180,
    speed: 0.25,
    columns: 96,
    alpha: 0.32,
    colors: [0x5cc495, 0x76e6e0, 0xc4637e] as readonly number[],
  },
} as const;

/** Placed and thrown light on screen (src/render/LightEffects.ts). Pixels and seconds. */
export const LIGHT_FX = {
  /** The ring texture's size, and how long a placed light's ring takes to reach its radius. */
  ringTexturePx: 64,
  ringSeconds: 0.7,
  /** The small cyan ring where the Azure lens reveals a tile. */
  revealRingRadius: 14,
  revealRingSeconds: 0.5,
  /** A flare in the world, and its halo at full strength. */
  flareSpritePx: 10,
  flareHaloPx: 96,
  /** Halo flicker: depth (fraction of alpha), speed (rad/s) and phase offset per flare. */
  flareHaloFlicker: 0.25,
  flareFlickerSpeed: 23,
  flareFlickerPhase: 1.7,
} as const;

/** Combat (plan 3.4 CombatSystem, 2.8 "Hit"). Pixels, seconds, health points. */
export const COMBAT = {
  /** Melee reach when a weapon gives none, and the swing's arc (half-angle, radians). */
  defaultReach: 30,
  swingHalfArc: 1.2,
  /** Enemies this close to the hand are hit whatever the swing's direction. */
  swingInnerReach: 10,
  /** Hits land during this first part of a swing. */
  swingActiveFraction: 0.6,
  /** Knockback: weapon knockback × target's knockbackTaken × these (px/s). */
  knockbackSpeed: 60,
  knockbackLift: 40,
  /** After being hit an enemy can't be hit again for this long, and doesn't steer for this long. */
  enemyInvuln: 0.15,
  enemyStun: 0.3,
  /** The game freezes this long when a hit lands (hit-stop). */
  hitStop: 0.06,
  /** The player after taking damage: invulnerable, knocked back, without control for a moment. */
  playerInvuln: 0.8,
  playerKnockbackSeconds: 0.25,
  playerKnockbackSpeed: 240,
  playerKnockbackLift: 220,
  /** Death: seconds until respawning at the spawn, and the share of Lumen lost. */
  respawnSeconds: 4,
  deathLumenLoss: 0.25,
  /** Shades burn in light at least this bright; a Crimson cone adds this much damage per second. */
  shadeBurnLight: 70,
  crimsonShadeDps: 30,
  /** Light damage is reported as a hit (damage number) whenever this much has built up. */
  burnReportEvery: 3,
  /** Lumen beams hit shades this much harder. */
  beamShadeMultiplier: 2,
  /** Creatures hurt by fire, lava or a falling block can't be hurt that way again for this long. */
  hazardInvuln: 0.5,
} as const;

/** Talking and beacon travel UI (src/render/scenes/GameScene.ts, M10). Tiles. */
export const VILLAGE_UI = {
  /** The speech box / travel list closes when you walk this far from the speaker or beacon. */
  closeTiles: 6,
  /** Travel labels mention height only past this many tiles. */
  levelTiles: 4,
} as const;

/** Villagers, critters and wisps on screen (src/render/LifeRenderer.ts, M10). Pixels, seconds. */
export const LIFE_VIEW = {
  /** Two-frame animation rates (frames per second); the Dryad sways slowly. */
  walkRate: 5,
  flapRate: 12,
  swayRate: 0.8,
  animPhase: 0.37,
  /** Names show over villagers within this many tiles of the player. */
  tagTiles: 6,
  tagFontPx: 8,
  tagGap: 3,
  tagColor: '#f2e6c8',
  tagStroke: '#05080a',
  tagStrokePx: 2,
  /** Glowing critters: halo size, pulse rate and the dimmest point of the pulse. */
  haloPx: 18,
  glowPulse: 3,
  haloMin: 0.45,
  /** Critter eye glints: size, strength, height on the body (share from the top), lead. */
  eyePx: 7,
  eyeAlpha: 0.95,
  eyeAt: 0.3,
  eyeHangingAt: 0.8,
  eyeForward: 1,
  /** Wisp: core size, flicker, and a trail of this many points sampled every wispTrailStep s. */
  wispPx: 22,
  wispFlicker: 0.15,
  wispFlickerRate: 11,
  wispTrail: 8,
  wispTrailStep: 0.05,
  wispTrailPx: 12,
  /** At most one flutter sound per this many seconds (a startled colony takes off at once). */
  flutterSoundGap: 0.4,
  /** The ring when a wisp appears or arrives. */
  ringRadius: 40,
  ringSeconds: 0.9,
} as const;

/** Combat on screen (src/render/CombatRenderer.ts). Pixels and seconds. */
export const COMBAT_VIEW = {
  /** Two-frame animation rates (frames per second) and a per-creature phase offset. */
  walkRate: 5,
  flapRate: 10,
  animPhase: 0.37,
  /** Hoppers: vertical scale on the ground (inverse in the air). */
  squash: 0.8,
  flashSeconds: 0.1,
  shadeAlpha: 0.88,
  /** Eye glow: size, height on the body (fraction from the feet), strength. */
  eyeGlowPx: 10,
  eyeHeight: 0.75,
  /** Eyes sit this share of the body width ahead of its centre. */
  eyeForward: 0.15,
  eyeAlpha: 0.25,
  /** Shades: a larger cold glow around their eyes, so the darkness has a face. */
  shadeGlowPx: 26,
  shadeEyeAlpha: 0.75,
  arrowPx: 12,
  beamLength: 26,
  beamWidth: 8,
  /** Damage numbers: font size, rise speed, life, colours (hit, light burn, player hurt). */
  numberFontPx: 8,
  numberStroke: '#05080a',
  numberStrokePx: 2,
  /** Damage numbers kept for reuse (more live at once just create extra). */
  numberPool: 24,
  numberRise: 24,
  numberSeconds: 0.8,
  hitColor: '#f2cc5a',
  burnColor: '#d6e0f0',
  hurtColor: '#ff8a7a',
  /** Death wisps: count (shades dissolve into more), size, life, spread and rise speeds. */
  deathWisps: 6,
  shadeWisps: 14,
  wispPx: 8,
  wispSeconds: 1.1,
  wispLifeJitter: 0.35,
  wispSpread: 30,
  wispRise: 40,
  wispDrag: 2,
  /** Camera shake when the player is hurt (amplitude px, seconds). */
  hurtShake: 3,
  hurtShakeSeconds: 0.15,
  /** The player blinks while invulnerable (blinks per second, alpha of the dim phase). */
  blinkRate: 12,
  blinkAlpha: 0.35,
} as const;

/** Shots (src/sim/entities/Projectile.ts). Pixels and seconds. */
export const PROJECTILE = {
  arrow: { speed: 520, gravity: 400, size: 4, life: 3 },
  beam: { speed: 700, gravity: 0, size: 6, life: 0.6 },
} as const;

/** Creature movement (src/sim/systems/EnemyAI.ts). Pixels, seconds, tiles where noted. */
export const ENEMY_AI = {
  gravity: 1300,
  maxFallSpeed: 700,
  acceleration: 900,
  groundFriction: 900,
  stepUp: 16,
  /** Wandering: seconds before turning, and the share of top speed. */
  wanderSeconds: 2.5,
  wanderSpeed: 0.35,
  /** Walkers jump towards a player standing this many tiles higher. */
  jumpAtHeight: 2,
  /** Hoppers: seconds between hops (longer and lower when idle). */
  hopDelay: 0.8,
  idleHopFactor: 2.5,
  idleHopHeight: 0.5,
  /** Fraction of speed kept when a hopper bounces off a wall. */
  wallBounce: 0.5,
  /** Flyers and shades bob up and down. */
  bobRate: 3,
  bobSpeed: 30,
  /** Light-shy flyers scatter above this light; shades shrink back above this. Seconds of fleeing. */
  fleeLight: 150,
  shadeFleeLight: 110,
  fleeSeconds: 1.2,
  /** Fleeing flyers also climb by this share of their speed. */
  fleeLift: 0.4,
  /** Burrowers: lurk this many tiles under the player, lunge when within range horizontally and
   * the player is at most `lungeHeight` tiles above; wait between lunges. */
  burrowDepth: 3,
  lungeRange: 1.5,
  lungeHeight: 9,
  lungeCooldown: 1.5,
  lungeMinSeconds: 0.3,
  lungeDrift: 0.4,
} as const;

/** Spawning (plan 3.4 SpawnSystem). Tiles and seconds. */
export const SPAWN = {
  interval: 0.5,
  attemptsPerTick: 10,
  maxEnemies: 10,
  maxShades: 6,
  /** At most this many of any one other creature at once. */
  maxPerType: 3,
  /** Burrowers spawn in rock with open air at most this many tiles above. */
  burrowerAirSearch: 3,
  /** Spawns happen outside this half-size of the view around its centre (60×34 tiles visible). */
  viewHalfWidth: 31,
  viewHalfHeight: 18,
  /** Shades need light at most this (brightest channel). */
  darkLight: 16,
  /** Shade spawn weight × (1 + Gloam level × this): the Gloam breeds them. */
  gloamShadeBoost: 3,
  /** Ground creatures drop at most this far from the tried cell to find a floor. */
  groundSearch: 12,
  /** Creatures farther than this from the player vanish. */
  despawnTiles: 70,
  /** Sunlight (brightest channel, 0–255) at or above which day-only creatures spawn. */
  daylightSun: 128,
  /** Spots this many rows under the ground still count as the surface biome. */
  surfaceDepth: 6,
} as const;

/** Flares (plan M7): thrown light. Pixels and seconds. */
export const FLARE = {
  size: 6,
  throwSpeed: 380,
  gravity: 700,
  maxFallSpeed: 480,
  /** Speed kept after a bounce, and the friction that stops it on the ground. */
  bounce: 0.35,
  groundFriction: 500,
  /** Burns this long, the last `fadeSeconds` dimming. */
  lifeSeconds: 40,
  fadeSeconds: 6,
  /** Time between two throws while the button is held. */
  throwInterval: 0.35,
  /** At most this many burn at once; throwing another puts out the oldest. */
  maxActive: 12,
} as const;

/** The lantern and its fuel (plan 1.4). */
export const LUMEN = {
  max: 100,
  /** Lumen per second while the lantern burns (scaled by the lens's drain multiplier). */
  drainPerSecond: 0.5,
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
  /** `?spot=entrance`: stand this many tiles before the cave mouth (on the spawn's side). */
  entranceStandOff: 6,
  /** `?spot=village`: cottages start this many tiles right of the spawn, this far apart. */
  villageOffset: 16,
  villageGap: 3,
  villageHouses: 4,
  /** Rows cleared above each cottage (trees, overhangs). */
  villageHeadroom: 6,
  /** `?critter=`: look for a fitting spot this far from a point a few tiles right of the player. */
  critterOffsetTiles: 8,
  critterSearchTiles: 10,
  /** Ceiling perchers: climb at most this far to find the ceiling above that spot. */
  critterCeilingTiles: 60,
  /** `?enemy=`: how many tiles right of the player the creature stands. */
  enemyOffsetTiles: 4,
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

/** Audio mix (plan 3.6). Gains 0..1, times in seconds. Sound design recipes: src/data/audio.ts. */
export const AUDIO = {
  master: 0.8,
  music: 0.55,
  ambience: 0.7,
  /** Layer gains glide to their targets with this time constant (no clicks, smooth crossfades). */
  smoothing: 0.6,
  /** Wind is always faintly there; stronger wind raises it to full. Rain adds to the wind bed. */
  windFloor: 0.35,
  rainWind: 0.4,
  /** Under water, airy layers (birds, crickets, chimes, wind) drop to this fraction. */
  underwaterAiry: 0.15,
  /** A second place's music joins the mix only above this blend weight. */
  musicMinWeight: 0.08,
  /** Melody wanders at most this many scale degrees from the root. */
  melodyRange: 7,
  /** Events are scheduled this far ahead of the audio clock. */
  lookahead: 0.25,
  /** The master gain glides to/from silence over this time constant when pausing (s). */
  pauseFade: 0.1,
  /** Music voice gains fade this many times slower than the ambience smoothing. */
  musicFadeFactor: 3,
  /** A voice below this gain that left the mix is dropped. */
  silentVoiceGain: 0.001,
  /** Ambient event layers below this level do not fire. */
  minEventLevel: 0.01,
} as const;

/** Sky-side and front-side atmosphere (plan 2.0, 2.2 layers 3, 4, 15, 16; M5 D1/D5). */
export const ATMOSPHERE = {
  /** Per-frame time step used by the atmosphere layers is clamped to this (s), so a stalled tab does not jump them. */
  maxFrameSeconds: 0.1,
  parallax: {
    /** Where each layer's bottom edge sits on screen (fraction of view height) with the camera at ground level; back to front. */
    bottomFraction: [0.6, 0.7, 0.84, 1.0],
    /** Screen px a layer's bottom moves per world px the camera centre is below the ground line (rises going underground). */
    verticalFactor: [0.05, 0.1, 0.18, 0.3],
    /** How quickly the remembered ground line follows hills (seconds). */
    groundSmoothSeconds: 0.6,
    /** Fraction of daylight kept at night so silhouettes still read, and the night colour multiplier. */
    nightFloor: 0.34,
    nightTint: 0x8fa2d8,
    /** Tint changes smaller than this (per channel sum) do not trigger a re-tint. */
    tintEpsilon: 3,
    /** Biome weights below this hide the layer set. */
    minWeight: 0.01,
    /** Draw order: sky gradient is -1, stars/sun/moon 0. */
    depthBase: 10,
  },
  mist: {
    /** Back mist layers sit after parallax layers 1 and 2 (indices into the 4 layers). */
    afterLayer: [1, 2],
    /**
     * Back mist is a baked soft-edged fog texture (Shader objects take no filters, so noise cannot
     * fade towards the top): size in px, noise cells across it, and per layer the stretch, bottom
     * edge (fraction of view height), strength relative to the biome's mist alpha, drift (px/s),
     * extra drift at full wind (px/s) and camera parallax.
     */
    texture: {
      width: 256,
      height: 96,
      cellsX: 4,
      cellsY: 3,
      seed: 0x6157,
      /** Fraction of the texture height over which opacity ramps in from the top. */
      profileRamp: 0.85,
      /** Multiplier on the value noise before it is clamped to opacity. */
      noiseGain: 1.3,
    },
    scaleX: [3, 4],
    scaleY: [3, 2],
    bandBottom: [0.9, 1.0],
    backScale: [0.9, 0.7],
    driftPx: [4, 7],
    windPx: [30, 45],
    backCameraParallax: [0.12, 0.25],
    frontScale: 0.28,
    /** Front mist (a thin NoiseSimplex2D over the whole view): cells, octaves, drift and camera parallax in noise units, start offset. */
    frontCells: [8, 4],
    iterations: 2,
    frontDrift: 0.05,
    /** Extra noise units per second at full wind. */
    windSpeed: 0.12,
    frontCameraParallax: 0.002,
    frontOrigin: [77.7, 31.4],
    /** Mist kept underground (fraction of its outdoor strength) for the front layer. */
    undergroundFront: 1,
    /** Mist alpha is changed in steps no smaller than this. */
    alphaEpsilon: 0.004,
    /** Contrast of the front mist noise (shader `noiseValuePower`; higher = patchier). */
    noiseValuePower: 1.4,
  },
  starfall: {
    /** Streaks per real minute on a fully clear night. */
    perMinute: 3,
    /** Streak pool size, sprite depth and thickness (y scale), and how steep the fall is (dy per dx). */
    pool: 3,
    depth: 0.5,
    thickness: 0.5,
    slope: 0.45,
    /** Fraction of the streak's life spent fading in. */
    fadeIn: 0.2,
    /** Needs at least this much night and at most this much rain. */
    minNight: 0.7,
    maxRain: 0.2,
    /** Streak length (px), travel (px), duration (ms) range, and the sky band (fraction of height) they cross. */
    length: 14,
    travel: 90,
    durationMin: 450,
    durationMax: 800,
    band: 0.4,
    seed: 0x57a2,
  },
  sky: {
    /** Stars: count, placement seed, the top fraction of the view they fill, and the chance and size (px) of a bright one. */
    stars: { count: 90, seed: 0x5ca7, band: 0.7, brightChance: 0.2, brightSize: 2, dimSize: 1 },
    /** At full rain the sun and moon fade to 1 − this. */
    rainHidesBodies: 0.9,
    /** Overcast: how far the sky goes towards grey, and how much darker, at full rain. */
    rainGrey: 0.7,
    rainDarken: 0.2,
    /** Lightning: sky colour at full flash. */
    flashColor: 0xe8eeff,
    flashMix: 0.75,
  },
  front: {
    canopy: {
      /** Horizontal speed relative to the camera (>1 = passes faster than the world). */
      scroll: 1.4,
      /** Peak opacity, tint, sway (px) and sway speed (rad/s), wind multiplies sway. */
      alpha: 0.95,
      tint: 0x0b1f24,
      swayPx: 6,
      swaySpeed: 0.6,
      /** Sway at no wind, as a fraction of the sway at full wind (sway scales with `calmSway + |wind|`). */
      calmSway: 0.4,
      /** Hidden below this opacity. */
      minAlpha: 0.04,
    },
  },
} as const;

/** Canopy light shafts (plan 2.0 "Canopy light shafts"): additive beams through leaf gaps. */
export const SHAFTS = {
  /** Open (leafless) column runs this wide or narrower, bounded by shaded columns, become shafts. */
  maxGapTiles: 6,
  /** A neighbour column counts as shaded below this fraction of sun. */
  shadedBelow: 0.9,
  /** Tiles below the canopy top where the beam starts; it must be at least this tall to count. */
  topInsetTiles: 2,
  minHeightTiles: 4,
  maxHeightTiles: 130,
  /** Tiles of world columns cached beyond the view on each side (beams slant up to maxLean). */
  cacheMarginTiles: 100,
  /** Most beams drawn at once (pooled images). */
  maxVisible: 24,
  /** Beam width in tiles at the top: the gap width plus this, clamped to the range. */
  widthPadTiles: 0.5,
  minWidthTiles: 1.5,
  maxWidthTiles: 3,
  /** Beam slant (horizontal px per vertical px) at sunrise and sunset; zero at noon. */
  maxLean: 0.32,
  /** Beam opacity at its strongest (golden hours). */
  peakAlpha: 0.5,
  /** Fraction of peak opacity left at noon. */
  noonAlphaFactor: 0.55,
  /** Daylight range over which the beams fade in from night. */
  daylightFadeFrom: 0.25,
  daylightFadeTo: 0.7,
  /** Sway: angle (rad) and opacity breathing (fraction), slow. */
  swayAngle: 0.035,
  swayAlpha: 0.2,
  swaySpeed: 0.45,
  /** Mix of the warm shaft gold with the sun colour (0 = gold only). */
  sunTintMix: 0.25,
  gold: 0xffd98a,
  /** Generated beam texture size (smooth gradient, linear filtering). */
  textureWidth: 32,
  textureHeight: 128,
  /** Beams below this opacity are not drawn. */
  minAlpha: 0.002,
  /** Beam texture brightness is `profileBase + profileSpan * (1 - t)` down the beam (t 0 = top): brighter at the top. */
  profileBase: 0.7,
  profileSpan: 0.3,
  /** Sway: the angle swings at this fraction of the opacity breathing speed; per-beam phases come from x times these. */
  angleSpeedFactor: 0.7,
  phaseSpread: 1.7,
  anglePhaseFactor: 0.6,
  /** Fractions of the beam length over which its top fades in and its foot fades out. */
  fadeInFraction: 0.04,
  fadeOutFraction: 0.08,
  /** Bottom width relative to the top. */
  flare: 1.5,
  /** Motes drifting in each beam, and their fall/drift speeds (px/s) and size. */
  motesPerShaft: 6,
  moteFallSpeed: 3,
  moteDriftPx: 5,
  moteScale: 1,
  moteAlpha: 0.9,
  /** Days are measured from noon: beams reach their golden-hour strength/lean at this far from 0.5. */
  goldenSpan: 0.25,
  /** How fast the beam brightens from noon to golden hour (higher = sooner). */
  goldenSharpness: 1.4,
} as const;

/** Floating motes and glowing particles (fireflies, spores, embers), drawn additively. */
export const AMBIENT = {
  /** Pool size per kind; the biome counts are capped by these. */
  capacity: { mote: 90, shaftMote: 48, firefly: 40, spore: 40, ember: 48 },
  /** Extra margin (px) around the view where particles live before they wrap. */
  marginPx: 24,
  /** Particles fade in and out at this rate (alpha per second). */
  fadeRate: 1.2,
  /** Count multiplier when the Low quality tier disables glow. */
  lowQualityFactor: 0.5,
  /** Share of the `night` factor that `dusk` rules keep in the dark. */
  duskNightCarry: 0.3,
  /** Wind (-1..1) to horizontal speed (px/s). */
  windSpeed: 14,
  /** Longest time step the particle motion integrates (s). */
  maxStepSeconds: 0.05,
  /** Fireflies tick over to `dusk` rules this much faster than the dusk factor alone (clamped to 1). */
  duskBoost: 1.5,
  /** Slots whose computed alpha falls below this are hidden. */
  minAlpha: 0.01,
  /** Seed for the per-slot phase and variation numbers (deterministic placement). */
  seed: 0x61c88647,
  /**
   * Per kind below, `speed`/`rise`/`sway` are px/s; the `*Rate` and `*Speed` entries are radians per
   * second of the sine they drive; `*Phase` multiplies the slot's random phase so slots differ; a
   * `*Base` + `*Depth` pair is `base + depth * sin(...)` (a 0..1 brightness breathing).
   */
  mote: {
    speed: 5,
    twinkleSpeed: 1.4,
    scale: 1,
    alpha: 0.9,
    /** Horizontal weave rate and the share of wind that pushes motes. */
    weaveRate: 0.3,
    windFactor: 0.5,
    /** Vertical bob: rate, phase spread, amplitude and the steady upward bias (fractions of speed). */
    bobRate: 0.23,
    bobPhase: 1.3,
    bobAmount: 0.6,
    riseBias: 0.15,
    twinkleBase: 0.45,
    twinkleDepth: 0.55,
    /** Size varies per slot by `scaleBase + scaleVar * random`. */
    scaleBase: 0.7,
    scaleVar: 0.6,
  },
  /** Motes inside light shafts (counts/speed/size/alpha are in SHAFTS.mote*). */
  shaftMote: {
    /** Sideways wobble across the beam: rate, phase spread and amplitude (-1..1 across the width). */
    swayRate: 0.5,
    swayPhase: 3,
    swayAmount: 0.8,
    twinkleSpeed: 1.8,
    twinkleBase: 0.6,
    twinkleDepth: 0.4,
    /** Motes reach full opacity once the beam's own opacity times this reaches 1. */
    beamAlphaGain: 3,
  },
  firefly: {
    tint: 0xd8f56a,
    speed: 9,
    wanderSpeed: 0.8,
    blinkSpeed: 1.6,
    scale: 1.5,
    alpha: 1,
    /** Tiles above the ground they hover within. */
    minHeightTiles: 0.5,
    maxHeightTiles: 6,
    windFactor: 0.3,
    /** Heading wander: phase spread per slot and how far (rad) the heading swings. */
    wanderPhase: 9,
    wanderTurn: 2.4,
    /** Vertical motion follows the heading at this rate and fraction of speed. */
    verticalRate: 1.3,
    verticalFactor: 0.5,
    blinkPhase: 2.1,
    /** Opacity (fraction of `alpha`) between blinks. */
    dimAlpha: 0.05,
    /** A ground this far below the view bottom still counts as on screen when perching (px). */
    perchMarginPx: 64,
  },
  spore: {
    tint: 0xa6f0ff,
    rise: 6,
    sway: 5,
    swaySpeed: 0.7,
    scale: 1.6,
    alpha: 0.95,
    windFactor: 0.4,
    /** Rise speed varies per slot by `riseBase + riseVar * random`. */
    riseBase: 0.6,
    riseVar: 0.8,
    twinkleRate: 1.1,
    twinklePhase: 1.7,
    twinkleBase: 0.5,
    twinkleDepth: 0.5,
    scaleBase: 0.75,
    scaleVar: 0.5,
  },
  ember: {
    tint: 0xffa040,
    rise: 22,
    sway: 8,
    flickerSpeed: 7,
    scale: 1.6,
    alpha: 1,
    riseBase: 0.6,
    riseVar: 0.8,
    swayRate: 1.3,
    /** Two flicker sines: depths, the second one's rate multiplier, and the phase spread. */
    flickerDepth: 0.25,
    flickerDepth2: 0.2,
    flickerRatio: 2.3,
    flickerPhase: 5,
    alphaBase: 0.55,
    scaleBase: 0.7,
    scaleVar: 0.5,
  },
} as const;

/** Decoration sway and bend (plan 2.2 layer 9; src/render/FoliageRenderer.ts). */
export const FOLIAGE = {
  /** Members per pooled layer; a chunk with more decorations than this drops the extras. */
  layerCapacity: 3072,
  sway: {
    /** Fraction of a plant's `decor.sway` it swings through in dead calm, and added at full wind. */
    idleFraction: 0.3,
    windFraction: 0.7,
    /** Steady lean at full wind, as a fraction of `decor.sway`. */
    leanFraction: 0.6,
    /** One swing takes this long, varied per plant by up to `periodJitter` (fraction). */
    periodMs: 2400,
    periodJitter: 0.45,
    /** Each plant's swing starts up to this many periods late. */
    delayPeriods: 2,
  },
  /** Members are re-patched when the wind moved this much, at most this often. */
  windPatchThreshold: 0.04,
  windPatchIntervalSeconds: 0.25,
  bend: {
    /** Plants within this horizontal distance of the player lean away. */
    radiusPx: 22,
    /** Radians of lean per radian of `decor.sway`, capped at `maxRadians`. */
    perSway: 2.2,
    maxRadians: 0.6,
    /** Exponential rates (1/s): leaning away, and springing back. */
    pushRate: 16,
    recoverRate: 5,
    /** Tile rows above the player's feet row that still brush against the body. */
    rowsAboveFeet: 2,
    /** Tile columns scanned each side of the player. */
    columns: 2,
    /** Most plants bent at once. */
    maxActive: 64,
    /** A recovering plant is released when its lean falls below this. */
    releaseRadians: 0.004,
  },
  /** Shy vines (decor.shy) curl up when the player is near. */
  shy: {
    /** Tile columns each side of the player, and rows above the feet, that startle a vine. */
    columns: 3,
    rowsAboveFeet: 5,
    /** Height a fully curled vine segment keeps (share of its sprite). */
    minScale: 0.2,
    /** Exponential rates (1/s): curling up (fast) and unfurling again (slow). */
    curlRate: 14,
    unfurlRate: 1.5,
    maxActive: 64,
    /** An unfurling vine is released when it is this close to full length. */
    release: 0.005,
  },
} as const;

/** Rain, drips, falling leaves and petals (plan 2.0, 2.4; src/render/WeatherParticles.ts). */
export const WEATHER_FX = {
  /** Pooled particle sprites per kind: the most alive at once at full density. */
  caps: { rain: 360, splash: 96, leaf: 40, petal: 40, drip: 24 },
  rain: {
    fallSpeed: 520,
    fallSpeedJitter: 0.18,
    /** Sideways speed at full wind (px/s). */
    windDrift: 190,
    /** Streak length multiplier on the 4 px raindrop frame. */
    streakScale: 2.6,
    alpha: 0.85,
    /** Spawn row is this far above the view; drops die this far outside it. */
    marginPx: 48,
    /** Fraction of drops that stop at leaf canopy tiles (the rest fall through the gaps). */
    canopyStopChance: 0.85,
    /** Rain below this intensity does not fall at all. */
    minIntensity: 0.05,
    /** New drops start up to this many px lower than the spawn row, so they do not fall in a line. */
    spawnJitterPx: 4,
  },
  splash: {
    /** Chance a drop that hits something makes a splash, and how many specks it throws. */
    chance: 0.35,
    count: 3,
    lifeSeconds: 0.28,
    speedX: 34,
    speedUp: 70,
    gravity: 420,
    scale: 0.45,
    /** Splashes spawn this far above the surface (px). */
    surfaceLiftPx: 1,
  },
  drip: {
    /** Drips per second at full rain with a canopy on screen, at full density. */
    perSecond: 7,
    gravity: 900,
    alpha: 0.7,
    /** Random cells tried to find a canopy underside per drip/leaf spawned. */
    probes: 14,
    /** Drips fall from `xMin .. xMin + xSpan` across the canopy tile. */
    xMin: 0.2,
    xSpan: 0.6,
  },
  /** Leaves and petals refill an empty screen over about this long. */
  fillSeconds: 4,
  /** Leaves and petals live `min .. min + spread` of their lifespan, and splashes launch at that fraction of full speed. */
  lifeScale: { min: 0.6, spread: 0.4 },
  /** The steady spawn rate keeps a screen full over this fraction of a leaf's life. */
  steadyLifeFraction: 0.5,
  /** Particles may stray this many margins past the sides (and, for drifters, the top) before dying. */
  farMarginFactor: 2,
  leaf: {
    fallSpeed: 26,
    fallSpeedJitter: 0.4,
    /** Sideways push at full wind (px/s) and the flutter on top of it. */
    windDrift: 70,
    flutterSpeed: 16,
    flutterHz: 0.9,
    spinPerSecond: 1.6,
    lifeSeconds: 16,
    fadeSeconds: 0.7,
    alpha: 0.95,
    /** Leaves die this far outside the view. */
    marginPx: 96,
    /** Leaves with no canopy on screen start up to this fraction of the margin above the view. */
    highSpawnFraction: 0.5,
  },
  petal: {
    fallSpeed: 20,
    fallSpeedJitter: 0.4,
    windDrift: 90,
    flutterSpeed: 26,
    flutterHz: 0.6,
    spinPerSecond: 0.9,
    lifeSeconds: 22,
    fadeSeconds: 0.9,
    alpha: 0.95,
    /** Petals blow in from this far above the view's top (px), across this fraction of its height. */
    spawnAbovePx: 8,
    spawnBandFraction: 0.6,
  },
} as const;

/** Time-of-day windows other effects key off (src/render/VisualState.ts). */
export const TIME_OF_DAY_FX = {
  /** Day fraction (0..1) at which `dusk` peaks, and the half-width of the dusk window. */
  duskCentre: 0.77,
  duskHalfWidth: 0.06,
} as const;

/** What each quality level switches (plan 2.10; src/settings.ts). */
export const QUALITY = {
  low: { parallaxLayers: 2, particleDensity: 0.35 },
  medium: { parallaxLayers: 3, particleDensity: 0.7 },
  high: { parallaxLayers: 4, particleDensity: 1 },
} as const;

/** Camera colour grade, underwater look, heat haze and vignette (plan 2.5, src/render/CameraGrade.ts). */
export const GRADE = {
  /** A matrix is only re-uploaded when some value moved by more than this (offsets are 0..255). */
  matrixEpsilon: 0.05,
  /** Filters switch off below this displacement amount (fraction of the view). */
  minDisplacement: 0.0002,
  /** Underwater: the grade blends towards this over `fadeSeconds`, with a gentle wobble. */
  underwater: {
    tint: 0x80ccd2,
    saturation: 0.9,
    contrast: 1.04,
    brightness: 0.94,
    fadeSeconds: 0.5,
    /** Displacement amount (x0.5 of the view width/height = max pixels) and wobble speed. */
    wobbleAmount: 0.006,
    wobbleHz: 0.35,
  },
  heatHaze: { amount: 0.0035, hz: 0.8 },
  /**
   * Soft displacement map, stretched over the whole view. `edgeMargin`: displacement fades to none
   * over this fraction of the view at its edges.
   */
  noise: { width: 96, height: 54, seed: 0x6a1d, edgeMargin: 0.06 },
  /** Edge darkening; stronger at night. See FilterVignette: only radius > 0.71 covers the corners. */
  /** The displacement's vertical push rotates this much slower than the horizontal one. */
  displacementYRate: 0.8,
  vignette: { radius: 0.8, strengthDay: 0.1, strengthNight: 0.16, color: 0x000000 },
} as const;

/** Still-water reflections, waterfalls and their spray (M5 D7). */
export const WATER_FX = {
  reflection: {
    /** Opacity of the flipped scene drawn into a pool. */
    alpha: 0.38,
    /** Most pools reflected at once (one image, one draw call each). */
    maxSpans: 3,
    /** Rows of scene above the surface that show up in the pool. */
    maxRows: 6,
    /** Sideways wobble (px) and its speed (cycles per second). */
    rippleAmplitudePx: 1,
    rippleHz: 0.7,
    /** Alpha breathes by this fraction around `alpha` at the ripple speed. */
    shimmer: 0.2,
    /** Ripple phase offset per pool slot (rad), and the shimmer's speed relative to the ripple and its phase. */
    slotPhaseStep: 1.7,
    shimmerRate: 0.6,
    shimmerPhase: 1,
  },
  waterfall: {
    /** Falling-water strips drawn at once. */
    maxVisible: 6,
    /** Texture scroll speed (px/s). */
    fallSpeed: 120,
    alpha: 0.78,
    /** Spray: pixels per second at density 1, launch speed and lifetime. */
    sprayPerSecond: 34,
    spraySpeedMin: 18,
    spraySpeedMax: 70,
    sprayGravity: 170,
    sprayLifespanMs: 520,
    /** Mist puffs at the landing: per second at density 1, size and lifetime. */
    mistPerSecond: 2.4,
    mistScale: 0.55,
    mistLifespanMs: 1500,
    mistAlpha: 0.2,
    /** Spray start opacity, and how far above the landing row (px) spray and mist spawn. */
    sprayAlpha: 0.9,
    sprayLiftPx: 1,
    mistLiftPx: 3,
    /** Mist puffs drift sideways up to +-mistSpeedX and rise at mistRiseMin..mistRiseMax (px/s), growing by mistGrowth. */
    mistSpeedX: 6,
    mistRiseMin: 8,
    mistRiseMax: 18,
    mistGrowth: 2,
    /** Capacity of each emitter. */
    maxParticles: 220,
  },
  worldgen: {
    /** One waterfall per this many world columns (at least one). */
    columnsPerFall: 900,
    /** Fall height in tiles. */
    minDrop: 6,
    maxDrop: 12,
    /** Columns of the landing basin carved next to the ledge. */
    basinWidth: 3,
    /** Waterfalls keep this many columns apart. */
    minSpacing: 200,
    /** Rows the ground may differ from the ledge across the cut. */
    maxSlope: 1,
    /** Clear sky rows needed above the ledge and basin. */
    skyClearance: 6,
    /** Random picks from the candidate list before giving up. */
    attempts: 60,
    /** Columns kept clear at both world edges. */
    edgeMargin: 16,
  },
} as const;

/** M11 town visuals: quest markers, scared folk, caravans, lost-thing glint, festival lanterns and fireworks. */
export const TOWN_VIEW = {
  /** Quest markers: bob (px, rad/s), font, colours, gap above the head, re-evaluation rate (per second). */
  markerBobPx: 1.5,
  markerBobRate: 4,
  markerFontPx: 10,
  markerGap: 3,
  markerGold: '#ffd24a',
  markerMint: '#7ff0d0',
  markerStroke: '#05080a',
  markerStrokePx: 3,
  markerChecksPerSecond: 5,
  /** The name tag rises this many px above the marker so the two never overlap. */
  tagLiftPx: 12,
  /** Scared folk shiver by +-shiverPx at shiverRate (rad/s). */
  shiverPx: 1,
  shiverRate: 60,
  /** Lift basket: tile-sized frame drawn under riding folk. */
  basketDropPx: 0,
  /** Caravans: walking frame rate, lantern offset ahead of the centre and above the feet and halo. */
  caravanFrameRate: 4,
  caravanLanternX: 24,
  caravanLanternY: 22,
  caravanHaloPx: 96,
  caravanHaloAlpha: 0.7,
  caravanHaloColor: 0xffc060,
  caravanFlicker: 0.12,
  caravanFlickerRate: 9,
  /** Lost-thing glint: sparkle period (s), sizes (px) and halo alpha. */
  glintPeriod: 1.6,
  glintPx: 12,
  glintHaloPx: 56,
  glintHaloAlpha: 0.55,
  glintColor: 0xfff0a0,
  /** Festivals only draw for towns within this many px of the view. */
  festivalMarginPx: 160,
  /** Sky lanterns: spawns per second per town, rise speed (px/s min..max), sway (px, rad/s), lifetime (s), cap. */
  lanternRate: 2.5,
  lanternRiseMin: 10,
  lanternRiseMax: 20,
  lanternSwayPx: 8,
  lanternSwayRate: 1.2,
  lanternLifeMin: 9,
  lanternLifeMax: 14,
  lanternMax: 24,
  lanternFadeSeconds: 2,
  lanternHaloPx: 40,
  lanternHaloAlpha: 0.6,
  lanternColor: 0xffb050,
  /** Fireworks: seconds between bursts (min..max), height above the ground under the burst (px, min..max), sparks per burst, speed, lifetime, gravity, cap. */
  fireworkIntervalMin: 1.5,
  fireworkIntervalMax: 4,
  fireworkHeightMin: 140,
  fireworkHeightMax: 300,
  fireworkSparks: 18,
  fireworkSpeedMin: 40,
  fireworkSpeedMax: 80,
  fireworkLife: 1.4,
  fireworkGravity: 40,
  sparkMax: 96,
  fireworkFlashPx: 140,
  fireworkFlashSeconds: 0.25,
  fireworkFlashAlpha: 0.8,
  sparkHaloPx: 14,
  sparkHaloAlpha: 0.5,
} as const;

/** The animated title backdrop (TitleScene): a night forest with drifting tree lines and fireflies. */
export const TITLE_SCENE = {
  groundRows: 3,
  /** Sky gradient, top to horizon. */
  skyTop: 0x050d14,
  skyHorizon: 0x1d4e52,
  /** Tints for the four parallax layers (0 = farthest) and their sideways drift, pixels/second. */
  layerTints: [0x3c6a78, 0x2a5260, 0x1c3d48, 0x112a33],
  layerAlpha: [0.55, 0.7, 0.85, 1],
  layerSpeeds: [1.5, 3.5, 7, 12],
  /** How far each layer's base sits below the ground top, pixels (hides the texture's bottom edge). */
  layerSink: [-6, 0, 4, 10],
  groundTint: 0x4f666c,
  /** Stars: count, twinkle speed and alpha range. */
  stars: { count: 36, maxHeightFraction: 0.5, twinkleSpeed: 1.6, alphaMin: 0.15, alphaMax: 0.8 },
  moon: { x: 0.78, y: 0.2, haloScale: 5, haloAlpha: 0.25 },
  fireflies: {
    count: 26,
    color: 0xe8e08a,
    /** Wander radius (pixels), wander speed, pulse speed. */
    drift: 22,
    speed: 0.35,
    pulseSpeed: 1.8,
    haloScale: 0.7,
    haloAlpha: 0.6,
    /** Vertical band the fireflies live in, as fractions of the view height from the top. */
    bandTop: 0.3,
    bandBottom: 0.9,
  },
  /** Big soft teal glows on the forest floor. */
  groundGlows: { count: 4, color: 0x2fb2b8, scale: 9, alpha: 0.16, pulseSpeed: 0.5 },
  /** Max frame step, so a tab switch does not teleport the drift. */
  maxStepSeconds: 0.1,
  seed: 0x7171,
} as const;

/** The loading bar BootScene shows while assets load. */
export const LOADING_VIEW = {
  barWidth: 160,
  barHeight: 6,
  border: 1,
  /** Gap between the game name and the bar, and the name's text size in pixels. */
  gap: 10,
  textPx: 16,
} as const;
