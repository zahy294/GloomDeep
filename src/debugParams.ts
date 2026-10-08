/**
 * Debug URL parameters, so screenshots are repeatable (CLAUDE.md "Visual checks").
 * Example: ?seed=42&scene=game&ui=0
 * More parameters (time, x, y, biome) arrive with the systems that use them.
 */
export type StartScene = 'title' | 'game';

export interface DebugParams {
  seed: number | null;
  /** Skip straight to a scene instead of the title screen. */
  scene: StartScene;
  /** `ui=0` hides the DOM overlay. */
  showUi: boolean;
}

export function parseDebugParams(search: string): DebugParams {
  const params = new URLSearchParams(search);
  const seedText = params.get('seed');
  const seed = seedText !== null && /^-?\d+$/.test(seedText) ? Number(seedText) : null;
  return {
    seed,
    scene: params.get('scene') === 'game' ? 'game' : 'title',
    showUi: params.get('ui') !== '0',
  };
}
