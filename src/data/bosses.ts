/**
 * The four bosses (plan 1.4 "Bosses built around light", M12). Each fights in its own arena (a
 * Tiled prefab in src/data/prefabs/, placed by world generation) and is moved by its script in
 * src/sim/systems/bosses/. Everything tunable about a fight is here; the scripts hold behaviour.
 *
 * Beating a boss sets the story flag `boss:<key>`. Wards (src/data/tiles.ts `sealedUntil`),
 * festivals (src/data/festivals.ts), villagers (src/data/npcs.ts) and dialogue read that flag.
 *
 * Arena prefab objects: an `arena` rectangle (leaving it ends the fight), a `trigger` rectangle
 * (stepping in starts it), a `boss` point (where it appears), `door` rectangles (sealed with roots
 * during the fight), a `gate` point (where the way in arrives) and, for the Mire, a `pool`
 * rectangle (the water the Sovereign floods).
 */

/** Where world generation puts an arena. */
export type ArenaPlacement =
  /** In a depth layer: `depth` 0..1 down through the layer, `offset` columns from the spawn. */
  | {
      readonly kind: 'underground';
      readonly layer: string;
      readonly depth: number;
      readonly minOffset: number;
      readonly maxOffset: number;
      /** Which side of the spawn: the towns' surface side, the other side, or centred. */
      readonly side: 'towns' | 'away' | 'centre';
    }
  /** On the surface, in the middle of a surface biome. */
  | { readonly kind: 'surface'; readonly biome: string };

export interface PhaseDef {
  /** The phase begins once health falls to this share (the first phase starts at 1). */
  readonly at: number;
}

interface BossBase {
  readonly key: string;
  /** The body in src/data/enemies.ts. */
  readonly enemy: string;
  readonly name: string;
  /** The title card's second line. */
  readonly epithet: string;
  readonly arena: string;
  readonly placement: ArenaPlacement;
  readonly phases: readonly PhaseDef[];
  /** Said by the journal while it lives (how to find it). */
  readonly hint: string;
  /** Shown when it falls (what changed). */
  readonly reward: string;
}

export interface MothDef extends BossBase {
  readonly script: 'moth';
  /** Tile she is drawn to before anything (lures), and the light that stuns her when she hits it. */
  readonly lureTile: string;
  /** Pixels per second while circling, per phase. */
  readonly speed: readonly number[];
  /** Dive speed multiplier; circle radius (tiles); seconds circling before a dive, per phase. */
  readonly diveSpeed: number;
  readonly diveSeconds: number;
  readonly circleRadius: number;
  readonly circleSeconds: readonly number[];
  /** Seconds climbing back up after a dive. */
  readonly recoverSeconds: number;
  /** Seconds stunned after diving into a lure, and the damage multiplier while stunned. */
  readonly stunSeconds: number;
  readonly stunnedDamage: number;
  /** With the lantern out she can't see you farther away than this (tiles)... */
  readonly blindRange: number;
  /** ...unless you struck her in the last this-many seconds. */
  readonly hitMemory: number;
  /** Dust: seconds between falling dust motes (0 = none), per phase; their damage and speed. */
  readonly dustEvery: readonly number[];
  readonly dustDamage: number;
  readonly dustFall: number;
  /** Moths she calls (phase ≥ 2): how many per call, seconds between calls, most at once. */
  readonly minion: string;
  readonly minionsPerCall: number;
  readonly minionEvery: number;
  readonly minionCap: number;
  /** The first phase in which she calls moths. */
  readonly minionPhase: number;
}

export interface MireDef extends BossBase {
  readonly script: 'mire';
  readonly lever: string;
  readonly leverOpen: string;
  readonly brazier: string;
  readonly brazierOut: string;
  /** Water depth (rows above the pool's floor) at the start, and the most it can reach. */
  readonly startLevel: number;
  readonly maxLevel: number;
  /** Seconds between floods, per phase; rows each flood adds; seconds a flood takes. */
  readonly floodEvery: readonly number[];
  readonly floodRows: number;
  readonly floodSeconds: number;
  /** A lever lowers the water this many rows and then rests this long. */
  readonly drainRows: number;
  readonly leverRest: number;
  /** Seconds risen, seconds under; water bolts per rising, per phase; bolt damage and speed. */
  readonly riseSeconds: number;
  readonly sinkSeconds: number;
  readonly bolts: readonly number[];
  readonly boltDamage: number;
  readonly boltSpeed: number;
  readonly boltGravity: number;
  /**
   * It takes full damage while a burning brazier is within this many tiles of it or the lantern's
   * cone is on it; otherwise `murkDamage`.
   */
  readonly brazierReach: number;
  readonly murkDamage: number;
  /** Swimming speed under water (px/s), and the shortest and longest flight of a bolt (s). */
  readonly swimSpeed: number;
  readonly boltMinTime: number;
  readonly boltMaxTime: number;
  /** Phase ≥ waveP: a wave rolls along the water each time it rises (damage, speed px/s). */
  readonly wavePhase: number;
  readonly waveDamage: number;
  readonly waveSpeed: number;
  readonly minion: string;
  readonly minionEvery: number;
  readonly minionCap: number;
  readonly minionPhase: number;
}

