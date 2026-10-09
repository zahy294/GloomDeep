/**
 * Lantern lenses (plan 1.4). A lens sets the colour and shape of the lantern's cone, how fast it
 * burns Lumen, and what its light does (effect strengths in LENS_FX / GLOAM in config).
 */
export type LensEffect = 'heal' | 'reveal' | 'burn' | 'grow';

export interface LensDef {
  readonly key: string;
  readonly name: string;
  /** Cone colour at full strength, 0–255 per channel. */
  readonly color: readonly [number, number, number];
  /** Cone length in tiles and half-angle in radians. */
  readonly range: number;
  readonly halfAngle: number;
  /** Multiplies LUMEN.drainPerSecond (stronger lenses burn faster). */
  readonly drainMultiplier: number;
  /**
   * heal: Amber, warm and safe, slowly heals you. reveal: Azure true sight (veiled tiles).
   * burn: Crimson burns the Gloam (and shades, M8). grow: Verdant, plants grow in its light.
   */
  readonly effect: LensEffect;
  /** The item that unlocks it (src/data/items.ts), or null for the lens you start with. */
  readonly item: string | null;
}

export const LENSES: readonly LensDef[] = [
  {
    key: 'amber',
    name: 'Amber Lens',
    color: [255, 190, 110],
    range: 14,
    halfAngle: 0.42,
    drainMultiplier: 1,
    effect: 'heal',
    item: null,
  },
  {
    key: 'azure',
    name: 'Azure Lens',
    color: [120, 175, 255],
    range: 17,
    halfAngle: 0.3,
    drainMultiplier: 1.5,
    effect: 'reveal',
    item: 'azure_lens',
  },
  {
    key: 'crimson',
    name: 'Crimson Lens',
    color: [255, 96, 84],
    range: 11,
    halfAngle: 0.36,
    drainMultiplier: 2,
    effect: 'burn',
    item: 'crimson_lens',
  },
  {
    key: 'verdant',
    name: 'Verdant Lens',
    color: [140, 240, 120],
    range: 12,
    halfAngle: 0.5,
    drainMultiplier: 1.5,
    effect: 'grow',
    item: 'verdant_lens',
  },
];

export function lensByKey(key: string): LensDef {
  const lens = LENSES.find((l) => l.key === key);
  if (!lens) throw new Error(`Unknown lens "${key}"`);
  return lens;
}
