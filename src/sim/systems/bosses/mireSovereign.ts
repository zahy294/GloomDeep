import { BOSS, TILE_SIZE } from '../../../config';
import { LIQUID } from '../../../data/biomes';
import type { MireDef } from '../../../data/bosses';
import { ENEMIES } from '../../../data/enemies';
import { tileId } from '../../../data/tiles';
import { createCone, inCone, lanternCone } from '../lanternCone';
import { summonedCount, type Arena, type BossContext, type BossRun } from './types';

/** Both ways along the water (waves). */
const BOTH_WAYS = [-1, 1] as const;

const T = TILE_SIZE;
const FULL = 255;
/** Rows of water per second while a flood rises or a sluice drains, as a share of `floodRows / floodSeconds`. */
const DRAIN_RATE = 2;

/**
 * The Mire Sovereign (plan 1.4): it floods its pool with dark water. It sinks and rises in turn;
 * risen, it spits arcing water bolts (and from phase 2 rolls a wave along the water). Every few
 * seconds the water rises; braziers under it drown and go out, and the Sovereign only feels your
 * blows fully when it is lit — a burning brazier within `brazierReach` tiles or your lantern's cone
 * on it (sky light doesn't count: it is used to the moon) — so pull the sluice levers to drain
 * the pool, keep the braziers above the flood and your lantern on it.
 */
