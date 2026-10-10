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
  /** Bioluminescent breathing: a slow sine, each tile at its own phase (plan 2.0). */
  readonly pulse?: { readonly period: number; readonly depth: number };
  /**
   * Wakes up as the player approaches (runes): full strength within `near` tiles, fading to
   * `min` of full strength at `far` tiles and beyond.
   */
  readonly proximity?: { readonly near: number; readonly far: number; readonly min: number };
}

export const LIGHTS: readonly LightDef[] = [
  { key: 'torch', color: [255, 178, 96], radius: 12, flicker: 0.12 },
  { key: 'furnace', color: [255, 140, 64], radius: 8, flicker: 0.1 },
  /** M10: a jar of fireflies, open Lumen blooms, fairy mushrooms, beacons and wisps. */
  {
    key: 'firefly',
    color: [200, 240, 120],
    radius: 7,
    flicker: 0,
    pulse: { period: 1.7, depth: 0.35 },
  },
  {
    key: 'lumen_bloom',
    color: [110, 225, 220],
    radius: 4,
    flicker: 0,
    pulse: { period: 3.1, depth: 0.25 },
  },
  { key: 'fae', color: [230, 150, 210], radius: 2, flicker: 0, pulse: { period: 2.2, depth: 0.5 } },
  {
    key: 'beacon',
    color: [150, 235, 255],
    radius: 16,
    flicker: 0,
    pulse: { period: 4, depth: 0.12 },
  },
  { key: 'wisp', color: [170, 230, 255], radius: 5, flicker: 0.1 },
  /** M11: town street lamps (full and running low) and lanterns hung among the leaves. */
  { key: 'street_lamp', color: [255, 196, 120], radius: 11, flicker: 0.05 },
  { key: 'street_lamp_dim', color: [200, 130, 70], radius: 5, flicker: 0.18 },
  { key: 'hanging_lantern', color: [255, 186, 110], radius: 8, flicker: 0.06 },
  /** Lava (a liquid, lit through the light job's liquid cells) and burning tiles. */
  { key: 'lava', color: [255, 110, 40], radius: 7, flicker: 0.06 },
  { key: 'fire', color: [255, 150, 60], radius: 8, flicker: 0.3 },
  /** Thrown flares: bright and red-gold, flickering (FLARE in config). */
  { key: 'flare', color: [255, 150, 110], radius: 14, flicker: 0.15 },
  /** Revealed spirit platforms: a faint cyan shimmer. */
  {
    key: 'spirit',
    color: [100, 200, 220],
    radius: 3,
    flicker: 0,
    pulse: { period: 2.4, depth: 0.3 },
  },
  { key: 'lumen_crystal', color: [96, 220, 214], radius: 6, flicker: 0 },
  { key: 'moonstone_crystal', color: [150, 165, 200], radius: 4, flicker: 0 },
  {
    key: 'glowcap',
    color: [210, 110, 150],
    radius: 5,
    flicker: 0,
    pulse: { period: 3.6, depth: 0.3 },
  },
  { key: 'emberite', color: [255, 120, 60], radius: 4, flicker: 0.08 },
  {
    key: 'moonpetal',
    color: [190, 170, 230],
    radius: 4,
    flicker: 0,
    pulse: { period: 4.2, depth: 0.35 },
  },
  {
    key: 'glowmoss',
    color: [110, 220, 170],
    radius: 3,
    flicker: 0,
    pulse: { period: 5.1, depth: 0.4 },
  },
  { key: 'ember_bloom', color: [255, 140, 70], radius: 3, flicker: 0.06 },
  /** Carved runes (ruins): wake up as the player approaches. */
  {
    key: 'rune',
    color: [110, 220, 230],
    radius: 5,
    flicker: 0,
    pulse: { period: 2.8, depth: 0.15 },
    proximity: { near: 3, far: 10, min: 0.06 },
  },
  /**
   * Always on, very dim: plan 2.1 — "in full darkness the player ... still glow faintly", so the
   * player is never invisible even with the lantern out.
   */
  { key: 'player_aura', color: [120, 128, 160], radius: 4, flicker: 0 },
  /** Soft light around the player while the lantern burns, so they're never blind (plan 2.1). */
  { key: 'lantern_glow', color: [255, 196, 120], radius: 5, flicker: 0.05 },
  /** M12: ward runes, boss-arena fixtures, the bosses' own glow and the Heartlight. */
  { key: 'ward', color: [120, 80, 190], radius: 2, flicker: 0, pulse: { period: 5, depth: 0.4 } },
  {
    key: 'moth_lure',
    color: [255, 170, 190],
    radius: 9,
    flicker: 0,
    pulse: { period: 1.4, depth: 0.25 },
  },
  { key: 'brazier', color: [255, 160, 80], radius: 11, flicker: 0.15 },
  { key: 'prism', color: [140, 220, 240], radius: 2, flicker: 0 },
  {
    key: 'heart_node',
    color: [255, 214, 140],
    radius: 13,
    flicker: 0,
    pulse: { period: 3, depth: 0.1 },
  },
  {
    key: 'heartlight',
    color: [255, 240, 200],
    radius: 30,
    flicker: 0,
    pulse: { period: 6, depth: 0.08 },
  },
  {
    key: 'moth_glow',
    color: [240, 170, 200],
    radius: 7,
    flicker: 0,
    pulse: { period: 1.1, depth: 0.3 },
  },
  { key: 'warden_glow', color: [150, 190, 230], radius: 6, flicker: 0 },
  {
    key: 'heart_glow',
    color: [200, 70, 120],
    radius: 10,
    flicker: 0,
    pulse: { period: 1.5, depth: 0.35 },
  },
  { key: 'reflected_beam', color: [170, 230, 255], radius: 3, flicker: 0 },
];

export function lightByKey(key: string): LightDef {
  const light = LIGHTS.find((l) => l.key === key);
  if (!light) throw new Error(`Unknown light "${key}"`);
  return light;
}
