import { WEATHER } from '../data/weather';
import type { DaySample } from './dayCycle';
import type { EventBus, SimEvents } from './events';
import { hash2, valueNoise1 } from './random';

/** Current weather, all derived from (seed, simulated time, time of day). */
export interface WeatherSample {
  /** −1 (full west) .. +1 (full east). Drives sway, rain angle, leaves, mist drift. */
  wind: number;
  /** 0..1 rain intensity. */
  rain: number;
  /** 0..1 how stormy (lightning likelihood). */
  storm: number;
  /** 0..1 morning mist (thick at dawn, gone by midday). */
  mist: number;
  /** 0..1 brightness of the latest lightning flash. */
  flash: number;
}

const WIND_SEED = 0x51a7;
const GUST_SEED = 0x6c3e;
const RAIN_SEED = 0x7a11;
const STRIKE_TIME_ROW = 0;
const STRIKE_CHANCE_ROW = 1;

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (t: number) => t * t * (3 - 2 * t);

/**
 * Weather and wind (plan 2.4), a pure function of the world seed and simulated time: deterministic
 * and nothing to save. Lightning strike times are drawn per time slot from a hash, so a strike is
 * detected (and `lightning` emitted) when a step's time range covers one.
 */
export class Weather {
  readonly sample: WeatherSample = { wind: 0, rain: 0, storm: 0, mist: 0, flash: 0 };
  private readonly payload = { flash: 1 };
  private lastTime = -1;

  constructor(private readonly seed: number) {}

  /** Recomputes the sample at `time`; emits `lightning` for strikes since the last update. */
  update(time: number, dayFraction: number, events?: EventBus<SimEvents>): void {
    const s = this.sample;
    s.rain = this.rainAt(time);
    s.storm = clamp01((s.rain - WEATHER.storm.start) / (1 - WEATHER.storm.start));
    const w = WEATHER.wind;
    const drift = valueNoise1(time / w.wavelength, this.seed ^ WIND_SEED) * 2 - 1;
    const gust = valueNoise1(time / w.gustWavelength, this.seed ^ GUST_SEED) * 2 - 1;
    const wind = (drift * (1 - w.gustWeight) + gust * w.gustWeight) * (1 + w.rainBoost * s.rain);
    s.wind = Math.max(-1, Math.min(1, wind));
    s.mist = mistAt(dayFraction);

    // Flash from the latest strike within the flash duration (pure: survives save/load).
    s.flash = 0;
    const slot = WEATHER.storm.slotSeconds;
    const flashSeconds = WEATHER.lightning.flashSeconds;
    for (let k = Math.floor((time - flashSeconds) / slot); k <= Math.floor(time / slot); k++) {
      const t = this.strikeTime(k);
      if (t !== null && t <= time && time - t < flashSeconds) {
        s.flash = Math.max(s.flash, 1 - (time - t) / flashSeconds);
      }
    }
    if (events && this.lastTime >= 0) {
      for (let k = Math.floor(this.lastTime / slot); k <= Math.floor(time / slot); k++) {
        const t = this.strikeTime(k);
        if (t !== null && t > this.lastTime && t <= time) events.emit('lightning', this.payload);
      }
    }
    this.lastTime = time;
  }

  /** Writes the sunlight after weather (overcast rain, lightning flash) into `out`. */
  applyToSun(day: DaySample, out: { sunR: number; sunG: number; sunB: number }): void {
    const scale = 1 - (1 - WEATHER.rain.overcast) * this.sample.rain;
    const boost = WEATHER.lightning.sunBoost * this.sample.flash;
    out.sunR = Math.min(255, day.sunR * scale + boost);
    out.sunG = Math.min(255, day.sunG * scale + boost);
    out.sunB = Math.min(255, day.sunB * scale + boost);
  }

  private rainAt(time: number): number {
    const r = WEATHER.rain;
    const n = valueNoise1(time / r.wavelength, this.seed ^ RAIN_SEED);
    // New worlds begin under a clear sky (first impressions), then the usual spells begin.
    const settled = smooth(clamp01((time - r.dryStart) / r.dryFade));
    return smooth(clamp01((n - r.start) / (r.full - r.start))) * settled;
  }

  /** The strike time inside slot k, or null if the slot has no strike. */
  private strikeTime(k: number): number | null {
    const slot = WEATHER.storm.slotSeconds;
    const start = k * slot;
    const storm = clamp01((this.rainAt(start) - WEATHER.storm.start) / (1 - WEATHER.storm.start));
    if (storm <= 0) return null;
    const chance = (storm * slot) / WEATHER.storm.meanInterval;
    if (hash2(k, STRIKE_CHANCE_ROW, this.seed) >= chance) return null;
    return start + hash2(k, STRIKE_TIME_ROW, this.seed) * slot;
  }
}

/** Morning mist in 0..1: a smooth bump around dawn. */
export function mistAt(dayFraction: number): number {
  const { peak, halfWidth } = WEATHER.morningMist;
  let d = Math.abs(dayFraction - peak);
  d = Math.min(d, 1 - d);
  return smooth(clamp01(1 - d / halfWidth));
}
