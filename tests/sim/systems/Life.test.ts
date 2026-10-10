import { mulberry32 } from '../../../src/sim/random';
import { describe, expect, it } from 'vitest';
import { CRITTER, FLORA_FX, LIGHT, LUMEN, TILE_SIZE, WISP } from '../../../src/config';
import { lightByKey } from '../../../src/data/lights';
import { CRITTERS } from '../../../src/data/critters';
import { ITEMS, itemId } from '../../../src/data/items';
import { tileId } from '../../../src/data/tiles';
import { createPlayer } from '../../../src/sim/entities/Player';
import { EventBus, type SimEvents } from '../../../src/sim/events';
import { ActionState } from '../../../src/sim/input';
import { Inventory } from '../../../src/sim/inventory/Inventory';
import { Simulation } from '../../../src/sim/Simulation';
import {
  CritterSystem,
  type Critter,
  type CritterContext,
} from '../../../src/sim/systems/CritterSystem';
import { FloraSystem } from '../../../src/sim/systems/FloraSystem';
import type { TileRect } from '../../../src/sim/systems/GloamSystem';
import { updateLantern } from '../../../src/sim/systems/LanternSystem';
import { WispSystem } from '../../../src/sim/systems/WispSystem';
import { AIR, World } from '../../../src/sim/world/World';

const T = TILE_SIZE;
const STONE = tileId('stone');
const type = (key: string) => CRITTERS.findIndex((c) => c.key === key);

/** 40×20: stone floor from row 15 and a stone ceiling over rows 0–4; air between. */
function cave() {
  const events = new EventBus<SimEvents>();
  const world = new World({ width: 40, height: 20, chunkSize: 10 }, events);
  for (let x = 0; x < 40; x++) {
    for (let y = 0; y < 5; y++) world.set(x, y, STONE);
    for (let y = 15; y < 20; y++) world.set(x, y, STONE);
  }
  const player = createPlayer(2.5 * T, 15 * T);
  const region: TileRect = { x0: 0, y0: 0, width: 40, height: 20 };
  return { events, world, player, region };
}

function critter(t: number, x: number, y: number): Critter {
  const def = CRITTERS[t];
  if (!def) throw new Error('no critter');
  return {
    id: 1,
    type: t,
    body: { x, y, width: def.width, height: def.height, vx: 0, vy: 0 },
    prevX: x,
    prevY: y,
    facing: 1,
    onGround: false,
    state: 'idle',
    timer: 1,
    phase: 0,
    calmLight: Number.NaN,
    lightX: Number.NaN,
    lightY: Number.NaN,
  };
}

