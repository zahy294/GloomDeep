import { describe, expect, it } from 'vitest';
import { BOSS, LUMEN, TILE_SIZE } from '../../../src/config';
import { bossByKey, type BossDef, type MireDef, type WardenDef } from '../../../src/data/bosses';
import { ENEMIES } from '../../../src/data/enemies';
import { itemId } from '../../../src/data/items';
import { prefabByKey } from '../../../src/data/prefabs';
import { tileId } from '../../../src/data/tiles';
import { decodeSave, encodeSave, SAVE_VERSION } from '../../../src/persistence/saveFormat';
import { Simulation } from '../../../src/sim/Simulation';
import type { Arena } from '../../../src/sim/systems/bosses/types';
import { hitEnemy } from '../../../src/sim/systems/CombatSystem';
import { stampPrefabAt, worldTarget } from '../../../src/sim/world/prefabs';
import { AIR } from '../../../src/sim/world/World';

const T = TILE_SIZE;
const X0 = 30;
const Y0 = 30;
const SEAL = tileId(BOSS.sealTile);

function def(key: string): BossDef {
  const d = bossByKey(key);
  if (!d) throw new Error(key);
  return d;
}

/** A stone world with one arena stamped at (X0, Y0) and the player standing in its doorway. */
function arenaWorld(key: string): { sim: Simulation; arena: Arena } {
  const prefab = prefabByKey(def(key).arena);
  const W = X0 * 2 + prefab.width;
  const H = Y0 * 2 + prefab.height;
  const place = { key, x0: X0, y0: Y0, x1: X0 + prefab.width - 1, y1: Y0 + prefab.height - 1 };
  const sim = new Simulation({
    size: { width: W, height: H, chunkSize: 20 },
    startingInventory: false,
    arenas: [place],
    generate: (w) => {
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) w.set(x, y, tileId('stone'));
      stampPrefabAt(worldTarget(w), prefab, X0, Y0);
      return { spawnX: (X0 + 1.5) * T, spawnY: (Y0 + prefab.height - 6) * T };
    },
  });
  const arena = sim.bosses.arenaOf(key);
  if (!arena) throw new Error('no arena');
  return { sim, arena };
}

function step(sim: Simulation, seconds: number): void {
  for (let i = 0; i < Math.round(seconds * 60); i++) sim.update(1000 / 60);
}

function put(sim: Simulation, x: number, y: number): void {
  const b = sim.player.body;
  b.x = (x + 0.5) * T - b.width / 2;
  b.y = (y + 1) * T - b.height;
  b.vx = 0;
  b.vy = 0;
  sim.player.prevX = b.x;
  sim.player.prevY = b.y;
  sim.input.setFocus(b.x, b.y);
}

/** Steps into the trigger and waits out the intro. */
function startFight(sim: Simulation, arena: Arena): void {
  const x = Math.floor((arena.trigger.x0 + arena.trigger.x1) / 2);
  put(sim, x, arena.trigger.y1);
  sim.player.invuln = 1e9; // tests are about the fight's rules, not surviving it
  step(sim, BOSS.checkSeconds * 2);
  expect(arena.state).toBe('intro');
  step(sim, BOSS.introSeconds + 0.1);
  expect(arena.state).toBe('fight');
}

function strike(sim: Simulation, arena: Arena, amount: number): void {
  const boss = arena.boss;
  if (!boss) throw new Error('no boss');
  boss.invuln = 0;
  hitEnemy(
    sim.combat,
    (sim as unknown as { combatContext: Parameters<typeof hitEnemy>[1] }).combatContext,
    boss,
    amount,
    0,
    0,
    'melee',
  );
}

const doorCells = (sim: Simulation, arena: Arena) => {
  const out: number[] = [];
  for (const d of arena.doors) {
    for (let y = d.y0; y <= d.y1; y++)
      for (let x = d.x0; x <= d.x1; x++) out.push(sim.world.get(x, y));
  }
  return out;
};

