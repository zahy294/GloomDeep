import { BIOME_BLEND, TILE_SIZE, TIME_OF_DAY_FX, type PhotoPresetKey } from '../config';
import { LIQUID } from '../data/biomes';
import type { DaySample } from '../sim/dayCycle';
import type { QualityFeatures } from '../settings';
import type { Simulation } from '../sim/Simulation';
import { approachWeights, biomeWeights, SURFACE_COUNT, VISUALS } from './biomeBlend';

const MAX_SUN = 255;

/**
 * Everything the atmosphere renderers (sky, parallax, mist, shafts, particles, grade, audio) read
 * each frame, computed once by the Game scene after the camera moves: where the camera is in the
 * biome blend (smoothed over ~2 s), the weather and the time of day. Read-only for consumers.
 */
export class VisualState {
  /** Smoothed weight per entry of VISUALS (surface biomes, then depth layers); sums to ~1. */
  readonly weights = new Float32Array(VISUALS.length);
  /** Camera view in world pixels. */
  readonly view = { x: 0, y: 0, width: 0, height: 0 };
  /** 0..1: how much the camera is outdoors (surface) rather than underground. */
  outdoors = 1;
  /** Weather (src/sim/weather.ts): wind −1..1, rain/storm/mist/flash 0..1. */
  wind = 0;
  rain = 0;
  storm = 0;
  mist = 0;
  flash = 0;
  /** Time of day 0..1 and the sampled day cycle (sky colours, sunlight). */
  dayFraction = 0.5;
  day!: DaySample;
  /** 0..1 sunlight strength; `night` = 1 − daylight; `dusk` peaks around sunset. */
  daylight = 1;
  night = 0;
  dusk = 0;
  /** Simulated seconds (for deterministic animation) and real seconds since the scene began. */
  simTime = 0;
  realTime = 0;
  /** Player feet-centre in world pixels, and whether the camera centre is under water. */
  playerX = 0;
  playerY = 0;
  underwater = false;
  /** 0..1: how much of the view the Gloam covers (smoothed); drains colour from the grade. */
  gloam = 0;
  /** 0..1: a Dimming night's strength (M12): auroras in the sky, a violet grade. */
  dimming = 0;
  /** Photo mode's filter preset (M13; PHOTO.presets key), 'none' otherwise. */
  photoPreset: PhotoPresetKey = 'none';

  private readonly target = new Float32Array(VISUALS.length);
  private first = true;

  /** What the current quality setting allows (plan 2.10). */
  constructor(readonly features: QualityFeatures) {}

  /**
   * The next update takes the camera's blend as-is instead of fading to it (after a teleport or
   * the initial camera snap, a 2-second crossfade from the old place would be wrong).
   */
  jumpNext(): void {
    this.first = true;
  }

  /** Call once per frame after the camera has moved. */
  update(
    sim: Simulation,
    camera: { scrollX: number; scrollY: number; width: number; height: number },
    playerX: number,
    playerY: number,
    dt: number,
  ): void {
    const { view } = this;
    view.x = camera.scrollX;
    view.y = camera.scrollY;
    view.width = camera.width;
    view.height = camera.height;
    const world = sim.world;
    const cx = (view.x + view.width / 2) / TILE_SIZE;
    const cy = (view.y + view.height / 2) / TILE_SIZE;
    biomeWeights(world, cx, cy, this.target);
    if (this.first) {
      this.weights.set(this.target);
      this.first = false;
    } else {
      approachWeights(this.weights, this.target, dt, BIOME_BLEND.transitionSeconds);
    }
    let outdoors = 0;
    for (let i = 0; i < SURFACE_COUNT; i++) outdoors += this.weights[i] ?? 0;
    this.outdoors = Math.min(1, outdoors);

    const w = sim.weather.sample;
    this.wind = w.wind;
    this.rain = w.rain;
    this.storm = w.storm;
    this.mist = w.mist;
    this.flash = w.flash;
    this.dayFraction = sim.dayFraction;
    this.day = sim.day;
    this.daylight = Math.max(sim.day.sunR, sim.day.sunG, sim.day.sunB) / MAX_SUN;
    this.night = 1 - this.daylight;
    const d = Math.abs(sim.dayFraction - TIME_OF_DAY_FX.duskCentre) / TIME_OF_DAY_FX.duskHalfWidth;
    this.dusk = d >= 1 ? 0 : 1 - d * d;
    this.dimming = sim.dimming.strength;
    this.simTime = sim.time;
    this.realTime += dt;
    this.playerX = playerX;
    this.playerY = playerY;
    const tx = Math.floor(cx);
    const ty = Math.floor(cy);
    this.underwater =
      world.inBounds(tx, ty) && world.liquidType[ty * world.width + tx] === LIQUID.water;
  }
}
