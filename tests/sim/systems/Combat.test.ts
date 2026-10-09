import { describe, expect, it } from 'vitest';
import { COMBAT, TILE_SIZE } from '../../../src/config';
import { ENEMIES, enemyByKey } from '../../../src/data/enemies';
import { itemId } from '../../../src/data/items';
import { tileId } from '../../../src/data/tiles';
import { createEnemy, type Enemy } from '../../../src/sim/entities/Enemy';
import { EventBus, type SimEvents } from '../../../src/sim/events';
import { Simulation } from '../../../src/sim/Simulation';
import { updateEnemyAI } from '../../../src/sim/systems/EnemyAI';
import { SpawnSystem, type SpawnContext } from '../../../src/sim/systems/SpawnSystem';
import { createPlayer } from '../../../src/sim/entities/Player';
import { mulberry32 } from '../../../src/sim/random';
import { World } from '../../../src/sim/world/World';

const T = TILE_SIZE;
const STONE = tileId('stone');
const type = (key: string) => ENEMIES.findIndex((e) => e.key === key);

/** 80×40 world, stone floor from row 30 with walls behind; player at column 20; midnight. */
function arena(): Simulation {
  const sim = new Simulation({
    size: { width: 80, height: 40, chunkSize: 16 },
    generate: (w) => {
      for (let y = 0; y < 40; y++) {
        for (let x = 0; x < 80; x++) {
          if (y >= 30) w.set(x, y, STONE);
          else w.setBg(x, y, STONE);
        }
      }
      return { spawnX: 20.5 * T, spawnY: 30 * T };
    },
    startDayFraction: 0,
  });
  sim.player.lanternOn = false;
  return sim;
}

function step(sim: Simulation, seconds: number): void {
  for (let i = 0; i < Math.round(seconds * 60); i++) sim.update(1000 / 60);
}

/** Puts a creature with its feet at tile (x, y). */
function addEnemy(sim: Simulation, key: string, x: number, y: number): Enemy {
  const enemy = createEnemy(1000 + sim.enemies.length, type(key), (x + 0.5) * T, y * T);
  sim.enemies.push(enemy);
  return enemy;
}

function hold(sim: Simulation, item: string): void {
  sim.giveItems([{ item, count: item === 'wooden_arrow' ? 50 : 1 }]);
  const slot = sim.inventory.slots.findIndex((s) => s?.itemId === itemId(item));
  sim.enqueue({ type: 'selectSlot', slot });
  step(sim, 1 / 60);
}

describe('melee', () => {
  it('a swing hits a creature in front once, knocks it back, and not one behind', () => {
    const sim = arena();
    hold(sim, 'iron_sword');
    const front = addEnemy(sim, 'gloam_hound', 22, 30);
    const behind = addEnemy(sim, 'gloam_hound', 17, 30);
    const hits: number[] = [];
    sim.events.on('enemyHit', (e) => hits.push(e.id));
    sim.input.setAim(24 * T, 29 * T);
    sim.input.setHeld('useItem', true);
    step(sim, 0.2);
    sim.input.setHeld('useItem', false);
    expect(hits.filter((id) => id === front.id)).toHaveLength(1);
    expect(hits).not.toContain(behind.id);
    expect(front.health).toBe(enemyByKey('gloam_hound').maxHealth - 18);
    expect(front.body.vx).toBeGreaterThan(0);
  });

  it('a landed hit freezes the game briefly (hit-stop)', () => {
    const sim = arena();
    hold(sim, 'iron_sword');
    addEnemy(sim, 'gloam_hound', 22, 30);
    sim.input.setAim(24 * T, 29 * T);
    sim.input.setHeld('useItem', true);
    let frozen = 0;
    for (let i = 0; i < 30; i++) if (sim.update(1000 / 60) === 0) frozen++;
    expect(frozen).toBeGreaterThanOrEqual(Math.floor(COMBAT.hitStop * 60) - 1);
  });

  it('kills drop loot and leave the list', () => {
    const sim = arena();
    hold(sim, 'iron_sword');
    const slime = addEnemy(sim, 'moss_slime', 22, 30);
    slime.health = 1;
    const died: number[] = [];
    sim.events.on('enemyDied', (e) => died.push(e.id));
    sim.input.setAim(24 * T, 29.5 * T);
    sim.input.setHeld('useItem', true);
    step(sim, 0.3);
    expect(died).toEqual([slime.id]);
    expect(sim.enemies).toHaveLength(0);
  });

  it('a selected weapon attacks instead of mining', () => {
    const sim = arena();
    hold(sim, 'iron_sword');
    sim.giveItems([{ item: 'iron_pickaxe', count: 1 }]);
    sim.input.setAim(21.5 * T, 30.5 * T);
    sim.input.setHeld('useItem', true);
    step(sim, 2);
    expect(sim.world.get(21, 30)).toBe(STONE);
  });
});

