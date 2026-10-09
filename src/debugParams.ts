/**
 * Debug URL parameters, so screenshots are repeatable (CLAUDE.md "Visual checks").
 * Examples: ?seed=42&scene=game&x=2100&y=300&time=sunset&ui=0   ?scene=art-test&id=soil&time=night
 *   ?scene=game&biome=weeping_mire   ?scene=game&spot=cave   ?scene=game&spot=waterfall   ?scene=game&biome=ember_roots
 */
import { NAMED_TIMES, type NamedTime } from './data/dayCycle';
import type { WorldSizeKey } from './sim/world/worldData';

export type StartScene = 'title' | 'game' | 'art-test';

export type Quality = 'low' | 'medium' | 'high';

export interface DebugParams {
  seed: number | null;
  /** Skip straight to a scene instead of the title screen. */
  scene: StartScene;
  /** `ui=0` hides the DOM overlay. */
  showUi: boolean;
  /** Spawn override in tile coordinates (feet position); null = normal spawn. */
  x: number | null;
  y: number | null;
  /** `debug=1` opens the F3 overlay on start. */
  debugOverlay: boolean;
  /** Art-test scene: the manifest id of the asset to show. */
  assetId: string | null;
  /** Start at a named time of day (`?time=noon`, `dawn`, `sunset`, `night`...); `day` = noon. */
  time: NamedTime | null;
  /** `?quality=low|medium|high` overrides the saved quality setting. */
  quality: Quality | null;
  /** Art-test scene: load a different pack folder (e.g. a demo pack built by the shot script). */
  pack: string | null;
  /** Debug start: spawn in this surface biome or depth layer (src/data/biomes.ts key). */
  biome: string | null;
  /** Debug start: `spot=cave` spawns in an open cave pocket, `spot=waterfall` beside a waterfall. */
  spot: 'cave' | 'waterfall' | null;
  /** Debug start world size (`size=small|medium|large`). */
  size: WorldSizeKey | null;
  /** `rain=0..1` forces the rain intensity for rendering only (screenshots); null = real weather. */
  rain: number | null;
  /** `kit=<key>` adds a debug kit (src/data/items.ts DEBUG_KITS) to new and debug worlds. */
  kit: string | null;
}

function intParam(params: URLSearchParams, name: string): number | null {
  const text = params.get(name);
  return text !== null && /^-?\d+$/.test(text) ? Number(text) : null;
}

/** Ids and folder names: letters, digits, dash, underscore only. */
function nameParam(params: URLSearchParams, name: string): string | null {
  const text = params.get(name);
  return text !== null && /^[\w-]+$/.test(text) ? text : null;
}

function unitParam(params: URLSearchParams, name: string): number | null {
  const text = params.get(name);
  const value = text === null || text === '' ? NaN : Number(text);
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : null;
}

function namedTime(text: string | null): NamedTime | null {
  if (text === 'day') return 'noon';
  return text !== null && Object.hasOwn(NAMED_TIMES, text) ? (text as NamedTime) : null;
}

const SCENES: readonly StartScene[] = ['title', 'game', 'art-test'];

export function parseDebugParams(search: string): DebugParams {
  const params = new URLSearchParams(search);
  const scene = params.get('scene');
  return {
    seed: intParam(params, 'seed'),
    scene: SCENES.find((s) => s === scene) ?? 'title',
    showUi: params.get('ui') !== '0',
    x: intParam(params, 'x'),
    y: intParam(params, 'y'),
    debugOverlay: params.get('debug') === '1',
    assetId: nameParam(params, 'id'),
    time: namedTime(params.get('time')),
    quality: (['low', 'medium', 'high'] as const).find((q) => q === params.get('quality')) ?? null,
    pack: nameParam(params, 'pack'),
    biome: nameParam(params, 'biome'),
    spot: (['cave', 'waterfall'] as const).find((s) => s === params.get('spot')) ?? null,
    size: (['small', 'medium', 'large'] as const).find((s) => s === params.get('size')) ?? null,
    rain: unitParam(params, 'rain'),
    kit: nameParam(params, 'kit'),
  };
}
