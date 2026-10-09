/**
 * How each place looks and sounds (plan 2.0, 2.4, 2.5, 3.6): one entry per surface biome and per
 * depth layer, keyed like src/data/biomes.ts. Renderers blend neighbouring entries by where the
 * camera is (src/render/biomeBlend.ts), so crossing a border fades from one look to the next.
 * Colours are 0xRRGGBB.
 */

export type ParticleKind = 'leaf' | 'petal' | 'spore' | 'ember' | 'firefly';

export interface ParticleRule {
  readonly kind: ParticleKind;
  /** Particles alive on screen at full strength. */
  readonly count: number;
  /** When it shows: dusk = around sunset, night = dark hours. */
  readonly when: 'always' | 'day' | 'dusk' | 'night';
}

export interface BiomeVisual {
  /** Surface biome or depth layer key. */
  readonly key: string;
  /** Camera colour grade (plan 2.5). 1 = unchanged. */
  readonly grade: {
    readonly tint: number;
    readonly saturation: number;
    readonly contrast: number;
    readonly brightness: number;
  };
  /** Mist layers (plan 2.0): colour, opacity at full strength, and how much dawn thickens it. */
  readonly mist: { readonly color: number; readonly alpha: number; readonly dawnBoost: number };
  /** Floating motes: colour and how many on screen. */
  readonly motes: { readonly color: number; readonly count: number };
  readonly particles: readonly ParticleRule[];
  /**
   * Parallax tree lines (surface only, plan 2.2 layer 3), back to front: base colour, how much of
   * the sky's horizon colour is mixed in (atmospheric perspective), and horizontal scroll factor.
   */
  readonly parallax: {
    readonly colors: readonly number[];
    readonly haze: readonly number[];
    readonly scroll: readonly number[];
  } | null;
  /** Dark leaf silhouettes passing in front of the camera (plan 2.2 layer 16). */
  readonly foregroundCanopy: boolean;
  /** Screen distortion (plan 2.5): heat haze in the Ember Roots. */
  readonly distortion: 'heatHaze' | null;
  /** Ambient sound layers 0..1 (plan 3.6). */
  readonly ambience: {
    readonly wind: number;
    readonly birds: number;
    readonly crickets: number;
    readonly drips: number;
    readonly chimes: number;
    readonly rumble: number;
  };
  /** Procedural music until real tracks exist: scale degrees, root note (MIDI), tempo, timbre. */
  readonly music: {
    readonly root: number;
    readonly scale: readonly number[];
    readonly bpm: number;
    readonly timbre: 'warm' | 'glass' | 'hollow' | 'low';
  };
}

const PENTATONIC_MAJOR = [0, 2, 4, 7, 9];
const PENTATONIC_MINOR = [0, 3, 5, 7, 10];
const DORIAN = [0, 2, 3, 5, 7, 9, 10];
const LYDIAN = [0, 2, 4, 6, 7, 9, 11];
const PHRYGIAN = [0, 1, 3, 5, 7, 8, 10];

