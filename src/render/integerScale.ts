import type * as Phaser from 'phaser';
import { DISPLAY } from '../config';

/**
 * Largest whole-number zoom, in *device* pixels, at which the internal resolution fits the view.
 * Working in device pixels keeps game pixels square and even at 125%/150% OS display scaling.
 */
export function integerZoom(cssW: number, cssH: number, devicePixelRatio: number): number {
  const zoom = Math.floor(
    Math.min((cssW * devicePixelRatio) / DISPLAY.width, (cssH * devicePixelRatio) / DISPLAY.height),
  );
  return Math.max(DISPLAY.minZoom, zoom);
}

/**
 * Keeps the canvas at an integer multiple of 960×540 device pixels (letterboxed by CSS, never
 * stretched) and sizes the DOM overlay to match. Phaser's FIT mode would allow fractional scales,
 * so we drive the zoom ourselves in Scale.NONE mode.
 */
export function keepIntegerScale(game: Phaser.Game, overlay: HTMLElement): () => void {
  const apply = () => {
    const dpr = window.devicePixelRatio || 1;
    const deviceZoom = integerZoom(window.innerWidth, window.innerHeight, dpr);
    // Phaser sets the canvas CSS size to width × zoom, so pass the zoom in CSS pixels.
    const cssZoom = deviceZoom / dpr;
    if (game.scale.zoom !== cssZoom) game.scale.setZoom(cssZoom);

    overlay.style.width = `${DISPLAY.width * cssZoom}px`;
    overlay.style.height = `${DISPLAY.height * cssZoom}px`;
    // UI sizes are written as multiples of one game pixel so the overlay scales with the canvas.
    overlay.style.setProperty('--px', `${cssZoom}px`);
  };

  apply();
  window.addEventListener('resize', apply);
  return () => window.removeEventListener('resize', apply);
}
