/** Pure maths for the camera colour grade (no Phaser): a 4x5 colour matrix from four parameters. */

export interface GradeParams {
  /** 0xRRGGBB multiplier; 0xffffff = unchanged. */
  tint: number;
  saturation: number;
  contrast: number;
  brightness: number;
}

const LUMA_R = 0.299;
const LUMA_G = 0.587;
const LUMA_B = 0.114;
const MID = 127.5;

export const MATRIX_SIZE = 20;

/**
 * Writes the 20 values (row-major, offsets in 0..255 as Phaser's ColorMatrix expects) for
 * saturation, then contrast around mid-grey, then tint x brightness. Alpha is untouched.
 */
export function gradeMatrix(p: GradeParams, out: Float32Array | number[]): void {
  const s = p.saturation;
  const inv = 1 - s;
  const tint = [(p.tint >> 16) & 0xff, (p.tint >> 8) & 0xff, p.tint & 0xff];
  const luma = [LUMA_R, LUMA_G, LUMA_B];
  for (let row = 0; row < 3; row++) {
    const scale = ((tint[row] ?? 255) / 255) * p.brightness;
    const base = row * 5;
    for (let col = 0; col < 3; col++) {
      out[base + col] = scale * p.contrast * ((luma[col] ?? 0) * inv + (row === col ? s : 0));
    }
    out[base + 3] = 0;
    out[base + 4] = scale * MID * (1 - p.contrast);
  }
  out[15] = 0;
  out[16] = 0;
  out[17] = 0;
  out[18] = 1;
  out[19] = 0;
}

/** True when any value differs by more than `epsilon`. */
export function matrixChanged(
  a: ArrayLike<number>,
  b: ArrayLike<number>,
  epsilon: number,
): boolean {
  for (let i = 0; i < MATRIX_SIZE; i++) {
    if (Math.abs((a[i] ?? 0) - (b[i] ?? 0)) > epsilon) return true;
  }
  return false;
}

/** True when the matrix is (nearly) the identity, so the pass can be skipped. */
export function isIdentity(m: ArrayLike<number>, epsilon: number): boolean {
  for (let i = 0; i < MATRIX_SIZE; i++) {
    const want = i % 6 === 0 ? 1 : 0; // diagonal of the 4x5 matrix: 0, 6, 12, 18
    if (Math.abs((m[i] ?? 0) - want) > epsilon) return false;
  }
  return true;
}

/** Moves `value` towards `target` by at most `maxStep`. */
export function stepToward(value: number, target: number, maxStep: number): number {
  const d = target - value;
  return Math.abs(d) <= maxStep ? target : value + Math.sign(d) * maxStep;
}

/**
 * Soft, tileless displacement-map sample in 0..1 for channel 0 (red) or 1 (green): a few sines of
 * different frequency, so the distortion has gentle waves rather than blocks.
 */
/**
 * 1 inside the map, falling smoothly to 0 within `margin` (UV) of any edge: displacement fades
 * to none at the screen edges, so the filter never samples outside the frame.
 */
export function edgeFade(u: number, v: number, margin: number): number {
  const s = (t: number) => {
    const c = t < 0 ? 0 : t > 1 ? 1 : t;
    return c * c * (3 - 2 * c);
  };
  return s(Math.min(u, 1 - u) / margin) * s(Math.min(v, 1 - v) / margin);
}

export function noiseSample(u: number, v: number, channel: number, phase: number): number {
  const tau = Math.PI * 2;
  const c = channel + 1;
  const a = Math.sin(tau * (2 * c * u + 3 * v) + phase * c);
  const b = Math.sin(tau * (3 * u - 2 * c * v) + phase * 2.3 + c);
  const d = Math.sin(tau * (1.5 * c * v + 5 * u) + phase * 0.7);
  return 0.5 + 0.2 * a + 0.15 * b + 0.1 * d;
}
