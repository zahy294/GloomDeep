/**
 * Debug URL parameters, so screenshots are repeatable (CLAUDE.md "Visual checks").
 * Examples: ?seed=42&scene=game&x=2100&y=300&ui=0   ?scene=art-test&id=soil&time=night
 * More parameters (biome) arrive with the systems that use them.
 */
export type StartScene = 'title' | 'game' | 'art-test';
export type TimeOfDay = 'day' | 'night';

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
  /** Art-test lighting until the real day–night cycle exists (M3). */
  time: TimeOfDay;
  /** Art-test scene: load a different pack folder (e.g. a demo pack built by the shot script). */
  pack: string | null;
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
    time: params.get('time') === 'night' ? 'night' : 'day',
    pack: nameParam(params, 'pack'),
  };
}
