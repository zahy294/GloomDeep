import { QUALITY } from './config';
import { DEFAULT_BINDINGS, UI_KEYS } from './data/keybindings';
import type { Quality } from './debugParams';
import type { Action } from './sim/input';

/** Rebindable things: the simulation's keyboard actions and the UI keys. */
export type UiKey = 'toggleInventory' | 'toggleJournal' | 'toggleGuide' | 'togglePhoto';
export type Bindable = Action | UiKey;

/** Volume levels 0..1 (multiplying the mix in AUDIO). */
export interface Volumes {
  master: number;
  music: number;
  ambience: number;
  sfx: number;
}

/**
 * Player settings that persist between sessions (plan 5: "settings (quality, keybinds, volume,
 * scale)"). Stored in localStorage; a `?quality=` URL parameter wins.
 */
export interface Settings {
  quality: Quality;
  volume: Volumes;
  /** Largest whole-number display scale to use, or 'auto' (the largest that fits). */
  scale: 'auto' | number;
  /** Phaser key names per bindable (up to two each). */
  keys: Record<Bindable, string[]>;
}

/** The order the controls are listed in the settings menu, with their labels. */
export const BINDABLES: readonly { key: Bindable; label: string }[] = [
  { key: 'moveLeft', label: 'Walk left' },
  { key: 'moveRight', label: 'Walk right' },
  { key: 'jump', label: 'Jump' },
  { key: 'moveUp', label: 'Climb / swim up' },
  { key: 'moveDown', label: 'Drop / swim down' },
  { key: 'wallMode', label: 'Back-wall mode' },
  { key: 'toggleLantern', label: 'Lantern' },
  { key: 'cycleLens', label: 'Switch lens' },
  { key: 'toggleInventory', label: 'Inventory' },
  { key: 'toggleJournal', label: 'Journal' },
  { key: 'toggleGuide', label: 'Guide' },
  { key: 'togglePhoto', label: 'Photo mode' },
];

/** Keys that can't be bound: Esc (menus), the hotbar digits and the debug keys. */
export const RESERVED_KEYS: readonly string[] = [
  'ESC',
  'ZERO',
  'ONE',
  'TWO',
  'THREE',
  'FOUR',
  'FIVE',
  'SIX',
  'SEVEN',
  'EIGHT',
  'NINE',
  'F3',
];

/** The largest display scale offered (×1 … ×this). */
export const MAX_SCALE_CHOICE = 6;

function defaultKeys(): Record<Bindable, string[]> {
  const keys = {} as Record<Bindable, string[]>;
  for (const { key } of BINDABLES) {
    const ui = (UI_KEYS as Record<string, string>)[key];
    keys[key] = ui ? [ui] : [...(DEFAULT_BINDINGS[key as Action] ?? [])];
  }
  return keys;
}

export const DEFAULT_SETTINGS: Settings = {
  quality: 'high',
  volume: { master: 1, music: 1, ambience: 1, sfx: 1 },
  scale: 'auto',
  keys: defaultKeys(),
};

const STORAGE_KEY = 'gloamdeep.settings';

/** Saved settings over the defaults (missing or broken fields fall back to the defaults). */
export function mergeSettings(
  saved: Partial<Settings>,
  override: Partial<Settings> = {},
): Settings {
  const keys = { ...DEFAULT_SETTINGS.keys };
  for (const { key } of BINDABLES) {
    const list = saved.keys?.[key];
    if (Array.isArray(list) && list.every((k) => typeof k === 'string')) keys[key] = [...list];
  }
  const volume = { ...DEFAULT_SETTINGS.volume };
  for (const k of Object.keys(volume) as (keyof Volumes)[]) {
    const v = saved.volume?.[k];
    if (typeof v === 'number' && v >= 0 && v <= 1) volume[k] = v;
  }
  const quality = (['low', 'medium', 'high'] as const).find((q) => q === saved.quality);
  const scale =
    typeof saved.scale === 'number' && saved.scale >= 1 && saved.scale <= MAX_SCALE_CHOICE
      ? Math.round(saved.scale)
      : 'auto';
  return {
    quality: quality ?? DEFAULT_SETTINGS.quality,
    volume,
    scale,
    keys,
    ...override,
  };
}

export function loadSettings(override: Partial<Settings> = {}): Settings {
  let saved: Partial<Settings> = {};
  try {
    saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Partial<Settings>;
  } catch {
    // Private mode or corrupt data: fall back to defaults.
  }
  return mergeSettings(saved, override);
}

export function saveSettings(settings: Settings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Storage unavailable: settings just won't persist.
  }
}

/** Binds `key` to `what` in slot 0 or 1, taking it away from anything else that had it. */
export function rebind(
  keys: Record<Bindable, string[]>,
  what: Bindable,
  slot: number,
  key: string | null,
): Record<Bindable, string[]> {
  const out = { ...keys };
  if (key) {
    for (const { key: other } of BINDABLES)
      out[other] = (out[other] ?? []).filter((k) => k !== key);
  }
  const list = [...(out[what] ?? [])];
  if (key) list[slot] = key;
  else list.splice(slot, 1);
  out[what] = list.filter((k): k is string => typeof k === 'string' && k.length > 0);
  return out;
}

const CODE_NAMES: Readonly<Record<string, string>> = {
  Space: 'SPACE',
  ShiftLeft: 'SHIFT',
  ShiftRight: 'SHIFT',
  ControlLeft: 'CTRL',
  ControlRight: 'CTRL',
  AltLeft: 'ALT',
  AltRight: 'ALT',
  ArrowLeft: 'LEFT',
  ArrowRight: 'RIGHT',
  ArrowUp: 'UP',
  ArrowDown: 'DOWN',
  Enter: 'ENTER',
  Tab: 'TAB',
  Backspace: 'BACKSPACE',
  Escape: 'ESC',
  Comma: 'COMMA',
  Period: 'PERIOD',
  Minus: 'MINUS',
  Equal: 'PLUS',
  Semicolon: 'SEMICOLON',
  Quote: 'QUOTES',
  Slash: 'FORWARD_SLASH',
  Backslash: 'BACK_SLASH',
  BracketLeft: 'OPEN_BRACKET',
  BracketRight: 'CLOSED_BRACKET',
  Backquote: 'BACKTICK',
};
const DIGITS = ['ZERO', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE'];

/**
 * The Phaser key name (Phaser.Input.Keyboard.KeyCodes) for a DOM key event's physical key, or
 * null for keys the game doesn't bind.
 */
export function keyName(code: string): string | null {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit\d$/.test(code)) return DIGITS[Number(code.slice(5))] ?? null;
  if (/^F([1-9]|1[0-2])$/.test(code)) return code;
  return CODE_NAMES[code] ?? null;
}

/** A key name as shown to players ("SPACE" → "Space", "LEFT" → "←"). */
export function keyLabel(name: string): string {
  const arrows: Record<string, string> = { LEFT: '←', RIGHT: '→', UP: '↑', DOWN: '↓' };
  if (arrows[name]) return arrows[name] ?? name;
  if (name.length === 1) return name;
  return name.charAt(0) + name.slice(1).toLowerCase().replace(/_/g, ' ');
}

/** What each quality level switches (plan 2.10). */
export function qualityFeatures(quality: Quality): QualityFeatures {
  return {
    glow: quality !== 'low',
    parallaxLayers: QUALITY[quality].parallaxLayers,
    particleDensity: QUALITY[quality].particleDensity,
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
