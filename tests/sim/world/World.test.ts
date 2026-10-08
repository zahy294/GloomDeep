import { describe, expect, it } from 'vitest';
import { EventBus, type SimEvents } from '../../../src/sim/events';
import { findOpenFeetRow } from '../../../src/sim/world/queries';
import { AIR, World } from '../../../src/sim/world/World';

const STONE = 4;

describe('World', () => {
  it('splits into chunks, rounding partial chunks up', () => {
    const world = new World({ width: 300, height: 130, chunkSize: 128 });
    expect(world.chunksX).toBe(3);
    expect(world.chunksY).toBe(2);
    expect(world.chunks).toHaveLength(6);
    expect(world.chunkAt(2, 1)).toMatchObject({ x0: 256, y0: 128 });
    expect(world.chunkAt(3, 0)).toBeUndefined();
  });

  it('set() writes the tile, bumps only that chunk and emits tileChanged', () => {
    const events = new EventBus<SimEvents>();
    const world = new World({ width: 256, height: 128, chunkSize: 128 }, events);
    const seen: object[] = [];
    events.on('tileChanged', (e) => seen.push({ ...e }));

    world.set(200, 5, STONE);

    expect(world.get(200, 5)).toBe(STONE);
    expect(world.chunkAt(1, 0)?.version).toBe(1);
    expect(world.chunkAt(0, 0)?.version).toBe(0);
    expect(seen).toEqual([{ x: 200, y: 5, id: STONE, previous: AIR, layer: 'fg' }]);

    world.setBg(3, 3, STONE);
    expect(seen[1]).toEqual({ x: 3, y: 3, id: STONE, previous: AIR, layer: 'bg' });
  });

  it('ignores no-op and out-of-bounds writes', () => {
    const events = new EventBus<SimEvents>();
    const world = new World({ width: 16, height: 16, chunkSize: 8 }, events);
    let count = 0;
    events.on('tileChanged', () => count++);

    world.set(1, 1, AIR);
    world.set(-1, 0, STONE);
    world.set(16, 0, STONE);

    expect(count).toBe(0);
    expect(world.chunks.every((c) => c.version === 0)).toBe(true);
  });

  it('treats outside the world as solid air-less boundary', () => {
    const world = new World({ width: 4, height: 4, chunkSize: 4 });
    expect(world.isSolid(-1, 0)).toBe(true);
    expect(world.isSolid(0, 4)).toBe(true);
    expect(world.isSolid(0, 0)).toBe(false);
    world.set(0, 0, STONE);
    expect(world.isSolid(0, 0)).toBe(true);
    expect(world.get(99, 99)).toBe(AIR);
  });
});

describe('findOpenFeetRow', () => {
  it('returns the row itself when the body already fits', () => {
    const world = new World({ width: 8, height: 12, chunkSize: 4 });
    for (let x = 0; x < 8; x++) world.set(x, 10, STONE);
    expect(findOpenFeetRow(world, 3, 10, 3)).toBe(10);
  });

  it('moves up out of solid ground until the body fits', () => {
    const world = new World({ width: 8, height: 12, chunkSize: 4 });
    for (let y = 6; y < 12; y++) for (let x = 0; x < 8; x++) world.set(x, y, STONE);
    expect(findOpenFeetRow(world, 3, 10, 3)).toBe(6);
  });
});
