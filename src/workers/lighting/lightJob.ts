/**
 * Messages between the LightSystem (simulation) and the light flood fill (Web Worker or inline).
 * Plain data + typed arrays only, so jobs can be posted to a worker with transferables.
 */

/** The lantern's cone (plan 2.3: "a cone of light in the direction of the mouse"). */
export interface LightCone {
  /** Origin in tile units (fractional), absolute world coordinates. */
  x: number;
  y: number;
  /** Unit direction (screen axes: +y is down). */
  dirX: number;
  dirY: number;
  /** Length in tiles and half-angle in radians. */
  range: number;
  halfAngle: number;
  /** Colour at the origin, 0–255. */
  r: number;
  g: number;
  b: number;
}

export interface LightJob {
  id: number;
  /** Region in absolute tile coordinates (already clamped to the world). */
  x0: number;
  y0: number;
  width: number;
  height: number;
  /** Foreground tile ids of the region, row-major (`width × height`). */
  fg: Uint16Array;
  /**
   * Per column of the region: the first world row that blocks sunlight (sunlight falls straight
   * down through everything above it). May be above y0 or below the region's bottom.
   */
  skyline: Int32Array;
  /** Current sunlight colour/strength, 0–255 per channel. */
  sunR: number;
  sunG: number;
  sunB: number;
  /**
   * Extra point lights (not tiles), 6 floats each: x, y (tile units, absolute), r, g, b (0–255),
   * radius (tiles).
   */
  points: Float32Array;
  cone: LightCone | null;
  /** Seconds; drives the deterministic flicker of flickering sources. */
  time: number;
  /**
   * Output buffers to fill (length ≥ width × height); recycled between jobs to avoid allocating.
   * The worker transfers them back in the result.
   */
  outR: Uint8Array;
  outG: Uint8Array;
  outB: Uint8Array;
}

export interface LightResult {
  id: number;
  x0: number;
  y0: number;
  width: number;
  height: number;
  r: Uint8Array;
  g: Uint8Array;
  b: Uint8Array;
  /** Time spent computing (ms) — plan budget: ≤ 4 ms per update. */
  computeMs: number;
}

/** Runs light jobs somewhere (inline for tests, a Web Worker in the game). */
export interface LightBackend {
  /** Submits a job; `onResult` is called once with its result (possibly later). */
  submit(job: LightJob, onResult: (result: LightResult) => void): void;
  destroy?(): void;
}
