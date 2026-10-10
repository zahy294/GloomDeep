import { describe, expect, it } from 'vitest';
import { DIMMING, LUMEN, TILE_SIZE } from '../../../src/config';
import { ENEMIES } from '../../../src/data/enemies';
import { itemId } from '../../../src/data/items';
import { prefabByKey } from '../../../src/data/prefabs';
import { tileId } from '../../../src/data/tiles';
import { decodeSave, encodeSave, SAVE_VERSION } from '../../../src/persistence/saveFormat';
import { sampleDayCycle } from '../../../src/sim/dayCycle';
import { EventBus, type SimEvents } from '../../../src/sim/events';
import { Simulation } from '../../../src/sim/Simulation';
import { DimmingSystem, dimmingFlag, strengthAt } from '../../../src/sim/systems/DimmingSystem';
import { stampPrefabAt, worldTarget } from '../../../src/sim/world/prefabs';
import type { TownPlace } from '../../../src/sim/world/worldData';

const T = TILE_SIZE;

function system(over = false) {
  const events = new EventBus<SimEvents>();
  const survived: number[] = [];
  const log: string[] = [];
  events.on('dimmingWarning', () => log.push('warn'));
  events.on('dimmingStarted', () => log.push('start'));
  events.on('dimmingEnded', ({ survived: n }) => log.push(`end ${n}`));
  const d = new DimmingSystem(
    events,
    () => over,
    (n) => survived.push(n),
  );
  return { d, survived, log };
}

/** Runs the clock from `from` (day, fraction) for `days` days in small steps. */
function run(d: DimmingSystem, days: number, start = 0.3, step = 0.002): number {
  let max = 0;
  let f = start;
  for (let i = 0; i < days / step; i++) {
    f = (f + step) % 1;
    d.update(f);
    max = Math.max(max, d.strength);
  }
  return max;
}

describe('Dimming nights (M12)', () => {
  it('come on the night of day firstDay and every everyDays after', () => {
    const { d } = system();
    expect(d.isDimmingNight(0)).toBe(false);
    expect(d.isDimmingNight(DIMMING.firstDay)).toBe(true);
    expect(d.isDimmingNight(DIMMING.firstDay + 1)).toBe(false);
    expect(d.isDimmingNight(DIMMING.firstDay + DIMMING.everyDays)).toBe(true);
    expect(d.nextDimmingDay()).toBe(DIMMING.firstDay);
  });

  it('deepen after dusk, hold through the night and fade by dawn', () => {
    expect(strengthAt(0.5)).toBe(0);
    expect(strengthAt(DIMMING.startsAt)).toBe(0);
    expect(strengthAt(DIMMING.fullAt)).toBe(1);
    expect(strengthAt(0.95)).toBe(1);
    expect(strengthAt(0.05)).toBe(1);
    expect(strengthAt(DIMMING.endsAt)).toBe(0);
    expect(strengthAt((DIMMING.fadeAt + DIMMING.endsAt) / 2)).toBeCloseTo(0.5, 1);
  });

  it('count days at midnight, warn, start, and count the dawn as surviving', () => {
    const { d, survived, log } = system();
    // Days 0 and 1 are ordinary.
    expect(run(d, 2)).toBe(0);
    expect(d.day).toBe(2);
    // Day 2's night is the first Dimming night, through to day 3's dawn.
    expect(run(d, 1)).toBe(1);
    expect(log).toEqual(['warn', 'start', 'end 1']);
    expect(survived).toEqual([1]);
    expect(dimmingFlag(1)).toBe('dimming:1');
  });

  it('dims the sun deeper every night survived, and darkens the sky', () => {
    const { d } = system();
    d.restore(DIMMING.firstDay, 0, 0.9);
    const day = sampleDayCycle(0.9);
    const sun = day.sunB;
    const sky = day.skyTop;
    d.apply(day);
    expect(day.sunB).toBeCloseTo(sun * DIMMING.sun, 3);
    expect(day.skyTop).not.toBe(sky);
    d.survived = 2;
    expect(d.depth).toBeCloseTo(DIMMING.sun - 2 * DIMMING.deepenBy, 5);
    d.survived = 99;
    expect(d.depth).toBe(DIMMING.minSun);
    expect(d.gloamGrowth).toBe(DIMMING.gloamGrowth);
  });

  it('end for good once the Gloam Heart has fallen', () => {
    const { d } = system(true);
    d.restore(DIMMING.firstDay, 0, 0.9);
    expect(d.strength).toBe(0);
    expect(d.nextDimmingDay()).toBe(-1);
  });
});

