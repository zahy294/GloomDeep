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

const STONE = 4;

/** A 40×20 world with a stone floor at row 15; spawn on the floor in the middle. */
function smallSim(): Simulation {
  return new Simulation({
    size: { width: 40, height: 20, chunkSize: 16 },
    generate: (world) => {
      for (let y = 15; y < 20; y++) for (let x = 0; x < 40; x++) world.set(x, y, STONE);
      return { spawnX: 20 * 16, spawnY: 15 * 16 };
    },
    stepsPerSecond: 60,
    maxStepsPerFrame: 10,
  });
}

describe('Simulation', () => {
  it('spawns the player standing on the generated ground', () => {
    const sim = smallSim();
    for (let i = 0; i < 12; i++) sim.update(1000 / 60);
    expect(sim.player.onGround).toBe(true);
    expect(sim.player.body.y + sim.player.body.height).toBeCloseTo(15 * 16, 6);
  });

  it('moves the player from input actions', () => {
    const sim = smallSim();
    const startX = sim.player.body.x;
    sim.input.setHeld('moveRight', true);
    for (let i = 0; i < 30; i++) sim.update(1000 / 60); // half a second of frames
    expect(sim.player.body.x).toBeGreaterThan(startX + 20);
  });

  it('emits a stepped event with an increasing step number for every fixed step', () => {
    const sim = smallSim();
    const seen: number[] = [];
    sim.events.on('stepped', ({ step }) => seen.push(step));

    sim.update(55); // three full 16.67 ms steps plus a partial one

    expect(seen).toEqual([1, 2, 3]);
    expect(sim.steps).toBe(3);
  });
});
