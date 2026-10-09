import { describe, expect, it } from 'vitest';
import { TILE_SIZE } from '../../src/config';
import { itemId } from '../../src/data/items';
import { decodeSave, encodeSave, SAVE_VERSION } from '../../src/persistence/saveFormat';
import { Simulation } from '../../src/sim/Simulation';
import type { WorldMeta } from '../../src/sim/world/worldData';
import { generateWorld } from '../../src/workers/worldgen/generateWorld';

const meta = (w: number, h: number): WorldMeta => ({
  id: 'w1',
  name: 'Test',
  seed: 5,
  sizeKey: 'small',
  width: w,
  height: h,
  createdAt: 1,
  lastPlayed: 2,
  playTime: 3,
});

describe('save → load restores the world exactly', () => {
  it('round-trips tiles, player, inventory, time and drops through the binary format', () => {
    const generated = generateWorld(400, 240, 5);
    const sim = Simulation.fromGenerated(generated);
    // Change things: walk, dig, place, pick time, drop something.
    sim.input.setHeld('moveRight', true);
    for (let i = 0; i < 40; i++) sim.update(1000 / 60);
    sim.input.setHeld('moveRight', false);
    const px = Math.floor((sim.player.body.x + 6) / TILE_SIZE);
    const py = Math.round((sim.player.body.y + sim.player.body.height) / TILE_SIZE);
    sim.world.set(px + 2, py, 0);
    sim.world.setBg(px + 3, py - 3, 4); // a stone wall
    sim.setDayFraction(0.8);
    sim.inventory.add(itemId('lumen_crystal'), 3);
    sim.inventory.select(4);
    sim.player.lumen = 42;
    sim.player.lanternOn = false;
    // Keep one drop mid-life (part-way through its despawn timer, still moving).
    sim.drops.length = 0;
    sim.spawnDrop(itemId('lumen_crystal'), 2, sim.player.body.x, sim.player.body.y - 40);
    const drop = sim.drops[0];
    if (!drop) throw new Error('expected a drop');
    drop.age = 37.5;
    drop.body.vx = 12;

    const before = sim.toSaveState(meta(400, 240), SAVE_VERSION);
    const bytes = encodeSave(before);
    const restored = Simulation.fromSave(decodeSave(bytes));
    const after = restored.toSaveState(meta(400, 240), SAVE_VERSION);

    expect(Buffer.from(after.arrays.fg.buffer).equals(Buffer.from(before.arrays.fg.buffer))).toBe(
      true,
    );
    expect(Buffer.from(after.arrays.bg.buffer).equals(Buffer.from(before.arrays.bg.buffer))).toBe(
      true,
    );
    expect(
      Buffer.from(after.arrays.liquid.buffer).equals(Buffer.from(before.arrays.liquid.buffer)),
    ).toBe(true);
    expect(after.player).toEqual(before.player);
    expect(after.inventory).toEqual(before.inventory);
    expect(after.dayFraction).toBeCloseTo(before.dayFraction, 10);
    expect(after.elapsed).toBe(before.elapsed);
    expect([after.spawnX, after.spawnY]).toEqual([before.spawnX, before.spawnY]);
    expect(after.drops).toEqual(before.drops);
    expect(after.randomState).toBe(before.randomState);
    expect(restored.world.skyline).toEqual(sim.world.skyline);
  });

  it('a restored world keeps simulating identically to the original', () => {
    const generated = generateWorld(300, 200, 9);
    const a = Simulation.fromGenerated(generated);
    for (let i = 0; i < 30; i++) a.update(1000 / 60);
    const b = Simulation.fromSave(
      decodeSave(encodeSave(a.toSaveState(meta(300, 200), SAVE_VERSION))),
    );
    for (const sim of [a, b]) {
      sim.input.setHeld('moveLeft', true);
      sim.input.press('jump');
      for (let i = 0; i < 60; i++) sim.update(1000 / 60);
    }
    expect(b.player.body.x).toBeCloseTo(a.player.body.x, 6);
    expect(b.player.body.y).toBeCloseTo(a.player.body.y, 6);
  });

  it('a restored world continues the same random sequence (drop pops match)', () => {
    const a = Simulation.fromGenerated(generateWorld(300, 200, 9));
    a.spawnDrop(itemId('lumen_crystal'), 1, 100, 100); // advances the generator
    const b = Simulation.fromSave(
      decodeSave(encodeSave(a.toSaveState(meta(300, 200), SAVE_VERSION))),
    );
    for (const sim of [a, b]) {
      sim.drops.length = 0;
      sim.spawnDrop(itemId('lumen_crystal'), 1, 100, 100);
    }
    expect(b.drops[0]?.body.vx).toBe(a.drops[0]?.body.vx);
    expect(b.drops[0]?.body.vy).toBe(a.drops[0]?.body.vy);
  });

  it('restored worlds do not get the starting inventory again', () => {
    const sim = Simulation.fromGenerated(generateWorld(200, 120, 2));
    sim.inventory.slots.fill(null);
    const restored = Simulation.fromSave(
      decodeSave(encodeSave(sim.toSaveState(meta(200, 120), SAVE_VERSION))),
    );
    expect(restored.inventory.slots.every((s) => s === null)).toBe(true);
  });
});
