import type * as Phaser from 'phaser';
import { FEEDBACK, TILE_SIZE } from '../config';
import { PALETTE } from '../data/palette';
import { TILES } from '../data/tiles';
import type { EventBus, SimEvents } from '../sim/events';
import type { MiningState } from '../sim/systems/MiningSystem';
import { Depth } from './depth';

/** Debris colours per tile id: the base, light and dark tones of its ramp. */
const DEBRIS_COLORS: readonly (number[] | null)[] = TILES.map((t) => {
  if (!t.placeholderRamp) return null;
  const [dark, base, light] = PALETTE[t.placeholderRamp];
  return [base, light, dark];
});

/**
 * Mining/placing feedback (plan 2.8): debris in the tile's colours while mining and when a tile
 * breaks, a small puff on placement, a sparkle on pickup. One emitter, re-tinted per burst.
 */
export class ParticleFX {
  private readonly emitter: Phaser.GameObjects.Particles.ParticleEmitter;
  private readonly unsubscribers: (() => void)[] = [];
  private mineAccumulator = 0;

  constructor(
    scene: Phaser.Scene,
    events: EventBus<SimEvents>,
    private readonly mining: MiningState,
    private readonly getTileId: (layer: 'fg' | 'bg', x: number, y: number) => number,
    textureKey: string,
    onBreak: () => void,
  ) {
    this.emitter = scene.add
      .particles(0, 0, textureKey, {
        emitting: false,
        lifespan: FEEDBACK.particleLifespanMs,
        speed: { min: FEEDBACK.particleSpeedMin, max: FEEDBACK.particleSpeedMax },
        angle: { min: 200, max: 340 },
        gravityY: FEEDBACK.particleGravity,
        alpha: { start: 1, end: 0 },
      })
      .setDepth(Depth.particles);

    this.unsubscribers.push(
      events.on('tileBroken', ({ x, y, id }) => {
        this.burst(id, x, y, FEEDBACK.breakParticles);
        onBreak();
      }),
      events.on('tilePlaced', ({ x, y, id }) => this.burst(id, x, y, FEEDBACK.placeParticles)),
      events.on('bounced', ({ x, y }) => {
        // A puff of spores from the glowcap.
        this.emitter.setParticleTint([PALETTE.mint[3], PALETTE.rose[3], PALETTE.mint[2]]);
        this.emitter.explode(FEEDBACK.bounceParticles, x, y);
      }),
      events.on('critterCaught', ({ x, y }) => {
        this.emitter.setParticleTint([PALETTE.leaf[3], PALETTE.honey[3]]);
        this.emitter.explode(FEEDBACK.catchParticles, x, y);
      }),
      events.on('itemPickedUp', ({ x, y }) => {
        this.emitter.setParticleTint([PALETTE.honey[3], PALETTE.mint[3]]);
        this.emitter.explode(3, x, y);
      }),
    );
  }

  /** Steady trickle of debris from the tile being mined. */
  update(dt: number): void {
    const { active, stage, layer, x, y } = this.mining;
    if (!active || stage === 0) {
      this.mineAccumulator = 0;
      return;
    }
    this.mineAccumulator += dt * FEEDBACK.mineParticlesPerSecond;
    const count = Math.floor(this.mineAccumulator);
    if (count === 0) return;
    this.mineAccumulator -= count;
    this.burst(this.getTileId(layer, x, y), x, y, count);
  }

  destroy(): void {
    for (const off of this.unsubscribers) off();
  }

  private burst(tileId: number, tx: number, ty: number, count: number): void {
    const colors = DEBRIS_COLORS[tileId];
    if (!colors) return;
    this.emitter.setParticleTint(colors);
    this.emitter.explode(count, (tx + 0.5) * TILE_SIZE, (ty + 0.5) * TILE_SIZE);
  }
}
