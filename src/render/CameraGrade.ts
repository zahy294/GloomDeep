import * as Phaser from 'phaser';
import { GRADE } from '../config';
import type { BiomeVisual } from '../data/biomeVisuals';
import { mixColor } from './atmosphereMath';
import { blendColor, blendNumber } from './biomeBlend';
import {
  gradeMatrix,
  isIdentity,
  matrixChanged,
  MATRIX_SIZE,
  noiseSample,
  stepToward,
  type GradeParams,
} from './gradeMath';
import type { VisualState } from './VisualState';

const NOISE_KEY = 'grade-noise';
const TAU = Math.PI * 2;
const instances = new WeakMap<VisualState, CameraGrade>();

const pickSaturation = (v: BiomeVisual) => v.grade.saturation;
const pickContrast = (v: BiomeVisual) => v.grade.contrast;
const pickBrightness = (v: BiomeVisual) => v.grade.brightness;
const pickTint = (v: BiomeVisual) => v.grade.tint;
const pickHeatHaze = (v: BiomeVisual) => (v.distortion === 'heatHaze' ? 1 : 0);

function makeNoiseTexture(scene: Phaser.Scene): void {
  if (scene.textures.exists(NOISE_KEY)) return;
  const { width, height, seed } = GRADE.noise;
  const texture = scene.textures.createCanvas(NOISE_KEY, width, height);
  if (!texture) return;
  const image = texture.context.createImageData(width, height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      image.data[o] = Math.round(255 * noiseSample(x / width, y / height, 0, seed));
      image.data[o + 1] = Math.round(255 * noiseSample(x / width, y / height, 1, seed));
      image.data[o + 2] = 128;
      image.data[o + 3] = 255;
    }
  }
  texture.context.putImageData(image, 0, 0);
  texture.refresh();
  // Linear filtering, or the small map would show as blocks of displacement.
  texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
}

/**
 * The camera colour grade, underwater look, heat haze and vignette (plan 2.5, layer 17).
 *
 * A camera filter only processes that camera's own render, and every filter is an extra full-target
 * pass, so the grade goes on the two cameras whose pixels set the picture: the Sky camera and the
 * Game (world) camera. The additive glow and the dark front mist/canopy stay ungraded, which keeps
 * light colours vivid. The Front camera, drawn last, carries the vignette over everything. Total:
 * two colour-matrix passes + one vignette pass, plus one displacement pass only while it is needed.
 * Low quality (features.cameraFilters false) leaves every filter inactive: no extra passes.
 *
 * The Game scene creates it and calls `update()` once per frame after `visual.update()`; the Sky and
 * Front scenes find it with `CameraGrade.of(visual)` and register their cameras.
 */
export class CameraGrade {
  static of(visual: VisualState): CameraGrade | undefined {
    return instances.get(visual);
  }

  private readonly matrix = new Float32Array(MATRIX_SIZE);
  private readonly applied = new Float32Array(MATRIX_SIZE);
  private readonly params: GradeParams = {
    tint: 0xffffff,
    saturation: 1,
    contrast: 1,
    brightness: 1,
  };
  private readonly colourFilters: Phaser.Filters.ColorMatrix[] = [];
  private displacement: Phaser.Filters.Displacement | null = null;
  private vignette: Phaser.Filters.Vignette | null = null;
  private underwaterMix = 0;
  private lastTime = Number.NaN;
  private pending = true;

  /** `scene` is the Game scene; its main camera is the world camera. */
  constructor(
    scene: Phaser.Scene,
    private readonly visual: VisualState,
  ) {
    instances.set(visual, this);
    const camera = scene.cameras.main;
    this.addGradeCamera(camera);
    makeNoiseTexture(scene);
    const list = camera.filters?.internal;
    if (list) {
      this.displacement = list.addDisplacement(NOISE_KEY, 0, 0);
      this.displacement.setActive(false);
    }
  }

  /** Puts a colour-matrix filter on this camera, kept in step with the world's grade. */
  addGradeCamera(camera: Phaser.Cameras.Scene2D.Camera): void {
    const list = camera.filters?.internal;
    if (!list) return;
    const filter = list.addColorMatrix();
    filter.setActive(false);
    this.colourFilters.push(filter);
    this.pending = true;
  }

  /** Puts the vignette on this camera (the last one drawn). */
  addVignetteCamera(camera: Phaser.Cameras.Scene2D.Camera): void {
    const list = camera.filters?.internal;
    if (!list) return;
    const v = GRADE.vignette;
    this.vignette = list.addVignette(0.5, 0.5, v.radius, v.strengthDay, v.color);
    this.vignette.setActive(false);
  }

  update(): void {
    const visual = this.visual;
    const enabled = visual.features.cameraFilters;
    const dt = Number.isNaN(this.lastTime)
      ? 0
      : Math.min(0.1, Math.max(0, visual.realTime - this.lastTime));
    this.lastTime = visual.realTime;
    this.updateGrade(enabled, dt);
    this.updateDisplacement(enabled);
    this.updateVignette(enabled);
  }

  private updateGrade(enabled: boolean, dt: number): void {
    const visual = this.visual;
    const w = visual.weights;
    const u = GRADE.underwater;
    this.underwaterMix = stepToward(
      this.underwaterMix,
      visual.underwater ? 1 : 0,
      dt / u.fadeSeconds,
    );
    const k = this.underwaterMix;
    const p = this.params;
    p.tint = mixColor(blendColor(w, pickTint), u.tint, k);
    p.saturation = blendNumber(w, pickSaturation) * (1 - k) + u.saturation * k;
    p.contrast = blendNumber(w, pickContrast) * (1 - k) + u.contrast * k;
    p.brightness = blendNumber(w, pickBrightness) * (1 - k) + u.brightness * k;
    gradeMatrix(p, this.matrix);

    const needed = enabled && !isIdentity(this.matrix, GRADE.matrixEpsilon);
    const changed = this.pending || matrixChanged(this.matrix, this.applied, GRADE.matrixEpsilon);
    for (const filter of this.colourFilters) {
      if (filter.active !== needed) filter.setActive(needed);
      if (needed && changed) filter.colorMatrix.set(this.matrix);
    }
    if (needed && changed) {
      this.applied.set(this.matrix);
      this.pending = false;
    }
  }

  private updateDisplacement(enabled: boolean): void {
    const filter = this.displacement;
    if (!filter) return;
    const visual = this.visual;
    const haze = blendNumber(visual.weights, pickHeatHaze) * GRADE.heatHaze.amount;
    const wobble = this.underwaterMix * GRADE.underwater.wobbleAmount;
    const amount = enabled ? Math.max(haze, wobble) : 0;
    const on = amount > GRADE.minDisplacement;
    if (filter.active !== on) filter.setActive(on);
    if (!on) return;
    // The map is fixed, so rotate the push direction through it: the picture ripples in place.
    const hz = wobble >= haze ? GRADE.underwater.wobbleHz : GRADE.heatHaze.hz;
    const angle = visual.realTime * hz * TAU;
    filter.x = amount * Math.sin(angle);
    filter.y = amount * Math.cos(angle * 0.8);
  }

  private updateVignette(enabled: boolean): void {
    const filter = this.vignette;
    if (!filter) return;
    if (filter.active !== enabled) filter.setActive(enabled);
    if (!enabled) return;
    const v = GRADE.vignette;
    filter.strength = v.strengthDay + (v.strengthNight - v.strengthDay) * this.visual.night;
  }
}
