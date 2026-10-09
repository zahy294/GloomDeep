/** Seeded randomness. Everything that must be reproducible from a world seed goes through here. */

/**
 * mulberry32 with readable state, so a save can resume the exact sequence. `state` is the
 * generator's whole state (a uint32).
 */
export class Mulberry32 {
  state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  /** Returns [0, 1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
}

/** mulberry32: tiny, fast, good enough for gameplay and world generation. Returns [0, 1). */
export function mulberry32(seed: number): () => number {
  const generator = new Mulberry32(seed);
  return () => generator.next();
}

/** Stateless integer hash of a 2D lattice point → [0, 1). */
export function hash2(x: number, y: number, seed: number): number {
  let h = seed ^ Math.imul(x, 0x27d4eb2d) ^ Math.imul(y, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const smooth = (t: number) => t * t * (3 - 2 * t);

/** Smooth 1D value noise in [0, 1). `x` is in lattice units. */
export function valueNoise1(x: number, seed: number): number {
  const x0 = Math.floor(x);
  const t = smooth(x - x0);
  const a = hash2(x0, 0, seed);
  const b = hash2(x0 + 1, 0, seed);
  return a + (b - a) * t;
}

/** Smooth 2D value noise in [0, 1). Coordinates are in lattice units. */
export function valueNoise2(x: number, y: number, seed: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const tx = smooth(x - x0);
  const ty = smooth(y - y0);
  const a = hash2(x0, y0, seed);
  const b = hash2(x0 + 1, y0, seed);
  const c = hash2(x0, y0 + 1, seed);
  const d = hash2(x0 + 1, y0 + 1, seed);
  const top = a + (b - a) * tx;
  const bottom = c + (d - c) * tx;
  return top + (bottom - top) * ty;
}