describe('Boss fights (M12)', () => {
  it('stepping in seals the doors and plays the intro; the boss holds still and cannot be hurt', () => {
    const { sim, arena } = arenaWorld('moth_matriarch');
    const intro: string[] = [];
    sim.events.on('bossIntro', ({ name }) => intro.push(name));
    expect(doorCells(sim, arena).every((id) => id === AIR)).toBe(true);
    put(sim, Math.floor((arena.trigger.x0 + arena.trigger.x1) / 2), arena.trigger.y1);
    step(sim, BOSS.checkSeconds * 2);
    expect(intro).toEqual(['The Moth Matriarch']);
    expect(doorCells(sim, arena).every((id) => id === SEAL)).toBe(true);
    const boss = arena.boss;
    expect(boss?.harmless).toBe(true);
    expect(boss?.damageTaken).toBe(0);
  });

  it('a lost fight puts the arena back: dying ends it, the doors open, the boss is gone', () => {
    const { sim, arena } = arenaWorld('moth_matriarch');
    startFight(sim, arena);
    const resets: string[] = [];
    sim.events.on('bossReset', ({ key }) => resets.push(key));
    sim.player.dead = true;
    sim.player.respawnTimer = 99;
    step(sim, BOSS.checkSeconds * 2);
    expect(resets).toEqual(['moth_matriarch']);
    expect(arena.state).toBe('idle');
    expect(sim.enemies).toHaveLength(0);
    expect(doorCells(sim, arena).every((id) => id === AIR)).toBe(true);
  });

  it('falls through its phases and, beaten, sets its flag and opens the doors', () => {
    const { sim, arena } = arenaWorld('moth_matriarch');
    startFight(sim, arena);
    const phases: number[] = [];
    const defeated: string[] = [];
    sim.events.on('bossPhase', ({ phase }) => phases.push(phase));
    sim.events.on('bossDefeated', ({ key }) => defeated.push(key));
    const max = ENEMIES.find((e) => e.key === 'moth_matriarch')?.maxHealth ?? 0;
    strike(sim, arena, max * 0.5);
    step(sim, 0.1);
    strike(sim, arena, max * 0.25);
    step(sim, 0.1);
    expect(phases).toEqual([1, 2]);
    strike(sim, arena, max);
    step(sim, 0.1);
    expect(defeated).toEqual(['moth_matriarch']);
    expect(sim.progression.has('boss:moth_matriarch')).toBe(true);
    expect(arena.state).toBe('won');
    expect(doorCells(sim, arena).every((id) => id === AIR)).toBe(true);
    // It never fights again.
    put(sim, Math.floor((arena.trigger.x0 + arena.trigger.x1) / 2), arena.trigger.y1);
    step(sim, 1);
    expect(sim.bosses.active).toBeNull();
  });

  it('a fight is not saved: loading puts the arena back without seals', () => {
    const { sim, arena } = arenaWorld('moth_matriarch');
    startFight(sim, arena);
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
    const a = back.bosses.arenaOf('moth_matriarch');
    expect(a?.state).toBe('idle');
    if (a) expect(doorCells(back, a).every((id) => id === AIR)).toBe(true);
  });
});

describe('The Moth Matriarch', () => {
  it('hunts the lantern, loses you in the dark, and is stunned by diving into a lure', () => {
    const { sim, arena } = arenaWorld('moth_matriarch');
    const lure = tileId('moth_lure');
    // Take the nest's own lures away first.
    for (let y = arena.bounds.y0; y <= arena.bounds.y1; y++) {
      for (let x = arena.bounds.x0; x <= arena.bounds.x1; x++) {
        if (sim.world.get(x, y) === lure) sim.world.set(x, y, AIR);
      }
    }
    startFight(sim, arena);
    const run = sim.bosses.run(arena);
    sim.player.lumen = LUMEN.max;
    sim.player.lanternOn = true;
    step(sim, 1);
    expect(run?.view.script === 'moth' && run.view.lost).toBe(false);
    sim.player.lanternOn = false;
    step(sim, 1);
    expect(run?.view.script === 'moth' && run.view.lost).toBe(true);

    // A lure on the floor under her: she dives into it and drops, stunned and soft.
    const lx = Math.floor((arena.bounds.x0 + arena.bounds.x1) / 2);
    const ly = arena.bounds.y1;
    sim.world.set(lx, ly, lure);
    const stunned: string[] = [];
    sim.events.on('bossAction', ({ kind }) => stunned.push(kind));
    step(sim, 12);
    expect(stunned).toContain('stunned');
    expect(sim.world.get(lx, ly)).toBe(AIR);
  });
});

