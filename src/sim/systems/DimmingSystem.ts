import { DIMMING } from '../../config';
import { DIMMING_SKY } from '../../data/dayCycle';
import type { DaySample } from '../dayCycle';
import type { EventBus, SimEvents } from '../events';

const smooth = (t: number) => {
  const c = t < 0 ? 0 : t > 1 ? 1 : t;
  return c * c * (3 - 2 * c);
};

const channel = (a: number, b: number, t: number, shift: number) => {
  const x = (a >> shift) & 0xff;
  return Math.round(x + (((b >> shift) & 0xff) - x) * t);
};

function mix(a: number, b: number, t: number): number {
  return (channel(a, b, t, 16) << 16) | (channel(a, b, t, 8) << 8) | channel(a, b, t, 0);
}

/** The flag set at the end of the n-th Dimming night survived (n from 1). */
export const dimmingFlag = (n: number): string => `dimming:${n}`;

const survivedPayload = { survived: 0 };
const NO_PAYLOAD: Record<string, never> = {};

/**
 * Dimming nights (plan 1.4 "Dimming nights", M12). Days are counted from the world's start (day 0);
 * the night that begins on day DIMMING.firstDay is the first Dimming night, then one every
 * DIMMING.everyDays. During one the sun dims (deeper with every night survived), the sky darkens
 * and auroras show (rendering reads `strength`), the Gloam grows faster and shades come in waves;
 * towns hold a vigil or hide by their light (TownSystem). Reaching its dawn counts as surviving it:
 * the flag `dimming:<n>` is set and the dawn leaves a gift. Once `over()` (the Gloam Heart has
 * fallen) there are no more.
 */
export class DimmingSystem {
  /** Whole days since the world began (saved). */
  day = 0;
  /** Dimming nights survived (saved). */
  survived = 0;
  /** 0..1: how deep the current Dimming is (0 on ordinary nights and days). */
  strength = 0;
  private lastFraction = -1;
  private warnedDay = -1;
  private wasOn = false;

  constructor(
    private readonly events: EventBus<SimEvents>,
    private readonly over: () => boolean,
    private readonly onSurvived: (survived: number) => void,
  ) {}

  /** Is the night that begins on `day` a Dimming night? */
  isDimmingNight(day: number): boolean {
    if (this.over() || day < DIMMING.firstDay) return false;
    return (day - DIMMING.firstDay) % DIMMING.everyDays === 0;
  }

  /** The next day (≥ today) whose night is a Dimming night, or -1 if they are over. */
  nextDimmingDay(): number {
    if (this.over()) return -1;
    if (this.day < DIMMING.firstDay) return DIMMING.firstDay;
    const since = (this.day - DIMMING.firstDay) % DIMMING.everyDays;
    return since === 0 ? this.day : this.day + DIMMING.everyDays - since;
  }

  /** Sunlight multiplier for this Dimming's depth (deeper with each one survived). */
  get depth(): number {
    return Math.max(DIMMING.minSun, DIMMING.sun - DIMMING.deepenBy * this.survived);
  }

  /** Counts days at midnight and updates the strength; fires warnings, the start and the dawn. */
  update(dayFraction: number): void {
    if (this.lastFraction >= 0 && dayFraction < this.lastFraction) this.day++;
    this.lastFraction = dayFraction;
    // Before dawn it is still the night that began yesterday.
    const morning = dayFraction < DIMMING.endsAt;
    const nightDay = morning ? this.day - 1 : this.day;
    const tonight = this.isDimmingNight(nightDay);
    this.strength = tonight ? strengthAt(dayFraction) : 0;

    if (!morning && this.isDimmingNight(this.day) && dayFraction >= DIMMING.warnAt) {
      if (this.warnedDay !== this.day && dayFraction < DIMMING.startsAt) {
        this.events.emit('dimmingWarning', NO_PAYLOAD);
      }
      this.warnedDay = this.day;
    }
    const on = this.strength > 0;
    if (on && !this.wasOn) this.events.emit('dimmingStarted', NO_PAYLOAD);
    // It fades out towards dawn (rounding may end it a moment before DIMMING.endsAt).
    if (!on && this.wasOn && dayFraction < DIMMING.startsAt) {
      this.survived++;
      this.onSurvived(this.survived);
      survivedPayload.survived = this.survived;
      this.events.emit('dimmingEnded', survivedPayload);
    }
    this.wasOn = on;
  }

  /** Darkens the day sample (sunlight and sky) by the current strength. */
  apply(day: DaySample): void {
    const s = this.strength;
    if (s <= 0) return;
    const sun = 1 - s * (1 - this.depth);
    day.sunR *= sun;
    day.sunG *= sun;
    day.sunB *= sun;
    const k = s * DIMMING.skyMix;
    day.skyTop = mix(day.skyTop, DIMMING_SKY.top, k);
    day.skyHorizon = mix(day.skyHorizon, DIMMING_SKY.horizon, k);
  }

  /** How many times faster the Gloam grows now. */
  get gloamGrowth(): number {
    return 1 + this.strength * (DIMMING.gloamGrowth - 1);
  }

  /** Shades per wave tonight. */
  get waveSize(): number {
    return Math.min(DIMMING.waveMax, DIMMING.waveSize + this.survived);
  }

  restore(day: number, survived: number, dayFraction: number): void {
    this.day = day;
    this.survived = survived;
    this.lastFraction = dayFraction;
    // Loaded before the warning time: it still comes.
    this.warnedDay = dayFraction >= DIMMING.warnAt ? day : day - 1;
    const morning = dayFraction < DIMMING.endsAt;
    this.strength = this.isDimmingNight(morning ? day - 1 : day) ? strengthAt(dayFraction) : 0;
    this.wasOn = this.strength > 0;
  }
}

/** Strength through a Dimming night by time of day: deepening after dusk, fading at dawn. */
export function strengthAt(f: number): number {
  if (f >= DIMMING.startsAt)
    return smooth((f - DIMMING.startsAt) / (DIMMING.fullAt - DIMMING.startsAt));
  if (f < DIMMING.fadeAt) return 1;
  if (f < DIMMING.endsAt)
    return 1 - smooth((f - DIMMING.fadeAt) / (DIMMING.endsAt - DIMMING.fadeAt));
  return 0;
}
