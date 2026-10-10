/**
 * Enemies (plan section 4 "Enemies", M8). Behaviour comes from the AI type
 * (src/sim/systems/EnemyAI.ts); everything tunable per creature is here. Places are surface biome
 * keys or depth layer keys (src/data/biomes.ts); 'any' matches everywhere.
 */
import type { RampName } from './palette';

/** `boss`: no AI of its own — its boss script (src/sim/systems/bosses/) moves it (M12). */
export type EnemyAi = 'walker' | 'hopper' | 'flyer' | 'burrower' | 'shade' | 'boss';

export interface EnemyDrop {
  readonly item: string;
  readonly chance: number;
  readonly min: number;
  readonly max: number;
}

export interface EnemySpawn {
  readonly places: readonly string[];
  readonly time: 'any' | 'day' | 'night';
  /** Only where the light is at most SPAWN.darkLight (shades). */
  readonly dark?: true;
  /** Relative chance against the other creatures that can spawn at a spot. */
  readonly weight: number;
}

export interface EnemyDef {
  readonly key: string;
  readonly name: string;
  readonly ai: EnemyAi;
  readonly maxHealth: number;
  /** Damage dealt by touching the player. */
  readonly contactDamage: number;
  /** Body size in pixels. */
  readonly width: number;
  readonly height: number;
  /** Top speed in pixels per second. */
  readonly speed: number;
  /** Jump (walkers, hoppers) or lunge (burrowers) speed, pixels per second. */
  readonly jump?: number;
  /** Notices the player within this many tiles. */
  readonly aggroRange: number;
  /** Multiplies the knockback it takes (0 = immovable). */
  readonly knockbackTaken: number;
  /** First of its two frames in the `enemies` sprite sheet (bosses: in the `bosses` sheet). */
  readonly frame: number;
  /** Colour ramp for its hit and death particles. */
  readonly ramp: RampName;
  readonly drops: readonly EnemyDrop[];
  readonly spawn: EnemySpawn;
  /** Takes this much damage per second in full light (shades), scaled by the light level. */
  readonly lightDamage?: number;
  /** Turns away from bright light (bats scatter, shades shrink back). */
  readonly fleesLight?: true;
  /** A boss's body or a boss's creature: never despawns by distance (the fight ends it). */
  readonly bound?: true;
}

/** Boss-summoned creatures only (no natural spawns). */
const NOWHERE: EnemySpawn = { places: [], time: 'any', weight: 0 };

const SURFACE = ['elderglade', 'moonpetal_vale', 'weeping_mire'] as const;