/** A flat stone world in the open air, the player standing on it at night. */
function nightWorld(towns: TownPlace[] = []): Simulation {
  const W = 420;
  const H = 200;
  const sim = new Simulation({
    size: { width: W, height: H, chunkSize: 20 },
    startingInventory: false,
    spawns: true,
    towns,
    generate: (w) => {
      for (let y = 80; y < H; y++) for (let x = 0; x < W; x++) w.set(x, y, tileId('stone'));
      for (const place of towns)
        stampPrefabAt(worldTarget(w), prefabByKey(place.key), place.x0, place.y0);
      return { spawnX: 60.5 * T, spawnY: 80 * T };
    },
  });
  return sim;
}

function step(sim: Simulation, seconds: number): void {
  for (let i = 0; i < Math.round(seconds * 60); i++) sim.update(1000 / 60);
}

describe('A Dimming night in the world (M12)', () => {
  it('sends waves of shades, and the dawn leaves Lumen crystals', () => {
    const sim = nightWorld();
    let waves = 0;
    sim.events.on('shadeWave', ({ count }) => (waves += count));
    sim.dimming.restore(DIMMING.firstDay, 0, 0.9);
    sim.setDayFraction(0.9);
    step(sim, DIMMING.waveSeconds + 1);
    expect(waves).toBeGreaterThan(0);
    const shade = ENEMIES.findIndex((e) => e.key === 'shade');
    const shades = sim.enemies.filter((e) => e.type === shade).length;
    expect(shades).toBeGreaterThan(0);

    // Jump to just before dawn; the night ends and is counted.
    sim.enemies.length = 0;
    // A lantern with room for Lumen would burn the gift as fuel.
    sim.player.lanternOn = false;
    sim.player.lumen = LUMEN.max;
    sim.setDayFraction(DIMMING.endsAt - 0.001);
    step(sim, 3);
    expect(sim.dimming.survived).toBe(1);
    expect(sim.progression.has('dimming:1')).toBe(true);
    step(sim, 3);
    const crystals = sim.inventory.count(itemId('lumen_crystal'));
    const dropped = sim.drops.filter((d) => d.itemId === itemId('lumen_crystal'));
    expect(crystals + dropped.reduce((n, d) => n + d.count, 0)).toBe(DIMMING.dawnGift.count);
  });

  it('makes the Gloam grow faster', () => {
    const sim = nightWorld();
    sim.dimming.restore(DIMMING.firstDay, 0, 0.9);
    sim.setDayFraction(0.9);
    step(sim, 0.1);
    expect(sim.gloam.growScale).toBe(DIMMING.gloamGrowth);
    sim.progression.set('boss:gloam_heart');
    step(sim, 0.1);
    expect(sim.gloam.growScale).toBe(0);
  });

  it('a bright town keeps a vigil; a dim one hides', () => {
    const canopy: TownPlace = { key: 'canopyhold', x0: 200, y0: 32, x1: 311, y1: 89 };
    const sim = nightWorld([canopy]);
    const town = sim.towns.townByKey('canopyhold');
    expect(town).toBeDefined();
    if (!town) return;
    for (const lamp of town.lamps) lamp.fuel = 1;
    sim.dimming.restore(DIMMING.firstDay, 0, 0.9);
    sim.setDayFraction(0.9);
    step(sim, 2);
    expect(town.vigil).toBe(true);
    const folk = sim.settlement.npcs.filter((n) => n.town === 'canopyhold');
    expect(folk.length).toBeGreaterThan(0);
    expect(folk.every((n) => !n.scared)).toBe(true);
    expect(folk.every((n) => n.nav?.goal === 'plaza')).toBe(true);

    // Two lamps in three burning is bright enough on an ordinary night, not on a Dimming one.
    town.lamps.forEach((lamp, i) => (lamp.fuel = i % 3 === 0 ? 0 : 1));
    step(sim, 2);
    expect(town.vigil).toBe(false);
    expect(folk.every((n) => n.scared)).toBe(true);
  });

  it('the day count and nights survived are saved', () => {
    const sim = nightWorld();
    sim.dimming.restore(7, 2, 0.4);
    const meta = {
      id: 'w',
      name: 'w',
      seed: 1,
      sizeKey: 'small' as const,
      width: sim.world.width,
      height: sim.world.height,
      createdAt: 0,
      lastPlayed: 0,
      playTime: 0,
    };
    const back = Simulation.fromSave(decodeSave(encodeSave(sim.toSaveState(meta, SAVE_VERSION))));
    expect(back.dimming.day).toBe(7);
    expect(back.dimming.survived).toBe(2);
  });
});
