import type * as Phaser from 'phaser';
import { DISPLAY } from '../config';

export interface ViewSize {
  /** Whole-number zoom in device pixels. */
  zoom: number;
  /** Internal height in game pixels (DISPLAY.minHeight..DISPLAY.height, even). */
  height: number;
}

/**
 * The largest whole-number zoom, in *device* pixels, at which the full internal width fits, with
 * rows cropped (down to DISPLAY.minHeight) when the window is too short for all 540. Working in
 * device pixels keeps game pixels square even at 125%/150% OS display scaling.
 */
export function viewSize(cssW: number, cssH: number, devicePixelRatio: number): ViewSize {
  const deviceW = cssW * devicePixelRatio;
  const deviceH = cssH * devicePixelRatio;
  for (let zoom = Math.floor(deviceW / DISPLAY.width); zoom >= DISPLAY.minZoom; zoom--) {
    const rows = Math.floor(deviceH / zoom);
    if (rows >= DISPLAY.minHeight) {
      // Even, so the camera centre stays on a whole game pixel.
      return { zoom, height: Math.min(DISPLAY.height, rows - (rows % 2)) };
    }
  }
  return { zoom: DISPLAY.minZoom, height: DISPLAY.height };
}

/**
 * Keeps the canvas at an integer multiple of the internal size in device pixels (letterboxed by
 * CSS, never stretched; short windows crop rows instead of dropping a zoom level) and sizes the
 * DOM overlay to match. Phaser's FIT mode would allow fractional scales, so we drive the size and
 * zoom ourselves in Scale.NONE mode. Cameras at full size follow a resize automatically.
 */
export function keepIntegerScale(game: Phaser.Game, overlay: HTMLElement): () => void {
  const apply = () => {
    const dpr = window.devicePixelRatio || 1;
    const { zoom: deviceZoom, height } = viewSize(window.innerWidth, window.innerHeight, dpr);
    // Phaser sets the canvas CSS size to width × zoom, so pass the zoom in CSS pixels.
    const cssZoom = deviceZoom / dpr;
    if (game.scale.height !== height) game.scale.resize(DISPLAY.width, height);
    if (game.scale.zoom !== cssZoom) game.scale.setZoom(cssZoom);

    overlay.style.width = `${DISPLAY.width * cssZoom}px`;
    overlay.style.height = `${height * cssZoom}px`;
    // UI sizes are written as multiples of one game pixel so the overlay scales with the canvas.
    overlay.style.setProperty('--px', `${cssZoom}px`);
  };

  apply();
  window.addEventListener('resize', apply);
  return () => window.removeEventListener('resize', apply);
}
