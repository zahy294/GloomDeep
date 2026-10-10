import { BOSS, TILE_SIZE } from '../../config';
import { BOSSES, bossFlag, type BossDef } from '../../data/bosses';
import { ENEMIES, enemyIndex } from '../../data/enemies';
import { prefabByKey } from '../../data/prefabs';
import { tileId } from '../../data/tiles';
import { createEnemy, type Enemy } from '../entities/Enemy';
import type { EventBus, SimEvents } from '../events';
import type { World } from '../world/World';
import { AIR } from '../world/World';
import type { TownPlace } from '../world/worldData';
import type { LightPoint } from './LightSystem';
import type { ProgressionSystem } from './ProgressionSystem';
import { createHeartRun } from './bosses/gloamHeart';
import { createWardenRun } from './bosses/hollowWarden';
import { createMireRun } from './bosses/mireSovereign';
import { createMothRun } from './bosses/mothMatriarch';
import type { Arena, BossContext, BossRun, HostileShot, TileBox } from './bosses/types';

const SEAL = tileId(BOSS.sealTile);
const introPayload = { key: '', name: '', epithet: '', x: 0, y: 0 };
const phasePayload = { key: '', phase: 0 };
const defeatedPayload = { key: '', name: '', reward: '', x: 0, y: 0 };
const resetPayload = { key: '' };

/** The arena of a placed prefab: its objects moved into world tiles. */
function buildArena(def: BossDef, place: TownPlace): Arena {
  const prefab = prefabByKey(def.arena);
  const box = (kind: string): TileBox | null => {
    const o = prefab.objects.find((k) => k.kind === kind);
    return o
      ? { x0: place.x0 + o.x0, y0: place.y0 + o.y0, x1: place.x0 + o.x1, y1: place.y0 + o.y1 }
      : null;
  };
  const whole = { x0: place.x0, y0: place.y0, x1: place.x1, y1: place.y1 };
  const boss = prefab.objects.find((o) => o.kind === 'boss');
  return {
    def,
    place,
    bounds: box('arena') ?? whole,
    trigger: box('trigger') ?? whole,
    doors: prefab.objects
      .filter((o) => o.kind === 'door')
      .map((o) => ({
        x0: place.x0 + o.x0,
        y0: place.y0 + o.y0,
        x1: place.x0 + o.x1,
        y1: place.y0 + o.y1,
      })),
    bossX: place.x0 + (boss?.x0 ?? Math.floor(prefab.width / 2)),
    bossY: place.y0 + (boss?.y0 ?? Math.floor(prefab.height / 2)),
    pool: box('pool'),
    state: 'idle',
    timer: 0,
    boss: null,
    phase: 0,
  };
}

function createRun(arena: Arena, ctx: BossContext): BossRun {
  const def = arena.def;
  switch (def.script) {
    case 'moth':
      return createMothRun(arena as Arena<typeof def>, ctx);
    case 'mire':
      return createMireRun(arena as Arena<typeof def>, ctx);
    case 'warden':
      return createWardenRun(arena as Arena<typeof def>, ctx);
    case 'heart':
      return createHeartRun(arena as Arena<typeof def>, ctx);
  }
}

const inside = (b: TileBox, x: number, y: number, margin = 0) =>
  x >= b.x0 - margin && x <= b.x1 + margin && y >= b.y0 - margin && y <= b.y1 + margin;

/**
 * Boss fights (plan 1.4, M12). Each arena waits until the player steps into its trigger; then its
 * doorways seal with roots, the boss appears and holds still for the intro (BOSS.introSeconds),
 * and its script (src/sim/systems/bosses/) runs the fight through its phases. The fight ends when
 * the boss falls (its flag `boss:<key>` is set, the roots fall away), or when the player dies or
 * leaves the arena: then the boss and its creatures vanish and the arena is put back as it was.
 * Hostile shots from all scripts live here. Fights are not saved; a loaded world resets arenas.
 */
export class BossSystem {
  readonly arenas: Arena[] = [];
  /** The fight in progress, or null. */
  active: Arena | null = null;
  /** Hostile shots of every fight (the scripts add to the context's list, which this is). */
  readonly shots: HostileShot[];
  private readonly runs = new Map<Arena, BossRun>();
  private checkTimer = 0;
  private readonly unsubscribe: (() => void)[];