describe('critters', () => {
  function setup() {
    const s = cave();
    const system = new CritterSystem();
    // No spawning in these tests: the region is null.
    const ctx: CritterContext = {
      world: s.world,
      player: s.player,
      region: null,
      focusX: 0,
      focusY: 0,
      day: false,
      random: () => 0.5,
      events: s.events,
    };
    const startled: number[] = [];
    s.events.on('critterStartled', (e) => startled.push(e.type));
    const run = (seconds: number) => {
      for (let t = 0; t < seconds; t += 1 / 60) system.update(ctx, 1 / 60);
    };
    return { ...s, system, ctx, startled, run };
  }

  it('a bat hangs still until the player comes close, then flies off', () => {
    const { system, player, startled, run } = setup();
    const bat = critter(type('cave_bat'), 25 * T, 5 * T);
    system.critters.push(bat);
    run(1);
    expect(bat.state).toBe('idle');
    expect(bat.body.x).toBe(25 * T);
    player.body.x = 22 * T;
    player.body.y = 7 * T; // up on a ledge, within reach
    run(0.5);
    expect(startled).toEqual([type('cave_bat')]);
    expect(bat.state).toBe('flying');
    expect(bat.body.x).toBeGreaterThan(25 * T); // away from the player
  });

  it('bright light startles a bat even from afar', () => {
    const { system, world, startled, run } = setup();
    const bat = critter(type('cave_bat'), 25 * T, 5 * T);
    system.critters.push(bat);
    run(0.5);
    expect(startled).toEqual([]);
    const i = world.index(25, 5);
    world.lightR[i] = CRITTERS[type('cave_bat')]?.startledByLight ?? 0;
    run(0.1);
    expect(startled).toEqual([type('cave_bat')]);
  });

  it('a frog hops away from the player', () => {
    const { system, player, run } = setup();
    const frog = critter(type('frog'), 8 * T, 15 * T - 5);
    system.critters.push(frog);
    player.body.x = 6 * T;
    run(1);
    expect(frog.state === 'flee' || frog.body.x > 8 * T).toBe(true);
    expect(frog.body.x).toBeGreaterThan(8 * T);
  });

  it('a fleeing frog is startled once, not every step', () => {
    const { system, player, startled, run } = setup();
    system.critters.push(critter(type('frog'), 8 * T, 15 * T - 5));
    player.body.x = 6 * T;
    run(0.5);
    expect(startled).toEqual([type('frog')]);
  });

  it('a bat roosting in a glowing cave stays put until the light rises', () => {
    const { system, world, startled, run } = setup();
    const i = world.index(25, 5);
    world.lightR[i] = 200;
    const bat = critter(type('cave_bat'), 25 * T, 5 * T);
    system.critters.push(bat);
    run(1);
    expect(startled).toEqual([]);
    world.lightR[i] = 200 + CRITTER.startleRise;
    run(0.1);
    expect(startled).toEqual([type('cave_bat')]);
  });

  it('only catchable critters are caught, and only within reach', () => {
    const { system } = setup();
    system.critters.push(critter(type('cave_bat'), 10 * T, 10 * T));
    const fly = critter(type('firefly'), 20 * T, 10 * T);
    system.critters.push(fly);
    expect(system.catchAt(10 * T + 4, 10 * T + 3)).toBeNull();
    expect(system.catchAt(20 * T + 2 + CRITTER.catchRadius * 2, 10 * T)).toBeNull();
    expect(system.catchAt(20 * T + 2, 10 * T + 2)).toBe(fly);
    expect(system.critters).toHaveLength(1);
  });

  it('a glass jar catches a firefly and becomes a firefly jar', () => {
    const sim = new Simulation({
      size: { width: 80, height: 40, chunkSize: 20 },
      generate: (w) => {
        for (let y = 30; y < 40; y++) for (let x = 0; x < 80; x++) w.set(x, y, STONE);
        return { spawnX: 10.5 * T, spawnY: 30 * T };
      },
      startingInventory: false,
    });
    sim.inventory.add(itemId('glass_jar'), 1);
    const caught: number[] = [];
    sim.events.on('critterCaught', (e) => caught.push(e.type));
    const fx = 12.5 * T;
    const fy = 28.5 * T;
    sim.critters.critters.push(critter(type('firefly'), fx - 2, fy - 2));
    sim.input.setAim(fx, fy);
    sim.input.setHeld('useAlt', true);
    sim.update(1000 / 60);
    sim.input.setHeld('useAlt', false);
    sim.update(1000 / 60);
    expect(caught).toEqual([type('firefly')]);
    expect(sim.inventory.count(itemId('glass_jar'))).toBe(0);
    expect(sim.inventory.count(itemId('firefly_jar'))).toBe(1);
  });
});

