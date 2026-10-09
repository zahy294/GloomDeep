import { describe, expect, it } from 'vitest';
import { LIGHT } from '../../../src/config';
import { TILES, tileId } from '../../../src/data/tiles';
import { EventBus, type SimEvents } from '../../../src/sim/events';
import { hasSupport } from '../../../src/sim/systems/BuildingSystem';
import { tileFrame } from '../../../src/sim/world/autotile';
import { DecorSupport, decorSupported } from '../../../src/sim/world/decor';
import { World } from '../../../src/sim/world/World';

const STONE = tileId('stone');
const SOIL = tileId('forest_soil');
const LEAVES = tileId('elder_leaves');
const BRANCH = tileId('branch');
const TUFT = tileId('grass_tuft');
const VINE = tileId('hanging_vine');

function setup() {
  const events = new EventBus<SimEvents>();
  const world = new World({ width: 16, height: 16, chunkSize: 8 }, events);
  const support = new DecorSupport(world, events);
  const drops: number[] = [];
  const step = () => support.update((item) => drops.push(item));
  return { world, step, drops };
}

describe('decorations', () => {
  it('stand on ground, branches and hang from ceilings, leaves and each other', () => {
    const { world } = setup();
    world.set(2, 10, SOIL);
    world.set(4, 10, BRANCH);
    world.set(6, 3, LEAVES);
    world.set(6, 4, VINE);
    expect(decorSupported(world, 2, 9, TUFT)).toBe(true);
    expect(decorSupported(world, 4, 9, TUFT)).toBe(true);
    expect(decorSupported(world, 8, 9, TUFT)).toBe(false); // nothing below
    expect(decorSupported(world, 6, 4, VINE)).toBe(true);
    expect(decorSupported(world, 6, 5, VINE)).toBe(true); // hangs from the vine above
    expect(decorSupported(world, 9, 5, VINE)).toBe(false);
  });

  it('a tuft disappears when the ground under it is mined', () => {
    const { world, step } = setup();
    world.set(2, 10, SOIL);
    world.set(2, 9, TUFT);
    step();
    expect(world.get(2, 9)).toBe(TUFT);
    world.set(2, 10, 0);
    step();
    expect(world.get(2, 9)).toBe(0);
  });

  it('cutting the top of a vine chain brings the whole chain down in one step', () => {
    const { world, step } = setup();
    world.set(5, 2, STONE);
    for (let y = 3; y <= 8; y++) world.set(5, y, VINE);
    step();
    world.set(5, 2, 0);
    step();
    for (let y = 3; y <= 8; y++) expect(world.get(5, y)).toBe(0);
  });

  it('is not drawn by the tilemap (the foliage renderer draws it)', () => {
    const { world } = setup();
    world.set(2, 10, SOIL);
    world.set(2, 9, TUFT);
    expect(tileFrame(world, 'fg', 2, 9)).toBe(-1);
    expect(tileFrame(world, 'fg', 2, 10)).toBeGreaterThanOrEqual(0);
  });

  it('placing a decoration needs its own support; blocks may replace one', () => {
    const { world } = setup();
    world.set(2, 10, SOIL);
    expect(hasSupport(world, 'fg', 2, 9, TUFT)).toBe(true);
    expect(hasSupport(world, 'fg', 9, 3, TUFT)).toBe(false);
  });

  it('a block cannot be built off a flower or a hanging vine alone', () => {
    const { world } = setup();
    world.set(5, 2, STONE);
    world.set(5, 3, VINE);
    expect(hasSupport(world, 'fg', 6, 3, STONE)).toBe(false); // only the vine beside it
    expect(hasSupport(world, 'fg', 6, 2, STONE)).toBe(true); // the stone beside it
  });
});

describe('leaf canopies and the skyline', () => {
  it('leaves filter sunlight (dappled shade) without being solid or moving the skyline', () => {
    const { world } = setup();
    world.set(3, 12, SOIL);
    expect(world.skyline[3]).toBe(12);
    expect(world.canopyShade[3]).toBe(1);
    world.set(3, 4, LEAVES);
    world.set(3, 5, LEAVES);
    expect(world.skyline[3]).toBe(12);
    expect(world.groundRow(3)).toBe(12);
    expect(world.isSolid(3, 4)).toBe(false);
    expect(world.canopyTop[3]).toBe(4);
    const pass = TILES[LEAVES]?.sunTransmit ?? 1;
    expect(world.canopyShade[3]).toBeCloseTo(Math.max(LIGHT.canopyMinSun, pass * pass), 6);
    world.set(3, 4, 0);
    world.set(3, 5, 0);
    expect(world.canopyTop[3]).toBe(16);
    expect(world.canopyShade[3]).toBe(1);
  });

  it('a thick canopy never gets darker than the configured minimum', () => {
    const { world } = setup();
    world.set(3, 15, SOIL);
    for (let y = 0; y < 14; y++) world.set(3, y, LEAVES);
    expect(world.canopyShade[3]).toBeCloseTo(LIGHT.canopyMinSun, 6);
  });

  it('branches are platforms, neither solid nor shading the ground', () => {
    const { world } = setup();
    world.set(7, 6, BRANCH);
    expect(world.isPlatform(7, 6)).toBe(true);
    expect(world.isSolid(7, 6)).toBe(false);
    expect(world.skyline[7]).toBe(16);
    expect(world.canopyShade[7]).toBe(1);
  });
});