  constructor(
    private readonly world: World,
    private readonly events: EventBus<SimEvents>,
    private readonly progression: ProgressionSystem,
    private readonly ctx: BossContext,
    private readonly hurt: (amount: number, dir: number) => void,
    places: readonly TownPlace[],
  ) {
    this.shots = ctx.shots;
    for (const place of places) {
      const def = BOSSES.find((b) => b.key === place.key);
      if (!def) continue;
      const arena = buildArena(def, place);
      if (progression.has(bossFlag(def.key))) arena.state = 'won';
      this.arenas.push(arena);
      this.runs.set(arena, createRun(arena, ctx));
    }
    this.unsubscribe = [
      events.on('enemyDied', ({ id }) => {
        const a = this.active;
        if (a?.boss && a.boss.id === id) this.win(a);
      }),
      events.on('enemyHit', ({ id, source }) => {
        const a = this.active;
        if (a?.boss && a.boss.id === id && source !== 'light') this.runs.get(a)?.hit();
      }),
    ];
  }

  destroy(): void {
    for (const off of this.unsubscribe) off();
  }

  run(arena: Arena): BossRun | undefined {
    return this.runs.get(arena);
  }

  arenaOf(key: string): Arena | undefined {
    return this.arenas.find((a) => a.def.key === key);
  }

  /** The arena containing tile (x, y), if any. */
  arenaAt(x: number, y: number): Arena | undefined {
    return this.arenas.find((a) => inside(a.bounds, x, y));
  }

  /** A loaded world: wins from the flags; every other arena put back as it was (no fight). */
  restore(): void {
    for (const arena of this.arenas) {
      this.unseal(arena);
      if (this.progression.has(bossFlag(arena.def.key))) {
        arena.state = 'won';
        continue;
      }
      arena.state = 'idle';
      this.runs.get(arena)?.reset();
    }
  }

  /** Right-click on an arena fixture (lever, prism, root-lamp). */
  use(x: number, y: number): boolean {
    const arena = this.arenaAt(x, y);
    if (!arena || arena.state === 'won') return false;
    const pb = this.ctx.player.body;
    const px = (pb.x + pb.width / 2) / TILE_SIZE;
    const py = (pb.y + pb.height / 2) / TILE_SIZE;
    if (Math.hypot(x + 0.5 - px, y + 0.5 - py) > BOSS.useReach) return false;
    return this.runs.get(arena)?.use(x, y) ?? false;
  }

  update(dt: number): void {
    const player = this.ctx.player;
    const a = this.active;
    if (a) {
      a.timer += dt;
      const boss = a.boss;
      if (a.state === 'intro' && a.timer >= BOSS.introSeconds) {
        a.state = 'fight';
        a.timer = 0;
        if (boss) boss.harmless = false;
      }
      if (a.state === 'fight' && boss) {
        this.runs.get(a)?.update(dt);
        // The script's own burn may have ended the fight this step.
        if (this.active === a) this.updatePhase(a, boss);
      }
    }
    this.updateShots(dt);
    this.checkTimer += dt;
    if (this.checkTimer < BOSS.checkSeconds) return;
    this.checkTimer = 0;
    const b = player.body;
    const fx = Math.floor((b.x + b.width / 2) / TILE_SIZE);
    const fy = Math.floor((b.y + b.height - 1) / TILE_SIZE);
    if (this.active) {
      const left = !inside(this.active.bounds, fx, fy, BOSS.leaveMargin);
      if (player.dead || left) this.lose(this.active);
      return;
    }
    if (player.dead) return;
    for (const arena of this.arenas) {
      if (arena.state === 'idle' && inside(arena.trigger, fx, fy)) {
        this.begin(arena);
        return;
      }
    }
  }

  /** Moving lights for the light grid. */
  lights(out: LightPoint[]): void {
    const a = this.active;
    if (a) this.runs.get(a)?.lights(out);
  }

  /** Starts a fight at once (debug starts and tests): as if the player had stepped in. */
  begin(arena: Arena): void {
    if (this.active || arena.state === 'won') return;
    const def = arena.def;
    const type = enemyIndex(def.enemy);
    const boss = createEnemy(
      this.ctx.nextId(),
      type,
      (arena.bossX + 0.5) * TILE_SIZE,
      (arena.bossY + 1) * TILE_SIZE,
    );
    boss.harmless = true;
    boss.damageTaken = 0;
    this.ctx.enemies.push(boss);
    arena.boss = boss;
    arena.phase = 0;
    arena.state = 'intro';
    arena.timer = 0;
    this.active = arena;
    this.seal(arena);
    this.runs.get(arena)?.start();
    introPayload.key = def.key;
    introPayload.name = def.name;
    introPayload.epithet = def.epithet;
    introPayload.x = boss.body.x + boss.body.width / 2;
    introPayload.y = boss.body.y + boss.body.height / 2;
    this.events.emit('bossIntro', introPayload);
  }

