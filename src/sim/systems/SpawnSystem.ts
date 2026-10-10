import { DIMMING, SPAWN, TILE_SIZE } from '../../config';
import { ENEMIES, type EnemyDef } from '../../data/enemies';
import { createEnemy, type Enemy } from '../entities/Enemy';
import type { Player } from '../entities/Player';
import type { EventBus, SimEvents } from '../events';
import { placeKeyAt } from '../world/biomeAt';
import type { World } from '../world/World';
import type { TileRect } from './GloamSystem';

const GROUND_AI = new Set(['walker', 'hopper']);
const SHADE = ENEMIES.findIndex((e) => e.key === 'shade');
const spawnedPayload = { id: 0, type: 0, x: 0, y: 0 };

export interface SpawnContext {
  enemies: Enemy[];
  world: World;
  player: Player;
  /** Where the light grid is current (spawns need to know the light); null before it exists. */
  region: TileRect | null;
  /** Centre of the player's view, tiles (spawns happen just outside the view). */
  focusX: number;
  focusY: number;
  /** True in daylight (sun above the horizon). */
  day: boolean;
  random: () => number;
  nextId: () => number;
  events: EventBus<SimEvents>;
  /** Beacons' safe circles: nothing spawns inside. */
  safe: (x: number, y: number) => boolean;
  /** Share of spawn ticks that go ahead (1 normally; less during a boss fight, M12). */
  rate: number;
}

/**
 * Spawning by biome, depth, light and time (plan 3.4 SpawnSystem). A few times a second it tries
 * random cells of the lit region that lie outside the view (so nothing pops in on screen): each
 * cell offers the creatures whose place and time match, weighted; shades only where it is dark,
 * and more of them on Gloam. Ground creatures need floor under them, flyers and shades open air,
 * burrowers rock. Creatures far from the player are removed.
 */
export class SpawnSystem {
  private timer = 0;
  private readonly weights: number[] = new Array<number>(ENEMIES.length).fill(0);
  private readonly alive: number[] = new Array<number>(ENEMIES.length).fill(0);

  update(ctx: SpawnContext, dt: number): void {
    const { enemies, player } = ctx;
    // Despawn the far-away.
    const px = (player.body.x + player.body.width / 2) / TILE_SIZE;
    const py = (player.body.y + player.body.height / 2) / TILE_SIZE;
    for (let i = enemies.length - 1; i >= 0; i--) {
      const e = enemies[i];
      // A boss fight's creatures stay until it ends.
      if (!e || e.summoned || ENEMIES[e.type]?.bound) continue;
      const ex = (e.body.x + e.body.width / 2) / TILE_SIZE;
      const ey = (e.body.y + e.body.height / 2) / TILE_SIZE;
      if (Math.hypot(ex - px, ey - py) > SPAWN.despawnTiles) {
        enemies[i] = enemies[enemies.length - 1] ?? e;
        enemies.pop();
      }
    }

    this.timer += dt;
    if (this.timer < SPAWN.interval) return;
    this.timer = 0;
    if (ctx.rate < 1 && ctx.random() >= ctx.rate) return;
    if (!ctx.region || enemies.length >= SPAWN.maxEnemies) return;
    this.alive.fill(0);
    for (const e of enemies) this.alive[e.type] = (this.alive[e.type] ?? 0) + 1;
    for (let a = 0; a < SPAWN.attemptsPerTick; a++) {
      if (this.tryOnce(ctx)) return; // at most one per tick
    }
  }

  /**
   * A Dimming night's wave (M12): up to `count` shades rise in dark open air in a ring
   * DIMMING.waveMinTiles–waveMaxTiles around the player (never inside a safe circle), up to
   * DIMMING.maxShades at once. Returns how many rose.
   */
  wave(ctx: SpawnContext, count: number): number {
    const { world, random, player, enemies } = ctx;
    const def = ENEMIES[SHADE];
    if (!def) return 0;
    let shades = 0;
    for (const e of enemies) if (e.type === SHADE) shades++;
    const px = (player.body.x + player.body.width / 2) / TILE_SIZE;
    const py = (player.body.y + player.body.height / 2) / TILE_SIZE;
    let risen = 0;
    for (let a = 0; a < DIMMING.waveAttempts && risen < count; a++) {
      if (shades + risen >= DIMMING.maxShades) break;
      const angle = random() * Math.PI * 2;
      const r = DIMMING.waveMinTiles + random() * (DIMMING.waveMaxTiles - DIMMING.waveMinTiles);
      const x = Math.floor(px + Math.cos(angle) * r);
      const y = Math.floor(py + Math.sin(angle) * r);
      if (!world.inBounds(x, y) || ctx.safe(x, y)) continue;
      const i = y * world.width + x;
      const light = Math.max(world.lightR[i] ?? 0, world.lightG[i] ?? 0, world.lightB[i] ?? 0);
      if (light > DIMMING.waveDarkLight) continue;
      const feet = findFeet(world, def, x, y);
      if (!feet) continue;
      const enemy = createEnemy(ctx.nextId(), SHADE, feet.x, feet.y);
      enemies.push(enemy);
      spawnedPayload.id = enemy.id;
      spawnedPayload.type = SHADE;
      spawnedPayload.x = feet.x;
      spawnedPayload.y = feet.y;
      ctx.events.emit('enemySpawned', spawnedPayload);
      risen++;
    }
    return risen;
  }

