import { SIM } from '../config';
import { createPlayer, type Player } from './entities/Player';
import { EventBus, type SimEvents } from './events';
import { FixedStepLoop } from './FixedStepLoop';
import { ActionState } from './input';
import { updatePlayer } from './systems/PlayerSystem';
import { World, type WorldSize } from './world/World';

export interface SimulationOptions {
  size: WorldSize;
  /** Fills the freshly created world and returns the player spawn (feet-centre, pixels). */
  generate: (world: World) => { spawnX: number; spawnY: number };
  stepsPerSecond?: number;
  maxStepsPerFrame?: number;
}

/** Owns the game state and advances it at a fixed rate. Contains no rendering code. */
export class Simulation {
  readonly events = new EventBus<SimEvents>();
  readonly input = new ActionState();
  readonly world: World;
  readonly player: Player;
  private readonly loop: FixedStepLoop;
  private stepCount = 0;
  /** Reused every step so the fixed loop doesn't allocate. Listeners must not keep a reference. */
  private readonly steppedPayload = { step: 0 };

  constructor(options: SimulationOptions) {
    this.world = new World(options.size, this.events);
    const spawn = options.generate(this.world);
    this.player = createPlayer(spawn.spawnX, spawn.spawnY);
    this.loop = new FixedStepLoop(
      options.stepsPerSecond ?? SIM.stepsPerSecond,
      options.maxStepsPerFrame ?? SIM.maxStepsPerFrame,
      () => this.step(),
    );
  }

  /** Called once per rendered frame with the real elapsed time. Returns the steps run. */
  update(frameMs: number): number {
    return this.loop.advance(frameMs);
  }

  /** Interpolation factor between the previous and the current step, for rendering. */
  get alpha(): number {
    return this.loop.alpha;
  }

  get steps(): number {
    return this.stepCount;
  }

  get stepSeconds(): number {
    return this.loop.stepMs / 1000;
  }

  /** Entities currently simulated (just the player until M8). */
  get entityCount(): number {
    return 1;
  }

  private step(): void {
    this.stepCount++;
    updatePlayer(this.player, this.input, this.world, this.stepSeconds);
    this.steppedPayload.step = this.stepCount;
    this.events.emit('stepped', this.steppedPayload);
  }
}
