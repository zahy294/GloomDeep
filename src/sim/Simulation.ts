import { SIM } from '../config';
import { EventBus, type SimEvents } from './events';
import { FixedStepLoop } from './FixedStepLoop';

/** Owns the game state and advances it at a fixed rate. Contains no rendering code. */
export class Simulation {
  readonly events = new EventBus<SimEvents>();
  private readonly loop: FixedStepLoop;
  private stepCount = 0;
  /** Reused every step so the fixed loop doesn't allocate. Listeners must not keep a reference. */
  private readonly steppedPayload = { step: 0 };

  constructor(
    stepsPerSecond: number = SIM.stepsPerSecond,
    maxStepsPerFrame: number = SIM.maxStepsPerFrame,
  ) {
    this.loop = new FixedStepLoop(stepsPerSecond, maxStepsPerFrame, () => this.step());
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

  private step(): void {
    this.stepCount++;
    // Systems will run here in a fixed order (input → player → physics → ...), starting in M1.
    this.steppedPayload.step = this.stepCount;
    this.events.emit('stepped', this.steppedPayload);
  }
}
