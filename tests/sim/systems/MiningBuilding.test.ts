import { describe, expect, it } from 'vitest';
import { BUILDING, MINING, TILE_SIZE } from '../../../src/config';
import { itemId } from '../../../src/data/items';
import { TILES, tileId } from '../../../src/data/tiles';
import { createPlayer } from '../../../src/sim/entities/Player';
import { EventBus, type SimEvents } from '../../../src/sim/events';
import { ActionState } from '../../../src/sim/input';
import { Inventory } from '../../../src/sim/inventory/Inventory';
import {
  createBuildingState,
  hasSupport,
  updateBuilding,
} from '../../../src/sim/systems/BuildingSystem';
import { createMiningState, updateMining } from '../../../src/sim/systems/MiningSystem';
import { AIR, World } from '../../../src/sim/world/World';

const DT = 1 / 60;
const T = TILE_SIZE;
const STONE = tileId('stone');
const SOIL = tileId('forest_soil');
const PLANKS = tileId('elderwood_planks');

/** 30×20 world, stone floor from row 15; player standing on it at tile column 10. */
function setup() {
  const events = new EventBus<SimEvents>();
  const world = new World({ width: 30, height: 20, chunkSize: 10 }, events);
  for (let y = 15; y < 20; y++) for (let x = 0; x < 30; x++) world.set(x, y, STONE);
  const player = createPlayer(10.5 * T, 15 * T);
  const input = new ActionState();
  const inventory = new Inventory();
  const log: string[] = [];
  events.on('tileDamaged', (e) => log.push(`damaged ${e.x},${e.y} ${e.stage}`));
  events.on('tileBroken', (e) => log.push(`broken ${e.x},${e.y} ${e.id} ${e.layer}`));
  events.on('tilePlaced', (e) => log.push(`placed ${e.x},${e.y} ${e.id} ${e.layer}`));
  return { events, world, player, input, inventory, log };
}

function aimAt(input: ActionState, tx: number, ty: number) {
  input.setAim((tx + 0.5) * T, (ty + 0.5) * T);
}

describe('MiningSystem', () => {
  it('breaks a tile after hardness / basePower seconds, with crack stages, and drops its item', () => {
    const { world, player, input, events, log } = setup();
    const state = createMiningState();
    const drops: { item: number; x: number; y: number }[] = [];
    const spawn = (item: number, _count: number, x: number, y: number) =>
      drops.push({ item, x, y });
    aimAt(input, 11, 15);
    input.setHeld('useItem', true);

    const hardness = TILES[STONE]?.hardness ?? 0;
    const steps = Math.ceil(hardness / MINING.basePower / DT);
    for (let i = 0; i < steps - 1; i++)
      updateMining(state, player, input, world, events, spawn, DT);
    expect(world.get(11, 15)).toBe(STONE);
    updateMining(state, player, input, world, events, spawn, DT);

    expect(world.get(11, 15)).toBe(AIR);
    expect(log.filter((l) => l.startsWith('damaged'))).toEqual([
      'damaged 11,15 1',
      'damaged 11,15 2',
      'damaged 11,15 3',
      'damaged 11,15 4',
      'damaged 11,15 0',
    ]);
    expect(log.at(-1)).toBe(`broken 11,15 ${STONE} fg`);
    expect(drops).toEqual([{ item: itemId('stone'), x: 11.5 * T, y: 15.5 * T }]);
    expect(world.damage.size).toBe(0);
  });

  it('resets progress when the button is released or the target changes', () => {
    const { world, player, input, events, log } = setup();
    const state = createMiningState();
    aimAt(input, 11, 15);
    input.setHeld('useItem', true);
    for (let i = 0; i < 20; i++) updateMining(state, player, input, world, events, () => {}, DT);
    expect(world.damage.size).toBe(1);

    aimAt(input, 9, 15);
    updateMining(state, player, input, world, events, () => {}, DT);
    expect(log).toContain('damaged 11,15 0');
    expect(world.damage.size).toBe(1);

    input.setHeld('useItem', false);
    updateMining(state, player, input, world, events, () => {}, DT);
    expect(world.damage.size).toBe(0);
    expect(log.at(-1)).toBe('damaged 9,15 0');
  });

  it('ignores tiles out of reach and air', () => {
    const { world, player, input, events } = setup();
    const state = createMiningState();
    input.setHeld('useItem', true);
    aimAt(input, 10 + MINING.reachTiles + 2, 15);
    for (let i = 0; i < 120; i++) updateMining(state, player, input, world, events, () => {}, DT);
    expect(world.get(10 + MINING.reachTiles + 2, 15)).toBe(STONE);
    aimAt(input, 11, 10);
    updateMining(state, player, input, world, events, () => {}, DT);
    expect(state.active).toBe(false);
  });

  it('mines background walls in wall mode, but only where no block covers them', () => {
    const { world, player, input, events, log } = setup();
    const state = createMiningState();
    world.setBg(12, 13, SOIL);
    world.setBg(12, 15, SOIL); // behind the stone floor
    input.setHeld('useItem', true);
    input.setHeld('wallMode', true);

    aimAt(input, 12, 15);
    for (let i = 0; i < 120; i++) updateMining(state, player, input, world, events, () => {}, DT);
    expect(world.getBg(12, 15)).toBe(SOIL);

    aimAt(input, 12, 13);
    for (let i = 0; i < 120; i++) updateMining(state, player, input, world, events, () => {}, DT);
    expect(world.getBg(12, 13)).toBe(AIR);
    expect(log).toContain(`broken 12,13 ${SOIL} bg`);
  });
});

