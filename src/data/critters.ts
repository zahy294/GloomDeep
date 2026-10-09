/**
 * Critters (plan 1.5, section 4 "Critters"): harmless life that reacts to you and to light.
 * Behaviour comes from `move` (src/sim/systems/CritterSystem.ts); places are surface biome or
 * depth layer keys (src/data/biomes.ts).
 */
import type { RampName } from './palette';

/**
 * flutter: drifts in the air (fireflies, moths). walk: wanders on the ground (deer).
 * hop: hops (frogs). swim: stays in water (glowfish). perch: sits still until startled, then
 * flies off (bats on cave ceilings, owls on branches).
 */
export type CritterMove = 'flutter' | 'walk' | 'hop' | 'swim' | 'perch';

/** Where a perching critter sits: under a ceiling (bats) or on a branch (owls). */
export type Perch = 'ceiling' | 'branch';

export interface CritterDef {
  readonly key: string;
  readonly name: string;
  readonly move: CritterMove;
  readonly perch?: Perch;
  readonly places: readonly string[];
  readonly time: 'any' | 'day' | 'night';
  /** Body size, pixels. */
  readonly width: number;
  readonly height: number;
  /** Wandering speed and fleeing speed, pixels per second. */
  readonly speed: number;
  readonly fleeSpeed: number;
  /** Runs (or flies) from the player within this many tiles. */
  readonly fleeRange: number;
  /** Also startled by light at least this bright (bats when you shine your lantern at them). */
  readonly startledByLight?: number;
  /** Seeks out bright light and circles it (moths). */
  readonly drawnToLight?: true;
  /** Glows (drawn as a halo; colour 0xRRGGBB). */
  readonly glow?: number;
  /** A glass jar catches it (right-click): the jar becomes this item. */
  readonly caughtAs?: string;
  /** First of its two frames in the `critters` sprite sheet, and its placeholder colours. */
  readonly frame: number;
  readonly ramp: RampName;
  /** Spawns in groups of min..max, with this weight against the others that fit a spot. */
  readonly group: readonly [number, number];
  readonly weight: number;
}

const SURFACE = ['elderglade', 'moonpetal_vale', 'weeping_mire'] as const;
const CAVES = ['glowcap_grottos', 'rootdeep', 'moonstone_hollows', 'ember_roots'] as const;

export const CRITTERS: readonly CritterDef[] = [
  {
    key: 'firefly',
    name: 'Firefly',
    move: 'flutter',
    places: SURFACE,
    time: 'night',
    width: 4,
    height: 4,
    speed: 14,
    fleeSpeed: 40,
    fleeRange: 2,
    glow: 0xc8f078,
    caughtAs: 'firefly_jar',
    frame: 0,
    ramp: 'leaf',
    group: [3, 6],
    weight: 6,
  },
  {
    key: 'moth',
    name: 'Moth',
    move: 'flutter',
    places: [...SURFACE, ...CAVES],
    time: 'night',
    width: 6,
    height: 5,
    speed: 32,
    fleeSpeed: 70,
    fleeRange: 2,
    drawnToLight: true,
    frame: 2,
    ramp: 'moonSilver',
    group: [1, 3],
    weight: 3,
  },
  {
    key: 'cave_bat',
    name: 'Bat',
    move: 'perch',
    perch: 'ceiling',
    places: CAVES,
    time: 'any',
    width: 8,
    height: 6,
    speed: 0,
    fleeSpeed: 130,
    fleeRange: 5,
    startledByLight: 120,
    frame: 4,
    ramp: 'tealShadow',
    group: [2, 5],
    weight: 5,
  },
  {
    key: 'deer',
    name: 'Forest Deer',
    move: 'walk',
    places: ['elderglade', 'moonpetal_vale'],
    time: 'day',
    width: 18,
    height: 16,
    speed: 22,
    fleeSpeed: 170,
    fleeRange: 9,
    frame: 6,
    ramp: 'honey',
    group: [1, 2],
    weight: 2,
  },
  {
    key: 'owl',
    name: 'Owl',
    move: 'perch',
    perch: 'branch',
    places: SURFACE,
    time: 'night',
    width: 8,
    height: 10,
    speed: 0,
    fleeSpeed: 90,
    fleeRange: 6,
    frame: 8,
    ramp: 'bark',
    group: [1, 1],
    weight: 2,
  },
  {
    key: 'frog',
    name: 'Mire Frog',
    move: 'hop',
    places: ['weeping_mire', 'glowcap_grottos'],
    time: 'any',
    width: 6,
    height: 5,
    speed: 60,
    fleeSpeed: 120,
    fleeRange: 4,
    frame: 10,
    ramp: 'moss',
    group: [1, 3],
    weight: 3,
  },
  {
    key: 'glowfish',
    name: 'Glowfish',
    move: 'swim',
    places: [...SURFACE, ...CAVES],
    time: 'any',
    width: 7,
    height: 4,
    speed: 26,
    fleeSpeed: 90,
    fleeRange: 5,
    glow: 0x76e6e0,
    frame: 12,
    ramp: 'cyan',
    group: [2, 4],
    weight: 4,
  },
];