describe('The Mire Sovereign', () => {
  it('floods the pool, drowns the braziers, and a sluice lever drains it', () => {
    const { sim, arena } = arenaWorld('mire_sovereign');
    const d = def('mire_sovereign') as MireDef;
    const brazierOut = tileId(d.brazierOut);
    startFight(sim, arena);
    const run = sim.bosses.run(arena);
    const view = () => (run?.view.script === 'mire' ? run.view : null);
    expect(view()?.level).toBe(d.startLevel);
    step(sim, (d.floodEvery[0] ?? 0) * 3 + d.floodSeconds * 3);
    expect(view()?.level ?? 0).toBeGreaterThan(d.startLevel + d.floodRows);
    const pool = arena.pool;
    if (!pool) throw new Error('no pool');
    // The lowest braziers are under water now.
    let drowned = 0;
    for (let y = pool.y0; y <= pool.y1; y++) {
      for (let x = pool.x0; x <= pool.x1; x++) if (sim.world.get(x, y) === brazierOut) drowned++;
    }
    expect(drowned).toBeGreaterThan(0);
    // Pull the west lever.
    let lever: [number, number] | null = null;
    for (let y = arena.bounds.y0; y <= arena.bounds.y1 && !lever; y++) {
      for (let x = arena.bounds.x0; x <= arena.bounds.x1; x++) {
        if (sim.world.get(x, y) === tileId(d.lever)) {
          lever = [x, y];
          break;
        }
      }
    }
    if (!lever) throw new Error('no lever');
    put(sim, lever[0] + 1, lever[1]);
    const before = view()?.target ?? 0;
    expect(sim.bosses.use(lever[0], lever[1])).toBe(true);
    expect(view()?.target).toBe(Math.max(0, before - d.drainRows));
    expect(sim.world.get(lever[0], lever[1])).toBe(tileId(d.leverOpen));
  });

  it('barely feels blows in the murk, fully when lit, and nothing beneath the water', () => {
    const { sim, arena } = arenaWorld('mire_sovereign');
    const d = def('mire_sovereign') as MireDef;
    startFight(sim, arena);
    const boss = arena.boss;
    if (!boss) throw new Error('no boss');
    expect(boss.damageTaken).toBe(0); // it starts under
    step(sim, d.sinkSeconds + 0.2);
    expect([1, d.murkDamage]).toContain(boss.damageTaken);
  });
});

describe('The Hollow Warden', () => {
  it('only a beam bounced off a prism cracks its shell', () => {
    const { sim, arena } = arenaWorld('hollow_warden');
    const d = def('hollow_warden') as WardenDef;
    startFight(sim, arena);
    const boss = arena.boss;
    if (!boss) throw new Error('no boss');
    expect(boss.damageTaken).toBe(d.shellDamage);
    // Clear the hall's prisms, then set one "/" prism straight above the player: a beam aimed up
    // at it turns right, along the row the Warden is held in.
    const mid = Math.floor((arena.bounds.x0 + arena.bounds.x1) / 2);
    for (let y = arena.bounds.y0; y <= arena.bounds.y1; y++) {
      for (let x = arena.bounds.x0; x <= arena.bounds.x1; x++) {
        const k = sim.world.get(x, y);
        if (k === tileId('prism_slash') || k === tileId('prism_back')) sim.world.set(x, y, AIR);
      }
    }
    const px = mid - 12;
    const floor = arena.bounds.y1;
    put(sim, px, floor);
    sim.player.lumen = LUMEN.max;
    sim.player.lanternOn = true;
    sim.player.facing = 1;
    const pb = sim.player.body;
    const handX = pb.x + pb.width / 2 + 4;
    const prismY = floor - 8;
    sim.world.set(Math.floor(handX / T), prismY, tileId('prism_slash'));
    sim.input.setAim(handX, (prismY + 0.5) * T);
    // Hold the Warden in the beam's row, to the right.
    const holdY = (prismY + 0.5) * T - boss.body.height / 2;
    for (let i = 0; i < 20; i++) {
      boss.body.x = (mid + 4) * T;
      boss.body.y = holdY;
      boss.body.vy = 0;
      step(sim, 1 / 60);
    }
    const run = sim.bosses.run(arena);
    expect(run?.view.script === 'warden' && run.view.bounces).toBe(1);
    expect(boss.damageTaken).toBe(d.crackedDamage);
    expect(boss.health).toBeLessThan(
      ENEMIES.find((e) => e.key === 'hollow_warden')?.maxHealth ?? 0,
    );
    // Right-clicking a prism turns it round.
    put(sim, Math.floor(handX / T), prismY + 2);
    expect(sim.bosses.use(Math.floor(handX / T), prismY)).toBe(true);
    expect(sim.world.get(Math.floor(handX / T), prismY)).toBe(tileId('prism_back'));
  });
});

