/**
 * Turns variable frame times into a whole number of fixed-size steps.
 * `alpha` is how far we are between the last step and the next (0..1), for render interpolation.
 */
export class FixedStepLoop {
  readonly stepMs: number;
  private accumulatorMs = 0;
  /** Milliseconds thrown away because a frame needed more than `maxStepsPerFrame` steps. */
  droppedMs = 0;

  constructor(
    stepsPerSecond: number,
    private readonly maxStepsPerFrame: number,
    private readonly step: () => void,
  ) {
    this.stepMs = 1000 / stepsPerSecond;
  }

  /** Advances by `frameMs` of real time and returns how many steps ran. */
  advance(frameMs: number): number {
    if (!(frameMs > 0)) return 0;
    this.accumulatorMs += frameMs;

    let steps = 0;
    while (this.accumulatorMs >= this.stepMs && steps < this.maxStepsPerFrame) {
      this.step();
      this.accumulatorMs -= this.stepMs;
      steps++;
    }

    if (this.accumulatorMs >= this.stepMs) {
      // Keep the partial step so interpolation stays smooth; drop the rest of the backlog.
      const kept = this.accumulatorMs % this.stepMs;
      this.droppedMs += this.accumulatorMs - kept;
      this.accumulatorMs = kept;
    }
    return steps;
  }

  get alpha(): number {
    return this.accumulatorMs / this.stepMs;
  }
}
