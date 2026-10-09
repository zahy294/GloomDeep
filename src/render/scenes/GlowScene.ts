import * as Phaser from 'phaser';
import { AMBIENT } from '../../config';
import type { EventBus, SimEvents } from '../../sim/events';
import type { World } from '../../sim/world/World';
import { AmbientGlowParticles } from '../AmbientGlowParticles';
import { LightShafts, SHAFT_TEXTURE } from '../LightShafts';
import type { VisualState } from '../VisualState';
import { SceneKey, TextureKey } from './keys';

/**
 * Holds the additive glow halos (plan 2.2 layer 14), rendered after the Game scene straight onto
 * the canvas. Phaser's ADD blend is `[ONE, DST_ALPHA]`: on the opaque canvas that's plain additive
 * light, but inside the Game camera's transparent composite framebuffer overlapping halos scaled
 * each other's colour by a fractional alpha and left visible square edges. The Game scene keeps
 * this camera's scroll in step with its own.
 *
 * Also draws the canopy light shafts and the glowing motes/fireflies/spores/embers, which need
 * the same additive blending. On Low quality (`features.glow` false) shaft motes are dropped and
 * every particle count is halved on top of the density setting.
 */
export class GlowScene extends Phaser.Scene {
  protected visual!: VisualState;
  private shafts: LightShafts | null = null;
  private particles: AmbientGlowParticles | null = null;
  private world: World | null = null;
  private events_: EventBus<SimEvents> | null = null;

  constructor() {
    super(SceneKey.Glow);
  }

  init(data: { visual: VisualState }): void {
    this.visual = data.visual;
    this.shafts = null;
    this.particles = null;
  }

  create(): void {
    const { features } = this.visual;
    const factor = features.glow ? 1 : AMBIENT.lowQualityFactor;
    this.shafts = new LightShafts(this, this.visual, SHAFT_TEXTURE);
    this.particles = new AmbientGlowParticles(
      this,
      this.visual,
      this.shafts,
      features.particleDensity * factor,
      features.glow,
      TextureKey.sprites,
      TextureKey.particle,
    );
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.shafts?.destroy());
    if (this.world && this.events_) this.attachWorld(this.world, this.events_);
  }

  /** Gives the shafts and fireflies the world (canopy gaps, ground height). Call once per game. */
  attachWorld(world: World, events: EventBus<SimEvents>): void {
    this.world = world;
    this.events_ = events;
    this.shafts?.attach(world, events);
    this.particles?.attach(world);
  }

  override update(_time: number, delta: number): void {
    this.shafts?.update();
    this.particles?.update(delta / 1000);
  }

  /** Follows the world camera exactly (same zoom, whole-pixel scroll). */
  follow(camera: Phaser.Cameras.Scene2D.Camera): void {
    this.cameras.main.setScroll(camera.scrollX, camera.scrollY);
  }
}
