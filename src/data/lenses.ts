/**
 * Lantern lenses (plan 1.4). M3 has Amber only; Azure, Crimson and Verdant arrive in M7 with their
 * effects. A lens sets the colour and shape of the lantern's cone.
 */
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
}

export const LENSES: readonly LensDef[] = [
  {
    key: 'amber',
    name: 'Amber Lens',
    color: [255, 190, 110],
    range: 14,
    halfAngle: 0.42,
    drainMultiplier: 1,
  },
];

export function lensByKey(key: string): LensDef {
  const lens = LENSES.find((l) => l.key === key);
  if (!lens) throw new Error(`Unknown lens "${key}"`);
  return lens;
}