  private updatePhase(a: Arena, boss: Enemy): void {
    const share = boss.health / (ENEMIES[boss.type]?.maxHealth ?? 1);
    let phase = 0;
    const phases = a.def.phases;
    for (let i = 0; i < phases.length; i++) if (share <= (phases[i]?.at ?? 0)) phase = i;
    if (phase <= a.phase) return;
    a.phase = phase;
    this.runs.get(a)?.phaseChanged(phase);
    phasePayload.key = a.def.key;
    phasePayload.phase = phase;
    this.events.emit('bossPhase', phasePayload);
  }

  private win(a: Arena): void {
    const boss = a.boss;
    a.state = 'won';
    a.boss = null;
    this.active = null;
    this.clearFight(a);
    this.runs.get(a)?.won();
    this.progression.set(bossFlag(a.def.key));
    defeatedPayload.key = a.def.key;
    defeatedPayload.name = a.def.name;
    defeatedPayload.reward = a.def.reward;
    defeatedPayload.x = boss ? boss.body.x + boss.body.width / 2 : (a.bossX + 0.5) * TILE_SIZE;
    defeatedPayload.y = boss ? boss.body.y + boss.body.height / 2 : (a.bossY + 0.5) * TILE_SIZE;
    this.events.emit('bossDefeated', defeatedPayload);
  }

  private lose(a: Arena): void {
    if (a.boss) this.ctx.remove(a.boss);
    a.boss = null;
    a.state = 'idle';
    this.active = null;
    this.clearFight(a);
    this.runs.get(a)?.reset();
    resetPayload.key = a.def.key;
    this.events.emit('bossReset', resetPayload);
  }

  /** Ends a fight: the roots fall away, its shots fade and its creatures go. */
  private clearFight(a: Arena): void {
    this.unseal(a);
    this.shots.length = 0;
    const enemies = this.ctx.enemies;
    for (let i = enemies.length - 1; i >= 0; i--) {
      const e = enemies[i];
      if (!e || !(e.summoned || ENEMIES[e.type]?.bound)) continue;
      const tx = Math.floor((e.body.x + e.body.width / 2) / TILE_SIZE);
      const ty = Math.floor((e.body.y + e.body.height / 2) / TILE_SIZE);
      if (inside(a.bounds, tx, ty, BOSS.leaveMargin + BOSS.minionSpread)) this.ctx.remove(e);
    }
  }

  private seal(a: Arena): void {
    for (const d of a.doors) {
      for (let y = d.y0; y <= d.y1; y++) {
        for (let x = d.x0; x <= d.x1; x++) {
          if (this.world.inBounds(x, y) && this.world.get(x, y) === AIR) this.world.set(x, y, SEAL);
        }
      }
    }
  }

  private unseal(a: Arena): void {
    for (const d of a.doors) {
      for (let y = d.y0; y <= d.y1; y++) {
        for (let x = d.x0; x <= d.x1; x++) {
          if (this.world.inBounds(x, y) && this.world.get(x, y) === SEAL) this.world.set(x, y, AIR);
        }
      }
    }
  }

  private updateShots(dt: number): void {
    const { world, player } = this.ctx;
    const pb = player.body;
    const list = this.shots;
    for (let i = list.length - 1; i >= 0; i--) {
      const s = list[i];
      if (!s) continue;
      s.life -= dt;
      s.vy += s.gravity * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      let gone = s.life <= 0;
      if (!gone && s.solid) {
        const tx = Math.floor(s.x / TILE_SIZE);
        const ty = Math.floor(s.y / TILE_SIZE);
        gone = !world.inBounds(tx, ty) || world.isSolid(tx, ty);
      }
      if (!gone && !player.dead) {
        const nx = Math.max(pb.x, Math.min(s.x, pb.x + pb.width));
        const ny = Math.max(pb.y, Math.min(s.y, pb.y + pb.height));
        if ((nx - s.x) ** 2 + (ny - s.y) ** 2 <= s.radius * s.radius) {
          this.hurt(s.damage, Math.sign(pb.x + pb.width / 2 - s.x) || 1);
          gone = true;
        }
      }
      if (gone) {
        list[i] = list[list.length - 1] ?? s;
        list.pop();
      }
    }
  }
}
