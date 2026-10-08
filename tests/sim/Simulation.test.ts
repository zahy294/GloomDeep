import { describe, expect, it } from 'vitest';
import { FixedStepLoop } from '../../src/sim/FixedStepLoop';
import { Simulation } from '../../src/sim/Simulation';

describe('FixedStepLoop', () => {
  it('runs one step per fixed interval regardless of how frame time is split', () => {
    let steps = 0;
    // 50 Hz gives an exact 20 ms step, so the test isn't at the mercy of float rounding.
    const loop = new FixedStepLoop(50, 100, () => steps++);

    // 1 second delivered as uneven frames.
    for (const ms of [7, 9, 16.5, 33.5, 4, 100, 830]) loop.advance(ms);

    expect(steps).toBe(50);
    expect(loop.alpha).toBeCloseTo(0, 5);
  });

  it('reports interpolation alpha for a partial step', () => {
    const loop = new FixedStepLoop(60, 5, () => {});
    loop.advance(1000 / 60 / 2);
    expect(loop.alpha).toBeCloseTo(0.5, 5);
  });

  it('caps catch-up steps and drops the backlog after a long stall', () => {
    let steps = 0;
    const loop = new FixedStepLoop(60, 5, () => steps++);

    const ran = loop.advance(10_000);

    expect(ran).toBe(5);
    expect(steps).toBe(5);
    expect(loop.alpha).toBeLessThan(1);
    expect(loop.droppedMs).toBeGreaterThan(9_000);
  });

  it('ignores zero, negative and NaN frame times', () => {
    let steps = 0;
    const loop = new FixedStepLoop(60, 5, () => steps++);
    loop.advance(0);
    loop.advance(-50);
    loop.advance(Number.NaN);
    expect(steps).toBe(0);
    expect(loop.alpha).toBe(0);
  });
});

describe('Simulation', () => {
  it('emits a stepped event with an increasing step number for every fixed step', () => {
    const sim = new Simulation(60, 10);
    const seen: number[] = [];
    sim.events.on('stepped', ({ step }) => seen.push(step));

    sim.update(55); // three full 16.67 ms steps plus a partial one

    expect(seen).toEqual([1, 2, 3]);
    expect(sim.steps).toBe(3);
  });
});
