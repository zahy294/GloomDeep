import * as Phaser from 'phaser';
import { PALETTE } from '../../data/palette';
import { Simulation } from '../../sim/Simulation';
import type { UiBridge } from '../../ui/bridge';
import { SceneKey } from './keys';

/** The in-game scene. M0: an empty world that drives the fixed-timestep simulation. */
export class GameScene extends Phaser.Scene {
  private sim!: Simulation;

  constructor(private readonly bridge: UiBridge) {
    super(SceneKey.Game);
  }

  init(): void {
    // Fresh state on every (re)start; the constructor only runs once.
    this.sim = new Simulation();
  }

  create(): void {
    this.cameras.main.setBackgroundColor(PALETTE.tealShadow[1]);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.sim.events.clear());
    this.bridge.set({ screen: 'game' });
  }

  override update(_time: number, delta: number): void {
    this.sim.update(delta);
  }

  /** Read by Playwright and the future debug overlay. */
  get simulation(): Simulation {
    return this.sim;
  }
}