  private tryOnce(ctx: SpawnContext): boolean {
    const { world, region, random } = ctx;
    if (!region) return false;
    const x = region.x0 + Math.floor(random() * region.width);
    const y = region.y0 + Math.floor(random() * region.height);
    // Outside the view, so nothing appears on screen.
    const offX = Math.abs(x + 0.5 - ctx.focusX) >= SPAWN.viewHalfWidth;
    const offY = Math.abs(y + 0.5 - ctx.focusY) >= SPAWN.viewHalfHeight;
    if ((!offX && !offY) || !world.inBounds(x, y) || ctx.safe(x, y)) return false;

    const i = y * world.width + x;
    const light = Math.max(world.lightR[i] ?? 0, world.lightG[i] ?? 0, world.lightB[i] ?? 0);
    const place = placeKeyAt(world, x, y);
    const gloam = (world.gloam[i] ?? 0) / 255;
    let total = 0;
    for (let t = 0; t < ENEMIES.length; t++) {
      const def = ENEMIES[t];
      this.weights[t] = 0;
      const cap = def?.ai === 'shade' ? SPAWN.maxShades : SPAWN.maxPerType;
      if (!def || (this.alive[t] ?? 0) >= cap || !eligible(def, place, ctx.day, light)) continue;
      const w =
        def.ai === 'shade'
          ? def.spawn.weight * (1 + gloam * SPAWN.gloamShadeBoost)
          : def.spawn.weight;
      this.weights[t] = w;
      total += w;
    }
    if (total <= 0) return false;
    let roll = random() * total;
    let type = 0;
    for (let t = 0; t < ENEMIES.length; t++) {
      roll -= this.weights[t] ?? 0;
      if (roll <= 0) {
        type = t;
        break;
      }
    }
    const def = ENEMIES[type];
    if (!def) return false;
    const feet = findFeet(world, def, x, y);
    if (!feet) return false;
    const enemy = createEnemy(ctx.nextId(), type, feet.x, feet.y);
    ctx.enemies.push(enemy);
    spawnedPayload.id = enemy.id;
    spawnedPayload.type = type;
    spawnedPayload.x = feet.x;
    spawnedPayload.y = feet.y;
    ctx.events.emit('enemySpawned', spawnedPayload);
    return true;
  }
}

function eligible(def: EnemyDef, place: string, day: boolean, light: number): boolean {
  const s = def.spawn;
  if (!s.places.includes('any') && !s.places.includes(place)) return false;
  if ((s.time === 'day' && !day) || (s.time === 'night' && day)) return false;
  if (s.dark && light > SPAWN.darkLight) return false;
  return true;
}

/** Where the creature's feet go for a spawn tried at cell (x, y), or null if it won't fit. */
function findFeet(
  world: World,
  def: EnemyDef,
  x: number,
  y: number,
): { x: number; y: number } | null {
  const w = Math.ceil(def.width / TILE_SIZE);
  const h = Math.ceil(def.height / TILE_SIZE);
  const open = (cx: number, cy: number) => {
    for (let ty = cy - h + 1; ty <= cy; ty++) {
      for (let tx = cx; tx < cx + w; tx++) {
        if (!world.inBounds(tx, ty) || world.isSolid(tx, ty)) return false;
      }
    }
    return true;
  };
  if (def.ai === 'burrower') {
    // In rock, but next to a cave (within a few tiles above), so it can reach someone.
    if (!world.isSolid(x, y)) return null;
    let nearAir = false;
    for (let dy = 1; dy <= SPAWN.burrowerAirSearch && !nearAir; dy++) {
      nearAir = world.inBounds(x, y - dy) && !world.isSolid(x, y - dy);
    }
    return nearAir ? { x: (x + 0.5) * TILE_SIZE, y: (y + 1) * TILE_SIZE } : null;
  }
  if (!GROUND_AI.has(def.ai)) {
    return open(x, y) ? { x: (x + w / 2) * TILE_SIZE, y: (y + 1) * TILE_SIZE } : null;
  }
  // Ground creatures: fall from the cell to the floor below (not too far).
  if (world.isSolid(x, y)) return null;
  let fy = y;
  while (fy < y + SPAWN.groundSearch && world.inBounds(x, fy + 1) && !world.isSolid(x, fy + 1))
    fy++;
  if (!world.isSolid(x, fy + 1) || !open(x, fy)) return null;
  for (let tx = x; tx < x + w; tx++) if (!world.isSolid(tx, fy + 1)) return null;
  return { x: (x + w / 2) * TILE_SIZE, y: (fy + 1) * TILE_SIZE };
}
