import { describe, expect, it } from 'vitest';
import { TEST_WORLD, TILE_SIZE } from '../../../src/config';
import { tileId } from '../../../src/data/tiles';
import { World, AIR } from '../../../src/sim/world/World';
import { generateTestWorld } from '../../../src/workers/worldgen/testWorld';

const SIZE = { width: 600, height: 300, chunkSize: 128 };

function fnv1a(data: Uint16Array): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < data.length; i++) h = Math.imul(h ^ (data[i] ?? 0), 0x01000193);
  return h >>> 0;
}

describe('test world generation', () => {
  it('same seed → identical world', () => {
    const a = new World(SIZE);
    const b = new World(SIZE);
    const spawnA = generateTestWorld(a, 42);
    const spawnB = generateTestWorld(b, 42);
    expect(fnv1a(a.fg)).toBe(fnv1a(b.fg));
    expect(fnv1a(a.bg)).toBe(fnv1a(b.bg));
    expect(spawnA).toEqual(spawnB);
  });

  it('different seeds → different worlds', () => {
    const a = new World(SIZE);
    const b = new World(SIZE);
    generateTestWorld(a, 1);
    generateTestWorld(b, 2);
    expect(fnv1a(a.fg)).not.toBe(fnv1a(b.fg));
  });

  it('spawns the player on solid grass with open air above, in the middle of the world', () => {
    const world = new World(SIZE);
    const { spawnX, spawnY } = generateTestWorld(world, 7);
    const tx = Math.floor(spawnX / TILE_SIZE);
    const ty = spawnY / TILE_SIZE;

    expect(Number.isInteger(ty)).toBe(true);
    expect(tx).toBe(SIZE.width / 2);
    expect(world.get(tx, ty)).toBe(tileId('elderglade_grass'));
    for (let dy = 1; dy <= 4; dy++) expect(world.get(tx, ty - dy)).toBe(AIR);
  });

  it('keeps a flat, cave-free clearing around the spawn', () => {
    const world = new World(SIZE);
    const { spawnY } = generateTestWorld(world, 7);
    const surface = spawnY / TILE_SIZE;
    const centre = SIZE.width / 2;
    for (
      let x = centre - TEST_WORLD.flatSpawnHalfWidth;
      x <= centre + TEST_WORLD.flatSpawnHalfWidth;
      x++
    ) {
      expect(world.get(x, surface)).toBe(tileId('elderglade_grass'));
      for (let d = 1; d < TEST_WORLD.caveMinDepth; d++)
        expect(world.isSolid(x, surface + d)).toBe(true);
    }
  });

  it('has caves underground and nothing solid in the sky', () => {
    const world = new World(SIZE);
    generateTestWorld(world, 3);
    let caveTiles = 0;
    for (let y = Math.floor(SIZE.height * 0.6); y < SIZE.height; y++) {
      for (let x = 0; x < SIZE.width; x++) if (world.get(x, y) === AIR) caveTiles++;
    }
    expect(caveTiles).toBeGreaterThan(0);
    for (let x = 0; x < SIZE.width; x++) expect(world.get(x, 0)).toBe(AIR);
  });

  it('marks every chunk as changed so the renderer uploads them', () => {
    const world = new World(SIZE);
    generateTestWorld(world, 1);
    for (const chunk of world.chunks) expect(chunk.version).toBeGreaterThan(0);
  });
});