export const BIOME_VISUALS: readonly BiomeVisual[] = [
  {
    key: 'elderglade',
    grade: { tint: 0xfff2d6, saturation: 1.12, contrast: 1.05, brightness: 1.02 },
    mist: { color: 0xf2e6c8, alpha: 0.16, dawnBoost: 0.3 },
    motes: { color: 0xffd88a, count: 40 },
    particles: [
      { kind: 'leaf', count: 14, when: 'always' },
      { kind: 'firefly', count: 18, when: 'dusk' },
    ],
    parallax: {
      colors: [0x5c7f8a, 0x3f6a5c, 0x2c5440, 0x1d3a2a],
      haze: [0.7, 0.5, 0.3, 0.12],
      scroll: [0.1, 0.22, 0.38, 0.55],
    },
    foregroundCanopy: true,
    distortion: null,
    ambience: { wind: 0.45, birds: 0.7, crickets: 0.4, drips: 0, chimes: 0.1, rumble: 0 },
    music: { root: 62, scale: PENTATONIC_MAJOR, bpm: 72, timbre: 'warm' },
  },
  {
    key: 'moonpetal_vale',
    grade: { tint: 0xdfe8ff, saturation: 0.92, contrast: 1.04, brightness: 1.03 },
    mist: { color: 0xdce4f6, alpha: 0.2, dawnBoost: 0.25 },
    motes: { color: 0xd6e0f0, count: 50 },
    particles: [
      { kind: 'petal', count: 22, when: 'always' },
      { kind: 'firefly', count: 10, when: 'night' },
    ],
    parallax: {
      colors: [0x8090b0, 0x64769a, 0x4a5c80, 0x34425e],
      // Low haze: the Vale keeps its own silver-blue even under a warm morning horizon.
      haze: [0.38, 0.26, 0.16, 0.06],
      scroll: [0.1, 0.22, 0.38, 0.55],
    },
    foregroundCanopy: false,
    distortion: null,
    ambience: { wind: 0.55, birds: 0.35, crickets: 0.3, drips: 0, chimes: 0.6, rumble: 0 },
    music: { root: 67, scale: LYDIAN, bpm: 64, timbre: 'glass' },
  },
  {
    key: 'weeping_mire',
    grade: { tint: 0xd8e0cc, saturation: 0.72, contrast: 0.96, brightness: 0.95 },
    mist: { color: 0xb8c4b0, alpha: 0.38, dawnBoost: 0.2 },
    motes: { color: 0xa6f0c4, count: 24 },
    particles: [
      { kind: 'spore', count: 16, when: 'always' },
      { kind: 'firefly', count: 22, when: 'dusk' },
    ],
    parallax: {
      colors: [0x6a7468, 0x535f50, 0x3d4a3a, 0x2a3428],
      haze: [0.78, 0.6, 0.4, 0.2],
      scroll: [0.1, 0.22, 0.38, 0.55],
    },
    foregroundCanopy: true,
    distortion: null,
    ambience: { wind: 0.25, birds: 0.15, crickets: 0.7, drips: 0.3, chimes: 0, rumble: 0 },
    music: { root: 57, scale: DORIAN, bpm: 56, timbre: 'hollow' },
  },
  // Depth layers (plan 2.5 suggested grades).
  {
    key: 'glowcap_grottos',
    grade: { tint: 0xc8f0ec, saturation: 1.1, contrast: 1.08, brightness: 1 },
    mist: { color: 0x3a7a78, alpha: 0.55, dawnBoost: 0 },
    motes: { color: 0xf0a0b0, count: 36 },
    particles: [{ kind: 'spore', count: 26, when: 'always' }],
    parallax: null,
    foregroundCanopy: false,
    distortion: null,
    ambience: { wind: 0.05, birds: 0, crickets: 0, drips: 0.6, chimes: 0.25, rumble: 0.05 },
    music: { root: 64, scale: PENTATONIC_MINOR, bpm: 60, timbre: 'glass' },
  },
  {
    key: 'rootdeep',
    grade: { tint: 0xd6e6c0, saturation: 0.85, contrast: 1.06, brightness: 0.92 },
    mist: { color: 0x7a8f2c, alpha: 0.55, dawnBoost: 0 },
    motes: { color: 0xa6f0c4, count: 22 },
    particles: [{ kind: 'spore', count: 12, when: 'always' }],
    parallax: null,
    foregroundCanopy: false,
    distortion: null,
    ambience: { wind: 0.03, birds: 0, crickets: 0, drips: 0.7, chimes: 0, rumble: 0.15 },
    music: { root: 55, scale: DORIAN, bpm: 52, timbre: 'hollow' },
  },
  {
    key: 'moonstone_hollows',
    grade: { tint: 0xd0f4ff, saturation: 0.9, contrast: 1.1, brightness: 1.04 },
    mist: { color: 0xc4d4f4, alpha: 0.7, dawnBoost: 0 },
    motes: { color: 0x76e6e0, count: 44 },
    particles: [],
    parallax: null,
    foregroundCanopy: false,
    distortion: null,
    ambience: { wind: 0.04, birds: 0, crickets: 0, drips: 0.4, chimes: 0.7, rumble: 0.05 },
    music: { root: 69, scale: LYDIAN, bpm: 58, timbre: 'glass' },
  },
  {
    key: 'ember_roots',
    grade: { tint: 0xffd2a8, saturation: 1.15, contrast: 1.12, brightness: 0.98 },
    mist: { color: 0x9a3418, alpha: 0.55, dawnBoost: 0 },
    motes: { color: 0xffa648, count: 18 },
    particles: [{ kind: 'ember', count: 34, when: 'always' }],
    parallax: null,
    foregroundCanopy: false,
    distortion: 'heatHaze',
    ambience: { wind: 0.05, birds: 0, crickets: 0, drips: 0, chimes: 0, rumble: 0.8 },
    music: { root: 50, scale: PHRYGIAN, bpm: 50, timbre: 'low' },
  },
  {
    key: 'gloam_heart',
    grade: { tint: 0xe6dcf0, saturation: 0.25, contrast: 1.15, brightness: 0.9 },
    mist: { color: 0x7a4aa0, alpha: 0.8, dawnBoost: 0 },
    motes: { color: 0x45365a, count: 14 },
    particles: [],
    parallax: null,
    foregroundCanopy: false,
    distortion: null,
    ambience: { wind: 0.02, birds: 0, crickets: 0, drips: 0.2, chimes: 0, rumble: 0.5 },
    music: { root: 45, scale: PHRYGIAN, bpm: 44, timbre: 'low' },
  },
];

export function biomeVisual(key: string): BiomeVisual {
  const v = BIOME_VISUALS.find((b) => b.key === key);
  if (!v) throw new Error(`No visuals for biome "${key}"`);
  return v;
}