describe('ranged and magic', () => {
  it('the bow uses an arrow per shot and the arrow hurts what it hits', () => {
    const sim = arena();
    hold(sim, 'elderwood_bow');
    hold(sim, 'wooden_arrow');
    const slot = sim.inventory.slots.findIndex((s) => s?.itemId === itemId('elderwood_bow'));
    sim.enqueue({ type: 'selectSlot', slot });
    const target = addEnemy(sim, 'gloam_hound', 30, 30);
    target.stunned = 99; // holds still
    sim.input.setAim(30.5 * T, 28.4 * T);
    sim.input.setHeld('useItem', true);
    step(sim, 0.05);
    sim.input.setHeld('useItem', false);
    expect(sim.inventory.count(itemId('wooden_arrow'))).toBe(49);
    step(sim, 1);
    expect(target.health).toBeLessThan(enemyByKey('gloam_hound').maxHealth);
  });

  it('the Lumen staff spends Lumen and its beam hits shades twice as hard', () => {
    const sim = arena();
    hold(sim, 'lumen_staff');
    const shade = addEnemy(sim, 'shade', 26, 29);
    shade.stunned = 99; // holds still
    const lumen = sim.player.lumen;
    sim.input.setAim(26.5 * T, 28.3 * T);
    sim.input.setHeld('useItem', true);
    step(sim, 0.05);
    sim.input.setHeld('useItem', false);
    expect(sim.player.lumen).toBeLessThan(lumen);
    step(sim, 0.5);
    // The beam's hit (light near the player may singe it a little more).
    expect(enemyByKey('shade').maxHealth - shade.health).toBeGreaterThanOrEqual(
      14 * COMBAT.beamShadeMultiplier,
    );
  });
});

describe('getting hurt', () => {
  it('touching a creature hurts once per invulnerability window, with knockback', () => {
    const sim = arena();
    const hound = addEnemy(sim, 'gloam_hound', 20, 30);
    hound.stunned = 99; // stands still
    step(sim, 1 / 60);
    const after = sim.player.health;
    expect(after).toBe(100 - enemyByKey('gloam_hound').contactDamage);
    expect(sim.player.invuln).toBeGreaterThan(0);
    step(sim, COMBAT.playerInvuln / 2);
    expect(sim.player.health).toBe(after);
  });

  it('dies at 0 health and respawns at the spawn after a while', () => {
    const sim = arena();
    sim.player.body.x = 60 * T;
    sim.player.health = 5;
    const hound = addEnemy(sim, 'gloam_hound', 60, 30);
    hound.stunned = 99;
    const events: string[] = [];
    sim.events.on('playerDied', () => events.push('died'));
    sim.events.on('playerRespawned', () => events.push('respawned'));
    step(sim, 1 / 30);
    expect(sim.player.dead).toBe(true);
    sim.enemies.length = 0;
    step(sim, COMBAT.respawnSeconds + 0.1);
    expect(events).toEqual(['died', 'respawned']);
    expect(sim.player.dead).toBe(false);
    expect(sim.player.health).toBe(100);
    expect(Math.abs(sim.player.body.x + sim.player.body.width / 2 - 20.5 * T)).toBeLessThan(1);
  });
});

describe('while dead', () => {
  it('no healing, no pickups, no lantern; a save made while dead loads alive at the spawn', () => {
    const sim = arena();
    sim.player.lanternOn = true; // Amber would heal
    sim.player.body.x = 50 * T;
    sim.player.health = 1;
    const hound = addEnemy(sim, 'gloam_hound', 50, 30);
    hound.stunned = 99;
    step(sim, 1 / 30);
    expect(sim.player.dead).toBe(true);
    sim.spawnDrop(itemId('stone'), 5, sim.player.body.x + 6, sim.player.body.y + 20);
    step(sim, 1);
    expect(sim.player.health).toBe(0);
    expect(sim.inventory.count(itemId('stone'))).toBe(0);
    expect(sim.combat.swingDuration).toBe(0);

    const meta = {
      id: 'w',
      name: 'w',
      seed: 1,
      sizeKey: 'small' as const,
      width: 80,
      height: 40,
      createdAt: 0,
      lastPlayed: 0,
      playTime: 0,
    };
    const loaded = Simulation.fromSave(sim.toSaveState(meta, 2));
    expect(loaded.player.dead).toBe(false);
    expect(loaded.player.health).toBe(100);
    expect(loaded.player.body.x + loaded.player.body.width / 2).toBeCloseTo(20.5 * T, 3);
  });
});

