import type { Quality } from './debugParams';

/**
 * Player settings that persist between sessions (quality now; keybinds, volume and scale come
 * with the settings menu in M13). Stored in localStorage; a `?quality=` URL parameter wins.
 */
export interface Settings {
  quality: Quality;
}

const STORAGE_KEY = 'gloamdeep.settings';
const DEFAULTS: Settings = { quality: 'high' };

export function loadSettings(override: Partial<Settings> = {}): Settings {
  let saved: Partial<Settings> = {};
  try {
    saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Partial<Settings>;
  } catch {
    // Private mode or corrupt data: fall back to defaults.
  }
  return { ...DEFAULTS, ...saved, ...override };
}

export function saveSettings(settings: Settings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Storage unavailable: settings just won't persist.
  }
}

/** What each quality level switches (plan 2.10). */
export function qualityFeatures(quality: Quality): QualityFeatures {
  return {
    glow: quality !== 'low',
    parallaxLayers: quality === 'low' ? 2 : quality === 'medium' ? 3 : 4,
    particleDensity: quality === 'low' ? 0.35 : quality === 'medium' ? 0.7 : 1,
    mist: quality !== 'low',
    cameraFilters: quality !== 'low',
    reflections: quality === 'high',
  };
}

export interface QualityFeatures {
  /** Additive glow/bloom pass around emissive things (plan 2.3: "On Low quality, skip this"). */
  glow: boolean;
  /** Parallax tree layers drawn per biome (back layers dropped first). */
  parallaxLayers: number;
  /** Multiplier on ambient and weather particle counts. */
  particleDensity: number;
  /** Noise mist layers (back and front). */
  mist: boolean;
  /** Camera filters: colour grade, vignette, underwater and heat haze. */
  cameraFilters: boolean;
  /** Reflective still pools. */
  reflections: boolean;
}
