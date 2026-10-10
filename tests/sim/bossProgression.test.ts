import { describe, expect, it } from 'vitest';
import { BOSS, TILE_SIZE, WORLD_SIZES } from '../../src/config';
import { BOSSES } from '../../src/data/bosses';
import { DEPTH_LAYERS } from '../../src/data/biomes';
import { tileId } from '../../src/data/tiles';
import { WARDS } from '../../src/data/wards';
import { Simulation } from '../../src/sim/Simulation';
import { hitEnemy } from '../../src/sim/systems/CombatSystem';
import { storyObjectives } from '../../src/sim/systems/StorySystem';
import { AIR } from '../../src/sim/world/World';
import { generateWorld } from '../../src/workers/worldgen/generateWorld';

const T = TILE_SIZE;
const { width, height } = WORLD_SIZES.small;
const generated = generateWorld(width, height, 42);

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

/** Walks into the boss's trigger, waits out the intro and brings it down. */
function defeat(sim: Simulation, key: string): void {
  const arena = sim.bosses.arenaOf(key);
  expect(arena, key).toBeDefined();
  if (!arena) return;
  sim.player.invuln = 1e9;
  put(sim, Math.floor((arena.trigger.x0 + arena.trigger.x1) / 2), arena.trigger.y1);
  step(sim, BOSS.checkSeconds * 2);
  expect(arena.state, `${key} begins`).toBe('intro');
  step(sim, BOSS.introSeconds + 0.1);
  const boss = arena.boss;
  if (!boss) throw new Error('no boss');
  // The fight's own rules are tested elsewhere; here it only has to fall.
  boss.damageTaken = 1;
  boss.invuln = 0;
  const ctx = (sim as unknown as { combatContext: Parameters<typeof hitEnemy>[1] }).combatContext;
  hitEnemy(sim.combat, ctx, boss, boss.health, 0, 0, 'melee');
  step(sim, 0.1);
  expect(arena.state, `${key} won`).toBe('won');
}

/** Tries to mine a ward cell with an iron pickaxe; returns whether it broke. */
function mineWard(sim: Simulation, wardKey: string): boolean {
  const ward = WARDS.find((w) => w.key === wardKey);
  const layer = DEPTH_LAYERS.findIndex((l) => l.key === ward?.layer);
  const top = sim.world.layerTops[layer] ?? 0;
  const x = Math.floor(sim.spawnX / T) + 40;
  for (let y = top - 4; y < top; y++)
    for (let dx = -2; dx <= 2; dx++) sim.world.set(x + dx, y, AIR);
  put(sim, x, top - 1);
  sim.player.invuln = 1e9;
  sim.giveItems([{ item: 'moonsilver_pickaxe', count: 1 }]);
  const id = sim.world.get(x + 1, top);
  sim.input.setAim((x + 1.5) * T, (top + 0.5) * T);
  sim.input.setHeld('useItem', true);
  step(sim, 6);
  sim.input.setHeld('useItem', false);
  return sim.world.get(x + 1, top) !== id;
}

describe('From a new world to the Heartlight (M12 "Done when")', () => {
  it('each boss opens the way to the next, and the last ends the Gloam', () => {
    const sim = Simulation.fromGenerated(generated, { seed: 42 });
    const story = () =>
      storyObjectives(sim.bosses, sim.player, (f) => sim.progression.has(f)).map(
        (o) => `${o.key}${o.done ? ':done' : ''}`,
      );
    expect(sim.bosses.arenas.map((a) => a.def.key).sort()).toEqual(BOSSES.map((b) => b.key).sort());
    // At first: the Matriarch and the Sovereign; the deeper two lie behind wards.
    expect(story()).toEqual(['moth_matriarch', 'mire_sovereign']);
    const sealed: string[] = [];
    sim.events.on('miningBlocked', ({ reason, flag }) => reason === 'sealed' && sealed.push(flag));
    expect(mineWard(sim, 'hollows')).toBe(false);
    expect(sealed).toContain('boss:moth_matriarch');

    defeat(sim, 'moth_matriarch');
    expect(mineWard(sim, 'hollows')).toBe(true);
    expect(sim.towns.townByKey('canopyhold')?.festivalPhase).toBe('due');
    expect(story()).toEqual(['moth_matriarch:done', 'mire_sovereign', 'hollow_warden']);

    defeat(sim, 'mire_sovereign');
    expect(sim.progression.has('boss:mire_sovereign')).toBe(true);

    expect(mineWard(sim, 'heart')).toBe(false);
    defeat(sim, 'hollow_warden');
    expect(mineWard(sim, 'heart')).toBe(true);
    expect(story()).toContain('gloam_heart');

    defeat(sim, 'gloam_heart');
    const heart = sim.bosses.arenaOf('gloam_heart');
    if (heart) expect(sim.world.get(heart.bossX, heart.bossY)).toBe(tileId('heartlight'));
    step(sim, 0.1);
    expect(sim.gloam.growScale).toBe(0);
    expect(sim.dimming.nextDimmingDay()).toBe(-1);
    expect(story().every((s) => s.endsWith(':done'))).toBe(true);
  });
});