export const ENEMIES: readonly EnemyDef[] = [
  {
    key: 'moss_slime',
    name: 'Moss Slime',
    ai: 'hopper',
    maxHealth: 18,
    contactDamage: 8,
    width: 14,
    height: 10,
    speed: 70,
    jump: 300,
    aggroRange: 14,
    knockbackTaken: 1.2,
    frame: 0,
    ramp: 'moss',
    drops: [{ item: 'moss', chance: 0.8, min: 1, max: 3 }],
    spawn: { places: SURFACE, time: 'any', weight: 3 },
  },
  {
    key: 'bramble_sprite',
    name: 'Bramble Sprite',
    ai: 'walker',
    maxHealth: 24,
    contactDamage: 10,
    width: 12,
    height: 18,
    speed: 60,
    jump: 340,
    aggroRange: 16,
    knockbackTaken: 1,
    frame: 2,
    ramp: 'leaf',
    drops: [{ item: 'living_wood', chance: 0.6, min: 1, max: 2 }],
    spawn: { places: ['elderglade', 'moonpetal_vale'], time: 'any', weight: 2 },
  },
  {
    key: 'dusk_bat',
    name: 'Dusk Bat',
    ai: 'flyer',
    maxHealth: 12,
    contactDamage: 7,
    width: 14,
    height: 10,
    speed: 120,
    aggroRange: 18,
    knockbackTaken: 1.4,
    frame: 4,
    ramp: 'tealShadow',
    drops: [],
    spawn: { places: [...SURFACE, 'glowcap_grottos', 'rootdeep'], time: 'night', weight: 2 },
    fleesLight: true,
  },
  {
    key: 'spore_crawler',
    name: 'Spore Crawler',
    ai: 'walker',
    maxHealth: 28,
    contactDamage: 11,
    width: 16,
    height: 10,
    speed: 50,
    jump: 260,
    aggroRange: 14,
    knockbackTaken: 0.8,
    frame: 6,
    ramp: 'rose',
    drops: [{ item: 'glowcap_flesh', chance: 0.7, min: 1, max: 3 }],
    spawn: { places: ['glowcap_grottos'], time: 'any', weight: 3 },
  },
  {
    key: 'root_wyrm',
    name: 'Root Wyrm',
    ai: 'burrower',
    maxHealth: 44,
    contactDamage: 15,
    width: 14,
    height: 14,
    speed: 80,
    jump: 420,
    aggroRange: 20,
    knockbackTaken: 0.4,
    frame: 8,
    ramp: 'bark',
    drops: [{ item: 'rootwood', chance: 0.8, min: 2, max: 4 }],
    spawn: { places: ['rootdeep'], time: 'any', weight: 2 },
  },
  {
    key: 'crystal_mite',
    name: 'Crystal Mite',
    ai: 'walker',
    maxHealth: 32,
    contactDamage: 14,
    width: 12,
    height: 8,
    speed: 110,
    jump: 300,
    aggroRange: 16,
    knockbackTaken: 1,
    frame: 10,
    ramp: 'cyan',
    drops: [{ item: 'moonstone_crystal', chance: 0.5, min: 1, max: 2 }],
    spawn: { places: ['moonstone_hollows'], time: 'any', weight: 3 },
  },
  {
    key: 'ember_imp',
    name: 'Ember Imp',
    ai: 'flyer',
    maxHealth: 38,
    contactDamage: 18,
    width: 12,
    height: 16,
    speed: 100,
    aggroRange: 20,
    knockbackTaken: 0.9,
    frame: 12,
    ramp: 'ember',
    drops: [{ item: 'emberite_ore', chance: 0.25, min: 1, max: 1 }],
    spawn: { places: ['ember_roots'], time: 'any', weight: 3 },
  },
  {
    key: 'gloam_hound',
    name: 'Gloam Hound',
    ai: 'walker',
    maxHealth: 60,
    contactDamage: 22,
    width: 20,
    height: 14,
    speed: 150,
    jump: 380,
    aggroRange: 24,
    knockbackTaken: 0.6,
    frame: 14,
    ramp: 'gloam',
    drops: [{ item: 'lumen_crystal', chance: 0.3, min: 1, max: 1 }],
    spawn: { places: ['gloam_heart'], time: 'any', weight: 3 },
  },
  {
    // Shades only exist in darkness (plan 1.4): they spawn where the light is low, burn in light
    // and dissolve into wisps. More of them where the Gloam is thick (SPAWN.gloamShadeBoost).
    key: 'shade',
    name: 'Shade',
    ai: 'shade',
    maxHealth: 30,
    contactDamage: 12,
    width: 14,
    height: 22,
    speed: 70,
    // Shades hunt: they sense the player from beyond the view they spawn outside of.
    aggroRange: 40,
    knockbackTaken: 1.2,
    frame: 16,
    ramp: 'gloam',
    drops: [{ item: 'lumen_crystal', chance: 0.35, min: 1, max: 1 }],
    spawn: { places: ['any'], time: 'any', dark: true, weight: 4 },
    lightDamage: 40,
    fleesLight: true,
  },
  // M12 — creatures of the boss fights, and the Mire's own lurkers.
  {
    key: 'lumen_moth',
    name: 'Lumen Moth',
    ai: 'flyer',
    maxHealth: 10,
    contactDamage: 8,
    width: 12,
    height: 10,
    speed: 105,
    aggroRange: 30,
    knockbackTaken: 1.5,
    frame: 18,
    ramp: 'rose',
    drops: [{ item: 'lumen_petal', chance: 0.3, min: 1, max: 1 }],
    spawn: NOWHERE,
    bound: true,
  },
  {
    key: 'mire_lurker',
    name: 'Mire Lurker',
    ai: 'hopper',
    maxHealth: 34,
    contactDamage: 13,
    width: 16,
    height: 12,
    speed: 80,
    jump: 320,
    aggroRange: 16,
    knockbackTaken: 0.9,
    frame: 20,
    ramp: 'mud',
    drops: [{ item: 'mud', chance: 0.8, min: 2, max: 4 }],
    spawn: { places: ['weeping_mire'], time: 'night', weight: 2 },
  },
  {
    // The Gloam Heart's reaching roots: they crawl to a lit root-lamp and choke it.
    key: 'gloam_tendril',
    name: 'Gloam Tendril',
    ai: 'boss',
    maxHealth: 24,
    contactDamage: 10,
    width: 12,
    height: 12,
    speed: 46,
    aggroRange: 0,
    knockbackTaken: 0,
    frame: 22,
    ramp: 'gloam',
    drops: [],
    spawn: NOWHERE,
    lightDamage: 6,
    bound: true,
  },
  {
    key: 'moth_matriarch',
    name: 'The Moth Matriarch',
    ai: 'boss',
    maxHealth: 700,
    contactDamage: 22,
    width: 44,
    height: 30,
    speed: 0,
    aggroRange: 0,
    knockbackTaken: 0,
    frame: 0,
    ramp: 'rose',
    drops: [
      { item: 'glimmer', chance: 1, min: 120, max: 160 },
      { item: 'lumen_crystal', chance: 1, min: 8, max: 12 },
    ],
    spawn: NOWHERE,
    bound: true,
  },
  {
    key: 'mire_sovereign',
    name: 'The Mire Sovereign',
    ai: 'boss',
    maxHealth: 900,
    contactDamage: 26,
    width: 44,
    height: 40,
    speed: 0,
    aggroRange: 0,
    knockbackTaken: 0,
    frame: 2,
    ramp: 'mud',
    drops: [
      { item: 'glimmer', chance: 1, min: 160, max: 220 },
      { item: 'peat', chance: 1, min: 20, max: 30 },
    ],
    spawn: NOWHERE,
    bound: true,
  },
  {
    key: 'hollow_warden',
    name: 'The Hollow Warden',
    ai: 'boss',
    maxHealth: 1100,
    contactDamage: 28,
    width: 34,
    height: 48,
    speed: 0,
    aggroRange: 0,
    knockbackTaken: 0,
    frame: 4,
    ramp: 'moonSilver',
    drops: [
      { item: 'glimmer', chance: 1, min: 200, max: 260 },
      { item: 'moonsilver_bar', chance: 1, min: 6, max: 10 },
      { item: 'moonstone_crystal', chance: 1, min: 10, max: 16 },
    ],
    spawn: NOWHERE,
    bound: true,
  },
  {
    key: 'gloam_heart',
    name: 'The Gloam Heart',
    ai: 'boss',
    maxHealth: 1500,
    contactDamage: 34,
    width: 60,
    height: 60,
    speed: 0,
    aggroRange: 0,
    knockbackTaken: 0,
    frame: 6,
    ramp: 'gloam',
    drops: [{ item: 'glimmer', chance: 1, min: 400, max: 500 }],
    spawn: NOWHERE,
    bound: true,
  },
];

export function enemyIndex(key: string): number {
  const i = ENEMIES.findIndex((e) => e.key === key);
  if (i < 0) throw new Error(`Unknown enemy "${key}"`);
  return i;
}

export function enemyByKey(key: string): EnemyDef {
  const def = ENEMIES.find((e) => e.key === key);
  if (!def) throw new Error(`Unknown enemy "${key}"`);
  return def;
}