describe('The Gloam Heart', () => {
  it('takes no damage until root-lamps burn; lamps cost a Lumen crystal; it ends in the Heartlight', () => {
    const { sim, arena } = arenaWorld('gloam_heart');
    startFight(sim, arena);
    const boss = arena.boss;
    if (!boss) throw new Error('no boss');
    step(sim, 0.1);
    expect(boss.damageTaken).toBe(0);
    const node = tileId('heart_node');
    const lamps: [number, number][] = [];
    for (let y = arena.bounds.y0; y <= arena.bounds.y1; y++) {
      for (let x = arena.bounds.x0; x <= arena.bounds.x1; x++) {
        if (sim.world.get(x, y) === node) lamps.push([x, y]);
      }
    }
    expect(lamps).toHaveLength(6);
    const [first] = lamps;
    if (!first) return;
    put(sim, first[0] + 1, first[1]);
    const blocked: string[] = [];
    sim.events.on('useBlocked', ({ need }) => blocked.push(need));
    expect(sim.bosses.use(first[0], first[1])).toBe(true);
    expect(blocked).toHaveLength(1);
    sim.giveItems([{ item: 'lumen_crystal', count: 10 }]);
    expect(sim.bosses.use(first[0], first[1])).toBe(true);
    expect(sim.world.get(first[0], first[1])).toBe(tileId('heart_node_lit'));
    expect(sim.inventory.count(itemId('lumen_crystal'))).toBe(9);
    step(sim, 0.1);
    expect(boss.damageTaken).toBeCloseTo(1.2 / 6, 5);

    strike(sim, arena, 1e7);
    step(sim, 0.1);
    expect(sim.progression.has('boss:gloam_heart')).toBe(true);
    expect(sim.world.get(arena.bossX, arena.bossY)).toBe(tileId('heartlight'));
    expect(sim.gloam.growScale).toBe(0);
  });

  it('its tendrils crawl to a lit lamp and choke it', () => {
    const { sim, arena } = arenaWorld('gloam_heart');
    startFight(sim, arena);
    const node = tileId('heart_node');
    let lamp: [number, number] | null = null;
    for (let y = arena.bounds.y0; y <= arena.bounds.y1 && !lamp; y++) {
      for (let x = arena.bounds.x0; x <= arena.bounds.x1; x++) {
        if (sim.world.get(x, y) === node) {
          lamp = [x, y];
          break;
        }
      }
    }
    if (!lamp) throw new Error('no lamp');
    sim.world.set(lamp[0], lamp[1], tileId('heart_node_lit'));
    const choked: string[] = [];
    sim.events.on('bossAction', ({ kind }) => kind === 'nodeChoked' && choked.push(kind));
    step(sim, 40);
    expect(choked.length).toBeGreaterThan(0);
    expect(sim.world.get(lamp[0], lamp[1])).toBe(node);
  });
});