describe('flora', () => {
  const BLOOM = tileId('lumen_bloom');
  const BLOOM_OPEN = tileId('lumen_bloom_open');
  const MOSS = tileId('glowmoss_tuft');
  const FAIRY = tileId('fairy_mushroom');
  const TICK = 1 / FLORA_FX.tickHz;

  function setup() {
    const s = cave();
    const flora = new FloraSystem(s.world, s.events, mulberry32(7));
    const run = (seconds: number, night = false) => {
      for (let t = 0; t < seconds; t += TICK) flora.update(TICK, s.region, s.player, night);
    };
    return { ...s, flora, run };
  }

  it('Lumen blooms open in light and close in the dark', () => {
    const { world, run } = setup();
    world.set(10, 14, BLOOM);
    run(TICK);
    expect(world.get(10, 14)).toBe(BLOOM);
    world.lightG[world.index(10, 14)] = FLORA_FX.bloomOpenLight;
    run(TICK);
    expect(world.get(10, 14)).toBe(BLOOM_OPEN);
    world.lightG[world.index(10, 14)] = FLORA_FX.bloomCloseLight + 1;
    run(TICK);
    expect(world.get(10, 14)).toBe(BLOOM_OPEN); // between the two: stays as it is
    world.lightG[world.index(10, 14)] = 0;
    run(TICK);
    expect(world.get(10, 14)).toBe(BLOOM);
  });

  it("an open bloom's own glow is below the close threshold (so it can close)", () => {
    const def = lightByKey('lumen_bloom');
    const own = (Math.max(...def.color) * Math.min(255, def.radius * LIGHT.airFalloff)) / 255;
    expect(own).toBeLessThan(FLORA_FX.bloomCloseLight);
    expect(FLORA_FX.bloomCloseLight).toBeLessThan(FLORA_FX.bloomOpenLight);
  });

  it('glowmoss spreads over dark floor but not into light', () => {
    const { world, run } = setup();
    world.set(20, 14, MOSS);
    for (let x = 25; x < 40; x++) world.lightR[world.index(x, 14)] = 255;
    run(3000);
    let moss = 0;
    for (let x = 0; x < 40; x++) if (world.get(x, 14) === MOSS) moss++;
    expect(moss).toBeGreaterThan(3);
    for (let x = 25; x < 40; x++) expect(world.get(x, 14)).not.toBe(MOSS);
  });

  it('a fairy ring grants the fae buff at night only', () => {
    const { world, player, events, run } = setup();
    for (const dx of [-3, -2, -1, 1, 2, 3]) world.set(2 + dx + 1, 14, FAIRY);
    const buffs: number[] = [];
    events.on('faeBuff', (e) => buffs.push(e.seconds));
    run(1, false);
    expect(player.fae).toBe(0);
    run(TICK, true);
    expect(player.fae).toBeGreaterThan(FLORA_FX.faeSeconds - 1);
    run(TICK * 4, true);
    expect(buffs).toEqual([FLORA_FX.faeSeconds]); // refreshed, not announced again
    player.body.x = 30 * T;
    run(10, false);
    expect(player.fae).toBeLessThan(FLORA_FX.faeSeconds - 9);
  });

  it('landing hard on a glowcap bounces the player', () => {
    const sim = new Simulation({
      size: { width: 60, height: 60, chunkSize: 20 },
      generate: (w) => {
        for (let y = 50; y < 60; y++) for (let x = 0; x < 60; x++) w.set(x, y, STONE);
        for (let x = 5; x < 15; x++) w.set(x, 50, tileId('glowcap_flesh'));
        return { spawnX: 10.5 * T, spawnY: 20 * T };
      },
      startingInventory: false,
    });
    let bounces = 0;
    sim.events.on('bounced', () => bounces++);
    let rose = false;
    for (let i = 0; i < 240; i++) {
      sim.update(1000 / 60);
      if (bounces > 0 && sim.player.body.vy < 0) rose = true;
    }
    expect(bounces).toBeGreaterThan(0);
    expect(rose).toBe(true);
  });

  it('Lumen petals refill the lantern before crystals', () => {
    const player = createPlayer(0, 0);
    const inventory = new Inventory();
    const events = new EventBus<SimEvents>();
    const petal = ITEMS[itemId('lumen_petal')]?.fuel ?? 0;
    expect(petal).toBeGreaterThan(0);
    inventory.add(itemId('lumen_crystal'), 1);
    inventory.add(itemId('lumen_petal'), 1);
    player.lumen = LUMEN.max - petal;
    player.lanternOn = false;
    updateLantern(player, new ActionState(), inventory, events, 0);
    expect(player.lumen).toBe(LUMEN.max);
    expect(inventory.count(itemId('lumen_petal'))).toBe(0);
    expect(inventory.count(itemId('lumen_crystal'))).toBe(1);
  });
});

describe('wisps', () => {
  const VEILED = tileId('veiled_lumen');

  function setup(chance = 0) {
    const s = cave();
    const wisps = new WispSystem(s.world, s.events, () => chance);
    const appeared: number[] = [];
    const arrived: number[] = [];
    s.events.on('wispAppeared', (e) => appeared.push(e.x));
    s.events.on('wispArrived', (e) => arrived.push(e.x));
    const run = (seconds: number, outdoorsByDay = false) => {
      for (let t = 0; t < seconds; t += 1 / 60) wisps.update(1 / 60, s.player, outdoorsByDay);
    };
    return { ...s, wisps, appeared, arrived, run };
  }

  it('leads the player to a secret and vanishes there', () => {
    const { world, player, wisps, appeared, arrived, run } = setup();
    world.set(35, 14, VEILED);
    run(WISP.interval + 0.1);
    expect(appeared).toHaveLength(1);
    const w = wisps.wisp;
    expect(w?.targetX).toBe(35.5 * T);
    // It heads for the secret, but waits for the player.
    run(20);
    expect(wisps.wisp?.x ?? 0).toBeLessThan(2.5 * T + (WISP.leadTiles + 1) * T);
    expect(wisps.wisp?.x ?? 0).toBeGreaterThan(2.5 * T + WISP.appearOffset);
    // Walk over: it arrives.
    player.body.x = 33 * T;
    run(0.1);
    expect(arrived).toEqual([35.5 * T]);
    expect(wisps.wisp).toBeNull();
  });

  it('does not appear outdoors by day, with nothing to find, or twice for one secret', () => {
    const { world, player, appeared, run } = setup();
    run(WISP.interval * 2, true);
    expect(appeared).toHaveLength(0);
    run(WISP.interval * 2);
    expect(appeared).toHaveLength(0); // no secret nearby
    world.set(35, 14, VEILED);
    run(WISP.interval + 0.1);
    expect(appeared).toHaveLength(1);
    player.body.x = 33 * T;
    run(0.1);
    player.body.x = 2.5 * T;
    run(WISP.interval * 3);
    expect(appeared).toHaveLength(1);
  });

  it('respects its chance', () => {
    const { world, appeared, run } = setup(0.99);
    world.set(35, 14, VEILED);
    run(WISP.interval * 3);
    expect(appeared).toHaveLength(0);
    expect(world.get(34, 14)).toBe(AIR);
  });
});