export function createMireRun(arena: Arena<MireDef>, ctx: BossContext): BossRun {
  const def = arena.def;
  const pool = arena.pool ?? arena.bounds;
  const lever = tileId(def.lever);
  const leverOpen = tileId(def.leverOpen);
  const brazier = tileId(def.brazier);
  const brazierOut = tileId(def.brazierOut);
  const minionType = ENEMIES.findIndex((e) => e.key === def.minion);
  const maxLevel = Math.min(def.maxLevel, pool.y1 - pool.y0 - 1);
  const braziers: [number, number][] = [];
  const levers: { x: number; y: number; rest: number }[] = [];
  for (let y = arena.bounds.y0; y <= arena.bounds.y1; y++) {
    for (let x = arena.bounds.x0; x <= arena.bounds.x1; x++) {
      const id = ctx.world.get(x, y);
      if (id === brazier || id === brazierOut) braziers.push([x, y]);
      if (id === lever || id === leverOpen) levers.push({ x, y, rest: 0 });
    }
  }
  const view = {
    script: 'mire' as const,
    level: def.startLevel,
    target: def.startLevel,
    submerged: true,
    murk: false,
  };
  let mode: 'under' | 'up' = 'under';
  let t = 0;
  let floodT = 0;
  let boltT = 0;
  let minionT = 0;
  let applied = -1;
  const changed = {
    x0: pool.x0,
    y0: pool.y0,
    width: pool.x1 - pool.x0 + 1,
    height: pool.y1 - pool.y0 + 1,
  };

  /** The top water row for a depth. */
  const topRow = (level: number) => pool.y1 - Math.round(level) + 1;
  const surfaceY = () => (pool.y1 + 1 - view.level) * T;

  /** Writes the water level into the pool and drowns or relights the braziers. */
  const applyWater = (force = false) => {
    const top = topRow(view.level);
    if (top !== applied || force) {
      applied = top;
      const { world } = ctx;
      for (let y = pool.y0; y <= pool.y1; y++) {
        for (let x = pool.x0; x <= pool.x1; x++) {
          if (world.isSolid(x, y)) continue;
          const i = world.index(x, y);
          if (y >= top) {
            world.liquid[i] = FULL;
            world.liquidType[i] = LIQUID.water;
          } else if (world.liquidType[i] === LIQUID.water) {
            world.liquid[i] = 0;
            world.liquidType[i] = LIQUID.none;
          }
        }
      }
      ctx.events.emit('liquidChanged', changed);
    }
    for (const [x, y] of braziers) {
      const under = y >= top;
      const id = ctx.world.get(x, y);
      if (under && id === brazier) ctx.world.set(x, y, brazierOut);
      else if (!under && id === brazierOut) ctx.world.set(x, y, brazier);
    }
  };

  const cone = createCone();
  /** Lit by a burning brazier near it, or by the lantern's cone. */
  const litNow = (tx: number, ty: number): boolean => {
    const r2 = def.brazierReach * def.brazierReach;
    for (const [x, y] of braziers) {
      if (ctx.world.get(x, y) === brazier && (x - tx) ** 2 + (y - ty) ** 2 <= r2) return true;
    }
    if (!ctx.lanternLit()) return false;
    return inCone(lanternCone(ctx.player, ctx.input, ctx.lens(), cone), tx, ty);
  };

  const bodyAt = (submerged: boolean) => {
    const body = arena.boss?.body;
    if (!body) return;
    body.y = submerged ? surfaceY() + T / 2 : surfaceY() - body.height * 0.6;
  };

  const bolt = () => {
    const body = arena.boss?.body;
    if (!body) return;
    const sx = body.x + body.width / 2;
    const sy = body.y + body.height * 0.3;
    const pb = ctx.player.body;
    const dx = pb.x + pb.width / 2 - sx;
    const dy = pb.y + pb.height / 2 - sy;
    // A lob: flight time from the horizontal distance, then the upward speed that lands it.
    const time = Math.min(def.boltMaxTime, Math.max(def.boltMinTime, Math.abs(dx) / def.boltSpeed));
    ctx.shots.push({
      kind: 'bolt',
      x: sx,
      y: sy,
      vx: dx / time,
      vy: (dy - 0.5 * def.boltGravity * time * time) / time,
      gravity: def.boltGravity,
      radius: BOSS.shotRadius + 1,
      damage: def.boltDamage,
      life: BOSS.shotLife,
      solid: true,
    });
  };

  const wave = () => {
    const body = arena.boss?.body;
    if (!body) return;
    const life = ((pool.x1 - pool.x0) * T) / def.waveSpeed;
    for (const dir of BOTH_WAYS) {
      ctx.shots.push({
        kind: 'wave',
        x: body.x + body.width / 2,
        y: surfaceY() - T / 2,
        vx: dir * def.waveSpeed,
        vy: 0,
        gravity: 0,
        radius: T * 0.75,
        damage: def.waveDamage,
        life,
        solid: true,
      });
    }
  };

  return {
    view,
    start() {
      mode = 'under';
      t = 0;
      floodT = 0;
      minionT = 0;
      view.level = view.target = def.startLevel;
      applyWater(true);
      bodyAt(true);
    },
    update(dt) {
      const boss = arena.boss;
      if (!boss) return;
      const p = arena.phase;
      t += dt;
      // Floods and drains.
      floodT += dt;
      if (floodT >= (def.floodEvery[p] ?? def.floodEvery[0] ?? 0)) {
        floodT = 0;
        view.target = Math.min(maxLevel, view.target + def.floodRows);
        ctx.action('flood', boss.body.x + boss.body.width / 2, surfaceY());
      }
      const rate = (def.floodRows / def.floodSeconds) * (view.target < view.level ? DRAIN_RATE : 1);
      if (view.level < view.target) view.level = Math.min(view.target, view.level + rate * dt);
      else if (view.level > view.target) view.level = Math.max(view.target, view.level - rate * dt);
      applyWater();
      for (const l of levers) {
        if (l.rest <= 0) continue;
        l.rest -= dt;
        if (l.rest <= 0 && ctx.world.get(l.x, l.y) === leverOpen) ctx.world.set(l.x, l.y, lever);
      }

      const pb = ctx.player.body;
      const px = pb.x + pb.width / 2;
      if (mode === 'under') {
        // Swims under the dark water towards the player's side.
        const cx = boss.body.x + boss.body.width / 2;
        const step = Math.sign(px - cx) * Math.min(Math.abs(px - cx), def.swimSpeed * dt);
        boss.body.x += step;
        boss.body.x = Math.max(
          pool.x0 * T,
          Math.min((pool.x1 + 1) * T - boss.body.width, boss.body.x),
        );
        if (step !== 0) boss.facing = step > 0 ? 1 : -1;
        bodyAt(true);
        boss.harmless = true;
        boss.damageTaken = 0;
        view.submerged = true;
        view.murk = false;
        if (t >= def.sinkSeconds) {
          mode = 'up';
          t = 0;
          boltT = 0;
          if (p >= def.wavePhase) wave();
        }
      } else {
        bodyAt(false);
        boss.facing = px >= boss.body.x + boss.body.width / 2 ? 1 : -1;
        boss.harmless = false;
        view.submerged = false;
        const tx = Math.floor((boss.body.x + boss.body.width / 2) / T);
        const ty = Math.floor((boss.body.y + boss.body.height / 2) / T);
        const lit = litNow(tx, ty);
        view.murk = !lit;
        boss.damageTaken = lit ? 1 : def.murkDamage;
        const bolts = def.bolts[p] ?? def.bolts[0] ?? 1;
        boltT += dt;
        if (boltT >= def.riseSeconds / (bolts + 1)) {
          boltT = 0;
          bolt();
          ctx.action('volley', boss.body.x + boss.body.width / 2, boss.body.y);
        }
        if (t >= def.riseSeconds) {
          mode = 'under';
          t = 0;
        }
      }
      if (p >= def.minionPhase && minionType >= 0) {
        minionT += dt;
        if (minionT >= def.minionEvery) {
          minionT = 0;
          if (summonedCount(ctx.enemies, minionType) < def.minionCap) {
            // On a ledge above the water: drop in from just under the rim.
            const x = pool.x0 + 2 + Math.floor(ctx.random() * (pool.x1 - pool.x0 - 4));
            ctx.spawn(def.minion, (x + 0.5) * T, (pool.y0 + 1) * T);
          }
        }
      }
    },
    phaseChanged() {},
    hit() {},
    use(x, y) {
      const l = levers.find((k) => k.x === x && k.y === y);
      if (!l) return false;
      if (l.rest > 0 || arena.state !== 'fight') return true;
      l.rest = def.leverRest;
      ctx.world.set(x, y, leverOpen);
      view.target = Math.max(0, view.target - def.drainRows);
      ctx.action('drain', (x + 0.5) * T, (y + 0.5) * T);
      return true;
    },
    reset() {
      view.level = view.target = def.startLevel;
      view.submerged = true;
      view.murk = false;
      applyWater(true);
      for (const l of levers) {
        l.rest = 0;
        if (ctx.world.get(l.x, l.y) === leverOpen) ctx.world.set(l.x, l.y, lever);
      }
    },
    won() {
      this.reset();
    },
    lights() {},
    status() {
      if (view.submerged) return 'Beneath the dark water';
      if (view.murk) return 'In the murk: light it up!';
      return '';
    },
  };
}
