/**
 * Light sources (plan 2.3: "defined in src/data/lights.ts (color, radius, flicker)"). Tiles refer
 * to these by key; the lantern and later projectiles use them too.
 */
export interface LightDef {
  readonly key: string;
  /** Colour at full strength, 0–255 per channel. */
  readonly color: readonly [number, number, number];
  /** How many tiles of open air the light reaches. */
  readonly radius: number;
  /** 0 = steady; otherwise the fraction the intensity wavers by (fire). */
  readonly flicker: number;
}

export const LIGHTS: readonly LightDef[] = [
  { key: 'torch', color: [255, 178, 96], radius: 12, flicker: 0.12 },
  { key: 'lumen_crystal', color: [96, 220, 214], radius: 6, flicker: 0 },
  { key: 'moonstone_crystal', color: [150, 165, 200], radius: 4, flicker: 0 },
  { key: 'glowcap', color: [210, 110, 150], radius: 5, flicker: 0 },
  { key: 'emberite', color: [255, 120, 60], radius: 4, flicker: 0.08 },
  { key: 'moonpetal', color: [190, 170, 230], radius: 4, flicker: 0 },
  { key: 'glowmoss', color: [110, 220, 170], radius: 3, flicker: 0 },
  { key: 'ember_bloom', color: [255, 140, 70], radius: 3, flicker: 0.06 },
  /** Carved runes (ruins): wake up as the player approaches (A3 proximity). */
  { key: 'rune', color: [110, 220, 230], radius: 5, flicker: 0 },
  /**
   * Always on, very dim: plan 2.1 — "in full darkness the player ... still glow faintly", so the
   * player is never invisible even with the lantern out.
   */
  { key: 'player_aura', color: [120, 128, 160], radius: 4, flicker: 0 },
  /** Soft light around the player while the lantern burns, so they're never blind (plan 2.1). */
  { key: 'lantern_glow', color: [255, 196, 120], radius: 5, flicker: 0.05 },
];

export function lightByKey(key: string): LightDef {
  const light = LIGHTS.find((l) => l.key === key);
  if (!light) throw new Error(`Unknown light "${key}"`);
  return light;
}