export interface WardenDef extends BossBase {
  readonly script: 'warden';
  /** Walking speed per phase (px/s); hovering from this phase on. */
  readonly speed: readonly number[];
  readonly hoverPhase: number;
  /** Damage taken while its moonstone shell is whole, and while it is cracked by reflected light. */
  readonly shellDamage: number;
  readonly crackedDamage: number;
  /** Seconds the shell stays cracked after the reflected beam last touched it. */
  readonly crackSeconds: number;
  /** Damage per second of the reflected beam itself. */
  readonly beamDps: number;
  /** The beam reaches the lens range × this, plus this many tiles per bounce; at most `bounces`. */
  readonly beamRangeScale: number;
  readonly bounceRange: number;
  readonly bounces: number;
  /** Slam: when within `slamRange` tiles, every `slamEvery` s, a shockwave each way along the floor. */
  readonly slamRange: number;
  readonly slamEvery: number;
  readonly slamDamage: number;
  readonly slamSpeed: number;
  /** Shards (hovering): a fan of `shards` every `shardEvery` s. */
  readonly shards: number;
  readonly shardEvery: number;
  readonly shardDamage: number;
  readonly shardSpeed: number;
  readonly shardSpread: number;
  readonly minion: string;
  readonly minionEvery: number;
  readonly minionCap: number;
  readonly minionPhase: number;
}

export interface HeartDef extends BossBase {
  readonly script: 'heart';
  readonly node: string;
  readonly nodeLit: string;
  readonly heartlight: string;
  /** Lighting a root-lamp costs this. */
  readonly nodeCost: { readonly item: string; readonly count: number };
  /** Damage taken = this × (lamps lit / lamps), never more than 1. */
  readonly exposure: number;
  /** Seconds between tendrils sent at a lit lamp, per phase. */
  readonly tendrilEvery: readonly number[];
  readonly tendril: string;
  readonly tendrilCap: number;
  /** A tendril within this many tiles of its lamp chokes it. */
  readonly chokeTiles: number;
  /** Rings of Gloam orbs: orbs per ring, seconds between rings per phase, damage and speed. */
  readonly orbs: number;
  readonly orbEvery: readonly number[];
  readonly orbDamage: number;
  readonly orbSpeed: number;
  /** On each new phase the Heart surges and chokes this many lit lamps at once. */
  readonly surgeChokes: number;
  readonly minion: string;
  readonly minionEvery: number;
  readonly minionCap: number;
  readonly minionPhase: number;
}

export type BossDef = MothDef | MireDef | WardenDef | HeartDef;