describe('BuildingSystem', () => {
  it('places the selected block next to existing tiles and uses one item', () => {
    const { world, player, input, inventory, events, log } = setup();
    const state = createBuildingState();
    inventory.add(itemId('elderwood_planks'), 5);
    aimAt(input, 12, 14);
    input.setHeld('useAlt', true);

    updateBuilding(state, player, input, inventory, world, events, DT);

    expect(world.get(12, 14)).toBe(PLANKS);
    expect(inventory.selectedStack?.count).toBe(4);
    expect(log).toEqual([`placed 12,14 ${PLANKS} fg`]);
  });

  it('respects the placement interval while held', () => {
    const { world, player, input, inventory, events } = setup();
    const state = createBuildingState();
    inventory.add(itemId('elderwood_planks'), 5);
    input.setHeld('useAlt', true);
    aimAt(input, 12, 14);
    updateBuilding(state, player, input, inventory, world, events, DT);
    aimAt(input, 13, 14);
    updateBuilding(state, player, input, inventory, world, events, DT);
    expect(world.get(13, 14)).toBe(AIR);
    for (let t = 0; t < BUILDING.placeInterval; t += DT) {
      updateBuilding(state, player, input, inventory, world, events, DT);
    }
    expect(world.get(13, 14)).toBe(PLANKS);
  });

  it('refuses floating tiles, occupied tiles, the player’s own space and out-of-reach tiles', () => {
    const { world, player, input, inventory, events } = setup();
    const state = createBuildingState();
    inventory.add(itemId('stone'), 50);
    input.setHeld('useAlt', true);
    const tryAt = (tx: number, ty: number) => {
      state.cooldown = 0;
      aimAt(input, tx, ty);
      updateBuilding(state, player, input, inventory, world, events, DT);
    };

    tryAt(12, 10); // nothing around it
    tryAt(11, 15); // already stone
    tryAt(10, 14); // inside the player
    tryAt(10 + BUILDING.reachTiles + 2, 14);

    expect(inventory.selectedStack?.count).toBe(50);
    expect(world.get(12, 10)).toBe(AIR);
    expect(world.get(10, 14)).toBe(AIR);
  });

  it('places walls in wall mode, and a wall supports a block in front of it', () => {
    const { world, player, input, inventory, events } = setup();
    const state = createBuildingState();
    inventory.add(itemId('elderwood_planks'), 5);
    input.setHeld('useAlt', true);
    input.setHeld('wallMode', true);
    aimAt(input, 13, 14);
    updateBuilding(state, player, input, inventory, world, events, DT);
    expect(world.getBg(13, 14)).toBe(PLANKS);
    expect(world.get(13, 14)).toBe(AIR);

    expect(hasSupport(world, 'fg', 13, 12)).toBe(false);
    world.setBg(13, 12, PLANKS);
    expect(hasSupport(world, 'fg', 13, 12)).toBe(true);
  });

  it('does nothing with an empty slot', () => {
    const { world, player, input, inventory, events, log } = setup();
    const state = createBuildingState();
    input.setHeld('useAlt', true);
    aimAt(input, 12, 14);
    updateBuilding(state, player, input, inventory, world, events, DT);
    expect(log).toEqual([]);
  });
});
