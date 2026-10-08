import * as Phaser from 'phaser';

const DRAW_METHODS = [
  'drawArrays',
  'drawElements',
  'drawArraysInstanced',
  'drawElementsInstanced',
] as const;

/**
 * Counts WebGL draw calls per frame for the debug overlay. Phaser 4 has no built-in counter, so
 * this wraps the context's draw methods. Installed only when the overlay is first opened.
 */
export class DrawCallCounter {
  /** Draw calls in the last completed frame; null when not running on WebGL. */
  lastFrame: number | null = null;
  private current = 0;

  constructor(game: Phaser.Game) {
    const renderer = game.renderer;
    if (!(renderer instanceof Phaser.Renderer.WebGL.WebGLRenderer)) return;
    const gl = renderer.gl as unknown as Record<string, unknown>;
    for (const name of DRAW_METHODS) {
      const original = gl[name];
      if (typeof original !== 'function') continue;
      gl[name] = (...args: unknown[]) => {
        this.current++;
        return (original as (...a: unknown[]) => unknown).apply(gl, args);
      };
    }
    this.lastFrame = 0;
    game.events.on(Phaser.Core.Events.POST_RENDER, () => {
      this.lastFrame = this.current;
      this.current = 0;
    });
  }
}