export const BOSSES: readonly BossDef[] = [
  {
    key: 'moth_matriarch',
    script: 'moth',
    enemy: 'moth_matriarch',
    name: 'The Moth Matriarch',
    epithet: 'Mother of the Glowcap Dark',
    arena: 'moth_arena',
    placement: {
      kind: 'underground',
      layer: 'glowcap_grottos',
      depth: 0.55,
      minOffset: 110,
      maxOffset: 190,
      side: 'towns',
    },
    phases: [{ at: 1 }, { at: 0.6 }, { at: 0.3 }],
    hint: 'She nests in a great hollow of the Glowcap Grottos. She hunts by light: put your lantern out to hide, and set lures to trap her.',
    reward: 'The ward over the Moonstone Hollows has broken.',
    lureTile: 'moth_lure',
    speed: [120, 145, 175],
    diveSpeed: 2.3,
    diveSeconds: 1.3,
    circleRadius: 6,
    circleSeconds: [3, 2.4, 1.8],
    recoverSeconds: 0.7,
    stunSeconds: 3.5,
    stunnedDamage: 2,
    blindRange: 4,
    hitMemory: 4,
    dustEvery: [0, 1.2, 0.6],
    dustDamage: 9,
    dustFall: 70,
    minion: 'lumen_moth',
    minionsPerCall: 3,
    minionEvery: 10,
    minionCap: 6,
    minionPhase: 1,
  },
  {
    key: 'mire_sovereign',
    script: 'mire',
    enemy: 'mire_sovereign',
    name: 'The Mire Sovereign',
    epithet: 'Lord of the Drowned Light',
    arena: 'mire_arena',
    placement: { kind: 'surface', biome: 'weeping_mire' },
    phases: [{ at: 1 }, { at: 0.5 }, { at: 0.25 }],
    hint: 'It sleeps under a black pool in the Weeping Mire. It hides in dark water: keep the braziers above the flood (pull the sluice levers) and light it up.',
    reward: 'Hulda the ferrywoman will move into your village.',
    lever: 'sluice_lever',
    leverOpen: 'sluice_lever_open',
    brazier: 'mire_brazier',
    brazierOut: 'mire_brazier_out',
    startLevel: 3,
    maxLevel: 16,
    floodEvery: [16, 11, 7],
    floodRows: 2,
    floodSeconds: 3,
    drainRows: 4,
    leverRest: 9,
    riseSeconds: 5,
    sinkSeconds: 3,
    bolts: [3, 4, 5],
    boltDamage: 14,
    boltSpeed: 260,
    boltGravity: 420,
    brazierReach: 7,
    murkDamage: 0.2,
    swimSpeed: 90,
    boltMinTime: 0.5,
    boltMaxTime: 1.5,
    wavePhase: 1,
    waveDamage: 16,
    waveSpeed: 150,
    minion: 'mire_lurker',
    minionEvery: 14,
    minionCap: 3,
    minionPhase: 1,
  },
  {
    key: 'hollow_warden',
    script: 'warden',
    enemy: 'hollow_warden',
    name: 'The Hollow Warden',
    epithet: 'Keeper of the Cold Light',
    arena: 'warden_arena',
    placement: {
      kind: 'underground',
      layer: 'moonstone_hollows',
      depth: 0.45,
      minOffset: 150,
      maxOffset: 280,
      side: 'away',
    },
    phases: [{ at: 1 }, { at: 0.6 }, { at: 0.3 }],
    hint: 'It guards a crystal hall below the broken ward, in the Moonstone Hollows. Its shell turns blades: shine your lantern into the prisms (right-click to turn them) and bounce the light back at it.',
    reward: 'The deep ward over the Gloam Heart has broken.',
    speed: [38, 52, 70],
    hoverPhase: 1,
    shellDamage: 0.15,
    crackedDamage: 1.6,
    crackSeconds: 3,
    beamDps: 30,
    beamRangeScale: 1.5,
    bounceRange: 20,
    bounces: 4,
    slamRange: 6,
    slamEvery: 3.5,
    slamDamage: 18,
    slamSpeed: 180,
    shards: 5,
    shardEvery: 2.6,
    shardDamage: 15,
    shardSpeed: 230,
    shardSpread: 0.5,
    minion: 'crystal_mite',
    minionEvery: 12,
    minionCap: 3,
    minionPhase: 2,
  },
  {
    key: 'gloam_heart',
    script: 'heart',
    enemy: 'gloam_heart',
    name: 'The Gloam Heart',
    epithet: 'The Dark at the Root of the World',
    arena: 'heart_arena',
    placement: {
      kind: 'underground',
      layer: 'gloam_heart',
      depth: 0.4,
      minOffset: 0,
      maxOffset: 0,
      side: 'centre',
    },
    phases: [{ at: 1 }, { at: 0.66 }, { at: 0.33 }],
    hint: 'It is wrapped round the World Tree’s deepest root, straight down beneath the spawn. Relight the root-lamps around it (a Lumen crystal each) and keep its tendrils off them.',
    reward: 'The Heartlight burns again. The Gloam can spread no more.',
    node: 'heart_node',
    nodeLit: 'heart_node_lit',
    heartlight: 'heartlight',
    nodeCost: { item: 'lumen_crystal', count: 1 },
    exposure: 1.2,
    tendrilEvery: [9, 6.5, 4.5],
    tendril: 'gloam_tendril',
    tendrilCap: 4,
    chokeTiles: 1.2,
    orbs: 10,
    orbEvery: [6, 4.5, 3.2],
    orbDamage: 15,
    orbSpeed: 120,
    surgeChokes: 2,
    minion: 'shade',
    minionEvery: 11,
    minionCap: 4,
    minionPhase: 1,
  },
];

export function bossByKey(key: string): BossDef | undefined {
  return BOSSES.find((b) => b.key === key);
}

/** The flag a boss sets when it falls. */
export const bossFlag = (key: string): string => `boss:${key}`;