describe('shades', () => {
  it('burn in light and dissolve; stay whole in the dark', () => {
    const sim = arena();
    const lit = addEnemy(sim, 'shade', 40, 25);
    const dark = addEnemy(sim, 'shade', 60, 25);
    lit.stunned = 99;
    dark.stunned = 99;
    const died: number[] = [];
    sim.events.on('enemyDied', (e) => died.push(e.id));
    for (let i = 0; i < 6 * 60; i++) {
      // A bright patch around the first shade (the light grid is the input).
      for (let y = 20; y < 28; y++)
        for (let x = 36; x < 46; x++) sim.world.lightR[sim.world.index(x, y)] = 220;
      sim.update(1000 / 60);
    }
    expect(died).toContain(lit.id);
    expect(dark.health).toBe(enemyByKey('shade').maxHealth);
  });
});

describe('spawning', () => {
  function spawnSetup(light: number) {
    const events = new EventBus<SimEvents>();
    const world = new World({ width: 100, height: 60, chunkSize: 20 }, events);
    for (let y = 50; y < 60; y++) for (let x = 0; x < 100; x++) world.set(x, y, STONE);
    world.lightR.fill(light);
    const player = createPlayer(50 * T, 50 * T);
    const ctx: SpawnContext = {
      enemies: [],
      world,
      player,
      region: { x0: 0, y0: 0, width: 100, height: 60 },
      focusX: 50,
      focusY: 40,
      day: false,
      random: mulberry32(7),
      nextId: (() => {
        let id = 1;
        return () => id++;
      })(),
      events,
    };
    return ctx;
  }

  it('shades appear only in darkness, and never on screen', () => {
    const dark = spawnSetup(0);
    const lit = spawnSetup(255);
    const spawner = new SpawnSystem();
    const litSpawner = new SpawnSystem();
    for (let i = 0; i < 400; i++) {
      spawner.update(dark, 0.5);
      litSpawner.update(lit, 0.5);
    }
    const shades = (c: SpawnContext) => c.enemies.filter((e) => ENEMIES[e.type]?.key === 'shade');
    expect(shades(dark).length).toBeGreaterThan(0);
    expect(shades(lit)).toHaveLength(0);
    for (const e of dark.enemies) {
      const x = (e.body.x + e.body.width / 2) / T;
      const y = (e.body.y + e.body.height / 2) / T;
      const onScreen = Math.abs(x - 50) < 30 && Math.abs(y - 40) < 17;
      expect(onScreen).toBe(false);
    }
  });
});

describe('AI', () => {
  it('walkers chase, flyers close in, shades shrink back from bright light', () => {
    const events = new EventBus<SimEvents>();
    const world = new World({ width: 80, height: 40, chunkSize: 20 }, events);
    for (let y = 30; y < 40; y++) for (let x = 0; x < 80; x++) world.set(x, y, STONE);
    const player = createPlayer(40 * T, 30 * T);
    const walker = createEnemy(1, type('bramble_sprite'), 30 * T, 30 * T);
    const flyer = createEnemy(2, type('dusk_bat'), 50 * T, 20 * T);
    const shade = createEnemy(3, type('shade'), 46 * T, 28 * T);
    const run = (e: Enemy, seconds: number) => {
      const def = ENEMIES[e.type];
      if (!def) throw new Error('def');
      for (let i = 0; i < seconds * 60; i++) updateEnemyAI(e, def, player, true, world, 1 / 60);
    };
    const dist = (e: Enemy) => Math.abs(e.body.x + e.body.width / 2 - 40 * T);
    const w0 = dist(walker);
    run(walker, 1);
    expect(dist(walker)).toBeLessThan(w0);
    const f0 = Math.hypot(flyer.body.x - 40 * T, flyer.body.y - 28 * T);
    run(flyer, 1);
    expect(Math.hypot(flyer.body.x - 40 * T, flyer.body.y - 28 * T)).toBeLessThan(f0);
    world.lightR.fill(250);
    const s0 = dist(shade);
    run(shade, 0.5);
    expect(shade.state).toBe('flee');
    expect(dist(shade)).toBeGreaterThan(s0);
  });

  it('burrowers tunnel through rock and lunge up at the player', () => {
    const events = new EventBus<SimEvents>();
    const world = new World({ width: 80, height: 60, chunkSize: 20 }, events);
    for (let y = 30; y < 60; y++) for (let x = 0; x < 80; x++) world.set(x, y, STONE);
    const player = createPlayer(40 * T, 30 * T);
    const wyrm = createEnemy(1, type('root_wyrm'), 25 * T, 45 * T);
    const def = enemyByKey('root_wyrm');
    let lunged = false;
    for (let i = 0; i < 8 * 60; i++) {
      updateEnemyAI(wyrm, def, player, true, world, 1 / 60);
      if (wyrm.state === 'lunge') lunged = true;
    }
    expect(lunged).toBe(true);
  });
});
