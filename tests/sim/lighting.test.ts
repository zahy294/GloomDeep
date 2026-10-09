import { describe, expect, it } from 'vitest';
import { LIGHT, LUMEN, TILE_SIZE } from '../../src/config';
import { DAY_KEYFRAMES, NAMED_TIMES } from '../../src/data/dayCycle';
import { itemId } from '../../src/data/items';
import { tileId } from '../../src/data/tiles';
import { sampleDayCycle } from '../../src/sim/dayCycle';
import { createPlayer } from '../../src/sim/entities/Player';
import { EventBus, type SimEvents } from '../../src/sim/events';
import { ActionState } from '../../src/sim/input';
import { Inventory } from '../../src/sim/inventory/Inventory';
import { lanternLit, updateLantern } from '../../src/sim/systems/LanternSystem';
import { Simulation } from '../../src/sim/Simulation';
import type { World } from '../../src/sim/world/World';

const STONE = tileId('stone');
const TORCH = tileId('torch');

describe('sampleDayCycle', () => {
  it('hits the keyframes exactly and wraps around midnight', () => {
    for (const key of DAY_KEYFRAMES.slice(0, -1)) {
      const s = sampleDayCycle(key.t);
      expect([s.sunR, s.sunG, s.sunB]).toEqual([...key.sun]);
      expect(s.skyTop).toBe(key.skyTop);
    }
    expect(sampleDayCycle(1.25)).toEqual(sampleDayCycle(0.25));
  });

  it('is bright at noon, dark at night, and warm (red ≫ blue) at sunset', () => {
    const noon = sampleDayCycle(NAMED_TIMES.noon);
    const night = sampleDayCycle(NAMED_TIMES.midnight);
    const sunset = sampleDayCycle(NAMED_TIMES.sunset);
    expect(noon.sunG).toBeGreaterThan(200);
    expect(night.sunG).toBeLessThan(60);
    expect(sunset.sunR).toBeGreaterThan(sunset.sunB * 2);
  });
});

describe('updateLantern', () => {
  const setup = () => ({
    player: createPlayer(0, 0),
    input: new ActionState(),
    inventory: new Inventory(),
    events: new EventBus<SimEvents>(),
  });

  it('burns Lumen while lit, goes out at zero and toggles with F', () => {
    const { player, input, inventory, events } = setup();
    expect(lanternLit(player)).toBe(true);
    updateLantern(player, input, inventory, events, 10);
    expect(player.lumen).toBeCloseTo(LUMEN.start - LUMEN.drainPerSecond * 10, 6);
    input.setHeld('toggleLantern', true);
    updateLantern(player, input, inventory, events, 10);
    expect(player.lanternOn).toBe(false);
    const before = player.lumen;
    updateLantern(player, input, inventory, events, 10);
    expect(player.lumen).toBe(before);

    player.lanternOn = true;
    updateLantern(player, input, inventory, events, 1e6);
    expect(player.lumen).toBe(0);
    expect(lanternLit(player)).toBe(false);
  });

  it('refills from Lumen Crystals in the inventory', () => {
    const { player, input, inventory, events } = setup();
    player.lumen = LUMEN.max - LUMEN.perCrystal - 1;
    inventory.add(itemId('lumen_crystal'), 2);
    updateLantern(player, input, inventory, events, 0);
    expect(player.lumen).toBeCloseTo(LUMEN.max - 1, 6);
    expect(inventory.slots.find((s) => s?.itemId === itemId('lumen_crystal'))?.count).toBe(1);
  });
});

describe('LightSystem (inline backend)', () => {
  /** 120×80 world: open sky above row 40, solid stone below with a sealed cave. */
  function caveSim(startDayFraction: number) {
    return new Simulation({
      size: { width: 120, height: 80, chunkSize: 40 },
      startDayFraction,
      generate: (world: World) => {
        for (let y = 40; y < 80; y++) for (let x = 0; x < 120; x++) world.fg[y * 120 + x] = STONE;
        for (let y = 60; y < 66; y++) for (let x = 50; x < 70; x++) world.fg[y * 120 + x] = 0;
        world.touchAll();
        return { spawnX: 20 * TILE_SIZE, spawnY: 40 * TILE_SIZE };
      },
    });
  }
  const light = (world: World, x: number, y: number) => world.lightG[y * world.width + x] ?? 0;

  it('lights open sky with the sun, keeps a sealed cave dark, and a torch lights the cave', () => {
    const sim = caveSim(NAMED_TIMES.noon);
    sim.player.lanternOn = false;
    sim.input.setFocus(60 * TILE_SIZE, 50 * TILE_SIZE);
    sim.update(1000 / 60);
    expect(sim.light.stats.updates).toBeGreaterThan(0);
    expect(light(sim.world, 60, 30)).toBeGreaterThan(200);
    expect(light(sim.world, 60, 63)).toBe(0);

    sim.world.set(60, 65, TORCH);
    sim.update(1000 / LIGHT.updateHz + 1);
    expect(light(sim.world, 60, 64)).toBeGreaterThan(100);
    expect(light(sim.world, 55, 64)).toBeGreaterThan(0); // 6 tiles away: still lit
    expect(light(sim.world, 50, 61)).toBe(0); // 14 tiles away: beyond the torch's reach
  });

  it('dims the surface at night', () => {
    const noon = caveSim(NAMED_TIMES.noon);
    const night = caveSim(NAMED_TIMES.midnight);
    for (const sim of [noon, night]) {
      sim.player.lanternOn = false;
      sim.update(1000 / 60);
    }
    expect(light(night.world, 30, 30)).toBeLessThan(light(noon.world, 30, 30) / 3);
  });

  it('emits lightUpdated for the written rectangle, inside the world', () => {
    const sim = caveSim(NAMED_TIMES.noon);
    const seen: { x0: number; y0: number; width: number; height: number }[] = [];
    sim.events.on('lightUpdated', (e) => seen.push({ ...e }));
    sim.update(1000 / 60);
    expect(seen).toHaveLength(1);
    const r = seen[0]!;
    expect(r.x0).toBeGreaterThanOrEqual(0);
    expect(r.x0 + r.width).toBeLessThanOrEqual(120);
    expect(r.width).toBeLessThanOrEqual(LIGHT.innerWidth);
  });
});

describe('LightSystem resilience', () => {
  it('abandons a job the backend never answers and submits a new one', () => {
    const submitted: number[] = [];
    const silent = { submit: (j: { id: number }) => void submitted.push(j.id) };
    const sim = new Simulation({
      size: { width: 40, height: 30, chunkSize: 10 },
      lightBackend: silent,
      generate: () => ({ spawnX: 20 * TILE_SIZE, spawnY: 10 * TILE_SIZE }),
    });
    sim.update(1000 / 60);
    expect(submitted).toHaveLength(1);
    for (let i = 0; i < 30; i++) sim.update(1000 / 60); // 0.5 s: still waiting
    expect(submitted).toHaveLength(1);
    for (let i = 0; i < 45; i++) sim.update(1000 / 60); // past LIGHT.jobTimeoutSeconds
    expect(submitted.length).toBeGreaterThan(1);
  });
});
