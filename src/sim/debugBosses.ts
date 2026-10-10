import { DIMMING, TILE_SIZE } from '../config';
import { DEPTH_LAYERS } from '../data/biomes';
import { WARDS } from '../data/wards';
import { prefabByKey } from '../data/prefabs';
import { AIR } from './world/World';
import { BOSSES, bossFlag } from '../data/bosses';
import { ENEMIES } from '../data/enemies';
import type { Simulation } from './Simulation';

/**
 * Debug starts for M12 (`?boss=<key>`, `?arena=<key>`, `?beaten=<keys>`, `?dimming=1`,
 * `?bossphase=<n>`), so fights and Dimming nights can be screenshotted and tried at once. They
 * change the world through the same flags and systems play would.
 */

/** Tiles outside an arena's west gate that `?arena=` stands. */
const OUTSIDE_TILES = 3;
/** How far into a phase `?bossphase=` puts the boss's health (share of max health). */
const PHASE_LEAD = 0.02;
/** How far past dusk `?dimming=1` sets the clock (day fraction): at full strength already. */
const DIMMING_LEAD = 0.08;

/**
 * Feet position (tile x, the row the feet rest on) for `?boss=` (inside the trigger, so the fight
 * begins) or `?arena=` (just outside, so it doesn't), or null if the world has no such arena.
 */
export function arenaSpot(
  sim: Simulation,
  key: string,
  inside: boolean,
): { x: number; y: number } | null {
  const arena = sim.bosses.arenaOf(key);
  if (!arena) return null;
  if (inside) {
    // The prefab's `start` point (a debug stand-point in the thick of it), else in the trigger.
    const start = prefabByKey(arena.def.arena).objects.find((o) => o.kind === 'start');
    if (start) return { x: arena.place.x0 + start.x0, y: arena.place.y0 + start.y0 + 1 };
    const t = arena.trigger;
    const x = Math.floor((t.x0 + t.x1) / 2) - Math.floor((t.x1 - t.x0) / 4);
    return { x, y: t.y1 + 1 };
  }
  const door = arena.doors[0];
  if (!door) return { x: arena.bounds.x0 - OUTSIDE_TILES, y: arena.bounds.y1 + 1 };
  return { x: door.x0 - OUTSIDE_TILES, y: door.y1 + 1 };
}

/** Marks bosses as already beaten (their wards break, festivals and villagers follow). */
export function beatBosses(sim: Simulation, keys: readonly string[]): void {
  for (const key of keys) {
    if (!BOSSES.some((b) => b.key === key)) {
      console.warn(`Unknown boss ${key}`);
      continue;
    }
    sim.progression.set(bossFlag(key));
    const arena = sim.bosses.arenaOf(key);
    if (!arena) continue;
    arena.state = 'won';
    sim.bosses.run(arena)?.won(); // the arena as a win leaves it (lit lamps, the Heartlight)
  }
}

/** Columns from the spawn, size and headroom of the pocket `?spot=ward` opens on the first ward. */
const WARD_SPOT = { offset: 70, halfWidth: 8, rows: 6 } as const;

/**
 * `?spot=ward`: a pocket cut on top of the first ward band, a little way from the spawn column,
 * so the warded stone can be seen (and tried with a pickaxe).
 */
export function wardSpot(sim: Simulation): { x: number; y: number } | null {
  const ward = WARDS[0];
  const layer = DEPTH_LAYERS.findIndex((l) => l.key === ward?.layer);
  const top = sim.world.layerTops[layer];
  if (!ward || top === undefined) return null;
  const x = Math.floor(sim.spawnX / TILE_SIZE) + WARD_SPOT.offset;
  for (let y = top - WARD_SPOT.rows; y < top; y++) {
    for (let dx = -WARD_SPOT.halfWidth; dx <= WARD_SPOT.halfWidth; dx++) {
      if (sim.world.inBounds(x + dx, y)) sim.world.set(x + dx, y, AIR);
    }
  }
  return { x, y: top };
}

/** Starts a fight at once and skips the intro (screenshots of the fight itself). */
export function startFight(sim: Simulation, key: string, phase: number): void {
  const arena = sim.bosses.arenaOf(key);
  if (!arena) return;
  sim.bosses.begin(arena);
  const boss = arena.boss;
  if (!boss) return;
  const at = arena.def.phases[phase]?.at;
  const max = ENEMIES[boss.type]?.maxHealth ?? boss.health;
  if (phase > 0 && at !== undefined) boss.health = Math.max(1, (at - PHASE_LEAD) * max);
}

/** Tonight is a Dimming night, already at full strength. */
export function startDimming(sim: Simulation): void {
  const day = Math.max(DIMMING.firstDay, sim.dimming.nextDimmingDay());
  const f = DIMMING.startsAt + DIMMING_LEAD;
  sim.setDayFraction(f);
  sim.dimming.restore(day, sim.dimming.survived, f);
}
