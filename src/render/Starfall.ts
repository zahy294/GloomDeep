import * as Phaser from 'phaser';
import { ATMOSPHERE, DISPLAY } from '../config';
import { mulberry32 } from '../sim/random';
import { TextureKey } from './scenes/keys';
import type { VisualState } from './VisualState';

const POOL = 3;
const FADE_IN = 0.2;

interface Streak {
  readonly image: Phaser.GameObjects.Image;
  age: number;
  duration: number;
  x: number;
  y: number;
  dx: number;
  dy: number;
}

/** Occasional shooting stars across the upper sky on clear nights (plan 2.4). */
export class Starfall {
  private readonly streaks: Streak[] = [];
  private readonly random = mulberry32(ATMOSPHERE.starfall.seed);

  constructor(private readonly scene: Phaser.Scene) {
    for (let i = 0; i < POOL; i++) {
      const image = scene.add
        .image(0, 0, TextureKey.particle)
        .setOrigin(1, 0.5)
        .setDepth(0.5)
        .setScale(ATMOSPHERE.starfall.length / 2, 0.5)
        .setVisible(false);
      this.streaks.push({ image, age: 0, duration: 0, x: 0, y: 0, dx: 0, dy: 0 });
    }
  }

  update(visual: VisualState, dt: number): void {
    const cfg = ATMOSPHERE.starfall;
    const clear = visual.night >= cfg.minNight && visual.rain <= cfg.maxRain;
    if (clear && this.random() < (cfg.perMinute / 60) * dt) this.spawn();
    for (const s of this.streaks) {
      if (!s.image.visible) continue;
      s.age += dt;
      const t = s.age / s.duration;
      if (t >= 1) {
        s.image.setVisible(false);
        continue;
      }
      s.image.setPosition(s.x + s.dx * t, s.y + s.dy * t);
      // Quick fade in, long fade out.
      const alpha = t < FADE_IN ? t / FADE_IN : (1 - t) / (1 - FADE_IN);
      s.image.setAlpha(alpha * visual.day.stars);
    }
  }

  private spawn(): void {
    const s = this.streaks.find((streak) => !streak.image.visible);
    if (!s) return;
    const cfg = ATMOSPHERE.starfall;
    s.x = this.random() * DISPLAY.width;
    s.y = this.random() * this.scene.scale.height * cfg.band;
    const direction = this.random() < 0.5 ? -1 : 1;
    s.dx = direction * cfg.travel;
    s.dy = cfg.travel * 0.45;
    s.age = 0;
    s.duration = (cfg.durationMin + this.random() * (cfg.durationMax - cfg.durationMin)) / 1000;
    s.image.setRotation(Math.atan2(s.dy, s.dx)).setAlpha(0).setVisible(true);
  }
}
