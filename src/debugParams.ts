/**
 * Debug URL parameters, so screenshots are repeatable (CLAUDE.md "Visual checks").
 * Example: ?seed=42&scene=game&x=2100&y=300&ui=0
 * More parameters (time, biome) arrive with the systems that use them.
 */
export type StartScene = 'title' | 'game';

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
}

function intParam(params: URLSearchParams, name: string): number | null {
  const text = params.get(name);
  return text !== null && /^-?\d+$/.test(text) ? Number(text) : null;
}

export function parseDebugParams(search: string): DebugParams {
  const params = new URLSearchParams(search);
  return {
    seed: intParam(params, 'seed'),
    scene: params.get('scene') === 'game' ? 'game' : 'title',
    showUi: params.get('ui') !== '0',
    x: intParam(params, 'x'),
    y: intParam(params, 'y'),
    debugOverlay: params.get('debug') === '1',
  };
}
