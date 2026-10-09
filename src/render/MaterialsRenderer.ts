import * as Phaser from 'phaser';
import { MATERIALS_VIEW, TILE_SIZE } from '../config';
import { lightByKey } from '../data/lights';
import { PALETTE } from '../data/palette';
import type { EventBus, SimEvents } from '../sim/events';
import { FALLING_INSET, type FallingBlock } from '../sim/systems/FallingSystem';
import type { FireSystem } from '../sim/systems/FireSystem';
import { iconFrame } from '../sim/world/autotile';
import type { World } from '../sim/world/World';
import type { Rect } from './chunkMath';
import { Depth } from './depth';
import { FLAME_FRAMES } from './liquidFrames';
import { TextureKey } from './scenes/keys';

const FIRE_COLOR = (() => {
  const c = lightByKey('fire').color;
  return ((c[0] ?? 0) << 16) | ((c[1] ?? 0) << 8) | (c[2] ?? 0);
})();

/**
 * What M9's materials look like (plan 2.7, 2.8): flames over burning cells (animated, with an
 * additive glow and rising embers and smoke), splashes where something enters water or lava,
 * steam where lava turns to obsidian, falling silt and gravel, and a dust puff where they land.
 * Flames are pooled and drawn only for burning cells in view.
 */
export class MaterialsRenderer {
  private readonly splash: Phaser.GameObjects.Particles.ParticleEmitter;
  private readonly steam: Phaser.GameObjects.Particles.ParticleEmitter;
  private readonly embers: Phaser.GameObjects.Particles.ParticleEmitter;
  private readonly flames: Phaser.GameObjects.Image[] = [];
  private readonly halos: Phaser.GameObjects.Image[] = [];
  private readonly blockImages: Phaser.GameObjects.Image[] = [];
  private emberClock = 0;
  private readonly unsubscribe: (() => void)[];

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly glowScene: Phaser.Scene,
    events: EventBus<SimEvents>,
    private readonly world: World,
    private readonly fire: FireSystem,
    private readonly blocks: readonly FallingBlock[],
  ) {
    const v = MATERIALS_VIEW;
    this.splash = scene.add
      .particles(0, 0, TextureKey.particle, {
        emitting: false,
        lifespan: v.splashLifeMs,
        speed: { min: v.splashSpeedMin, max: v.splashSpeedMax },
        angle: { min: 230, max: 310 },
        gravityY: v.splashGravity,
        alpha: { start: 1, end: 0 },
      })
      .setDepth(Depth.particles);
    this.steam = glowScene.add.particles(0, 0, TextureKey.glow, {
      emitting: false,
      lifespan: v.steamLifeMs,
      speed: { min: v.steamSpeedMin, max: v.steamSpeedMax },
      angle: { min: 250, max: 290 },
      gravityY: -v.steamLift,
      scale: { start: v.steamScaleStart, end: v.steamScaleEnd },
      alpha: { start: v.steamAlpha, end: 0 },
      tint: PALETTE.moonSilver[3],
    });
    this.embers = glowScene.add.particles(0, 0, TextureKey.particle, {
      emitting: false,
      lifespan: v.emberLifeMs,
      speed: { min: v.emberSpeedMin, max: v.emberSpeedMax },
      angle: { min: 240, max: 300 },
      gravityY: -v.emberLift,
      alpha: { start: 1, end: 0 },
      tint: [PALETTE.ember[3], PALETTE.honey[3], PALETTE.ember[2]],
      blendMode: Phaser.BlendModes.ADD,
    });

    this.unsubscribe = [
      events.on('splash', ({ x, y, lava }) => {
        this.splash.setParticleTint(
          lava ? [PALETTE.ember[2], PALETTE.honey[3]] : [PALETTE.cyan[2], PALETTE.cyan[3]],
        );
        this.splash.explode(v.splashCount, x, y);
      }),
      events.on('liquidReaction', ({ x, y }) => {
        this.steam.explode(v.steamCount, (x + 0.5) * TILE_SIZE, y * TILE_SIZE);
      }),
      events.on('blockLanded', ({ x, y }) => {
        this.splash.setParticleTint([PALETTE.stone[2], PALETTE.mud[2]]);
        this.splash.explode(v.dustCount, (x + 0.5) * TILE_SIZE, (y + 1) * TILE_SIZE);
      }),
    ];
  }

  update(view: Rect, alpha: number, dt: number, time: number): void {
    this.drawFlames(view, dt, time);
    this.drawBlocks(alpha);
  }

  destroy(): void {
    for (const off of this.unsubscribe) off();
    for (const list of [this.flames, this.halos, this.blockImages])
      for (const i of list) i.destroy();
    this.splash.destroy();
    this.steam.destroy();
    this.embers.destroy();
  }

  private drawFlames(view: Rect, dt: number, time: number): void {
    const v = MATERIALS_VIEW;
    const W = this.world.width;
    const x0 = Math.floor(view.x / TILE_SIZE) - 1;
    const y0 = Math.floor(view.y / TILE_SIZE) - 1;
    const x1 = Math.ceil((view.x + view.width) / TILE_SIZE) + 1;
    const y1 = Math.ceil((view.y + view.height) / TILE_SIZE) + 1;
    this.emberClock += dt;
    const emitEmbers = this.emberClock >= v.emberInterval;
    if (emitEmbers) this.emberClock = 0;
    let n = 0;
    for (const key of this.fire.burning.keys()) {
      if (n >= v.maxFlames) break;
      const i = key >= 0 ? key : -key - 1;
      const x = i % W;
      const y = (i - x) / W;
      if (x < x0 || x > x1 || y < y0 || y > y1) continue;
      const wall = key < 0;
      const flame = this.flame(n);
      const halo = this.halo(n);
      const phase = x * v.flamePhaseX + y * v.flamePhaseY;
      const frame = (Math.floor(time * v.flameRate + phase) % FLAME_FRAMES) + 1;
      const px = (x + 0.5) * TILE_SIZE;
      const py = (y + 1) * TILE_SIZE;
      flame
        .setFrame(frame)
        .setPosition(px, py)
        .setAlpha(wall ? v.wallFlameAlpha : 1)
        .setDepth(wall ? Depth.backgroundWalls + 0.5 : Depth.particles)
        .setVisible(true);
      halo.setPosition(px, py - TILE_SIZE / 2).setVisible(true);
      if (emitEmbers && (x + y + n) % v.emberEvery === 0)
        this.embers.explode(1, px, py - TILE_SIZE);
      n++;
    }
    for (let k = n; k < this.flames.length; k++) {
      this.flames[k]?.setVisible(false);
      this.halos[k]?.setVisible(false);
    }
  }

  private flame(k: number): Phaser.GameObjects.Image {
    while (this.flames.length <= k) {
      this.flames.push(this.scene.add.image(0, 0, TextureKey.flames, 1).setOrigin(0.5, 1));
    }
    return this.flames[k] as Phaser.GameObjects.Image;
  }

  private halo(k: number): Phaser.GameObjects.Image {
    while (this.halos.length <= k) {
      this.halos.push(
        this.glowScene.add
          .image(0, 0, TextureKey.glow)
          .setTint(FIRE_COLOR)
          .setAlpha(MATERIALS_VIEW.flameHaloAlpha)
          .setDisplaySize(MATERIALS_VIEW.flameHaloPx, MATERIALS_VIEW.flameHaloPx)
          .setBlendMode(Phaser.BlendModes.ADD),
      );
    }
    return this.halos[k] as Phaser.GameObjects.Image;
  }

  private drawBlocks(alpha: number): void {
    while (this.blockImages.length < this.blocks.length) {
      this.blockImages.push(
        this.scene.add.image(0, 0, TextureKey.tiles, 0).setOrigin(0, 0).setDepth(Depth.entities),
      );
    }
    for (let k = 0; k < this.blockImages.length; k++) {
      const image = this.blockImages[k];
      const block = this.blocks[k];
      if (!image) continue;
      if (!block) {
        image.setVisible(false);
        continue;
      }
      const b = block.body;
      const x = block.prevX + (b.x - block.prevX) * alpha - FALLING_INSET;
      const y = block.prevY + (b.y - block.prevY) * alpha;
      image
        .setFrame(iconFrame(block.tile))
        .setPosition(Math.round(x), Math.round(y))
        .setVisible(true);
    }
  }
}
