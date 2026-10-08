/**
 * Master palette: 16 ramps × 4 shades = 64 colours, ordered dark → light with hue shifts
 * (shadows lean cool, highlights lean warm). This is an interim palette; it gets replaced by
 * colours extracted from the approved style reference (GLOAMDEEP_PLAN.md 2.9.4) in M2b.
 */

export type Ramp = readonly [number, number, number, number];

export const PALETTE = {
  // Forest base
  tealShadow: [0x0b1f24, 0x12343a, 0x1d4e52, 0x2c6a68],
  emerald: [0x0f3b2e, 0x1a5c3e, 0x2a7d4b, 0x47a05a],
  moss: [0x2a4a24, 0x41692e, 0x5f8a3a, 0x86ad4c],
  leaf: [0x31612f, 0x4c8a3a, 0x74b048, 0xa8d266],
  bark: [0x2b1a17, 0x4a2e22, 0x6e4a32, 0x95704a],
  soil: [0x2a1c1e, 0x45302a, 0x644736, 0x86654a],
  stone: [0x23262e, 0x3a3f48, 0x575d66, 0x7e8590],
  mud: [0x262420, 0x3d392c, 0x575139, 0x76704c],
  // Sunlight
  gold: [0x6a4a1c, 0x9a6e24, 0xcf9e36, 0xf2cc5a],
  honey: [0x8a5a2a, 0xbf8236, 0xe6ac52, 0xffd88a],
  // Magic
  cyan: [0x0f4a5c, 0x187a8a, 0x2fb2b8, 0x76e6e0],
  mint: [0x1e5a4e, 0x2f8c6e, 0x5cc495, 0xa6f0c4],
  rose: [0x5a2440, 0x8c3a5c, 0xc4637e, 0xf0a0b0],
  moonSilver: [0x3c4660, 0x5e6c8a, 0x95a4c0, 0xd6e0f0],
  ember: [0x5a1a12, 0x9a3418, 0xdc6420, 0xffa648],
  // The Gloam: used by nothing else, so it always reads as a threat.
  gloam: [0x07060c, 0x14101e, 0x281e36, 0x45365a],
} as const satisfies Record<string, Ramp>;

export type RampName = keyof typeof PALETTE;

export const RAMP_NAMES = Object.keys(PALETTE) as RampName[];

/** Every palette colour as a flat list (used by the art import tool's palette matching later). */
export const PALETTE_COLORS: readonly number[] = RAMP_NAMES.flatMap((name) => PALETTE[name]);

export function toCss(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}
