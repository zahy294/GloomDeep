import { BOSS, ENEMY_AI, TILE_SIZE } from '../../../config';
import type { MothDef } from '../../../data/bosses';
import { ENEMIES } from '../../../data/enemies';
import { lightByKey } from '../../../data/lights';
import { prefabByKey } from '../../../data/prefabs';
import { tileId } from '../../../data/tiles';
import { AIR } from '../../world/World';
import { summonedCount, type Arena, type BossContext, type BossRun } from './types';

const GLOW = lightByKey('moth_glow');
const T = TILE_SIZE;

type Mode = 'circle' | 'dive' | 'recover' | 'stunned';

/**
 * The Moth Matriarch (plan 1.4): drawn to light. She circles the brightest thing she can see —
 * a lure before anything, else the player while their lantern burns (or when they come very
 * close) — then dives at it. Diving into a lure bursts it and stuns her: she drops, harmless and
 * soft, for a few seconds. With the lantern out and no lure she loses track and drifts about the
 * nest. From phase 2 she sheds falling dust and calls her moths.
 */
export function createMothRun(arena: Arena<MothDef>, ctx: BossContext): BossRun {
  const def = arena.def;
  const lure = tileId(def.lureTile);
  const minionType = ENEMIES.findIndex((e) => e.key === def.minion);
  // The lures the nest starts with (put back when the arena resets).
  const prefab = prefabByKey(def.arena);
  const startLures: [number, number][] = [];
  prefab.fg.forEach((k, i) => {
    if (k === def.lureTile) {
      startLures.push([
        arena.place.x0 + (i % prefab.width),
        arena.place.y0 + Math.floor(i / prefab.width),
      ]);
    }
  });
  const view = { script: 'moth' as const, mode: 'circle' as Mode, lost: false };
  let t = 0;
  let angle = 0;
  let targetX = 0;
  let targetY = 0;
  let lureX = -1;
  let lureY = -1;
  let hasTarget = false;
  let diveX = 0;
  let diveY = 0;
  let dustT = 0;
  let minionT = 0;
  let seekT = 0;
  const light = { x: 0, y: 0, light: GLOW };
  const b = arena.bounds;

  /** Her centre now (one reused object). */
  const c = { x: 0, y: 0 };
  const centre = () => {
    const body = arena.boss?.body;
    c.x = body ? body.x + body.width / 2 : 0;
    c.y = body ? body.y + body.height / 2 : 0;
    return c;
  };
  /** Seconds she still knows where the player is after being struck. */
  let memory = 0;
  const setMode = (m: Mode) => {
    view.mode = m;
    t = 0;
  };

  /** Nearest lure in the nest, else the player if she can see them. */
  const seek = () => {
    const c = centre();
    let best = Infinity;
    lureX = -1;
    for (let y = b.y0; y <= b.y1; y++) {
      for (let x = b.x0; x <= b.x1; x++) {
        if (ctx.world.get(x, y) !== lure) continue;
        const d = ((x + 0.5) * T - c.x) ** 2 + ((y + 0.5) * T - c.y) ** 2;
        if (d < best) {
          best = d;
          lureX = x;
          lureY = y;
        }
      }
    }
    if (lureX >= 0) {
      targetX = (lureX + 0.5) * T;
      targetY = (lureY + 0.5) * T;
      hasTarget = true;
      view.lost = false;
      return;
    }
    const pb = ctx.player.body;
    const px = pb.x + pb.width / 2;
    const py = pb.y + pb.height / 2;
    const near = Math.hypot(px - c.x, py - c.y) <= def.blindRange * T;
    hasTarget = !ctx.player.dead && (ctx.lanternLit() || near || memory > 0);
    view.lost = !hasTarget;
    if (hasTarget) {
      targetX = px;
      targetY = py;
    } else {
      // Lost: drift about the upper middle of the nest.
      targetX = ((b.x0 + b.x1) / 2 + 0.5) * T;
      targetY = (b.y0 + (b.y1 - b.y0) * 0.3) * T;
    }
  };

  /** Moves the body's centre towards (x, y) at `speed`, kept inside the nest. */
  const moveTowards = (x: number, y: number, speed: number, dt: number) => {
    const body = arena.boss?.body;
    if (!body) return;
    const c = centre();
    const dx = x - c.x;
    const dy = y - c.y;
    const d = Math.hypot(dx, dy);
    const step = Math.min(d, speed * dt);
    body.vx = d > 0 ? (dx / d) * speed : 0;
    body.vy = d > 0 ? (dy / d) * speed : 0;
    if (d > 0) {
      body.x += (dx / d) * step;
      body.y += (dy / d) * step;
    }
    clamp();
  };
  const clamp = () => {
    const body = arena.boss?.body;
    if (!body) return;
    body.x = Math.max(b.x0 * T, Math.min((b.x1 + 1) * T - body.width, body.x));
    body.y = Math.max(b.y0 * T, Math.min((b.y1 + 1) * T - body.height, body.y));
  };

  return {
    view,
    start() {
      setMode('circle');
      angle = 0;
      dustT = 0;
      minionT = 0;
      seekT = 0;
      seek();
    },
    update(dt) {
      const boss = arena.boss;
      if (!boss) return;
      const p = arena.phase;
      const speed = def.speed[p] ?? def.speed[0] ?? 0;
      t += dt;
      seekT += dt;
      memory = Math.max(0, memory - dt);
      if (seekT >= BOSS.checkSeconds && view.mode !== 'dive') {
        seekT = 0;
        seek();
      }
      boss.harmless = view.mode === 'stunned';
      boss.damageTaken = view.mode === 'stunned' ? def.stunnedDamage : 1;
      const c = centre();
      switch (view.mode) {
        case 'circle': {
          const r = def.circleRadius * T;
          angle += (speed / r) * dt;
          // Circle above the target, a little flattened.
          moveTowards(
            targetX + Math.cos(angle) * r,
            targetY - r * 0.6 + Math.sin(angle) * r * 0.5,
            speed,
            dt,
          );
          if (hasTarget && t >= (def.circleSeconds[p] ?? def.circleSeconds[0] ?? 0)) {
            const dx = targetX - c.x;
            const dy = targetY - c.y;
            const d = Math.hypot(dx, dy) || 1;
            diveX = dx / d;
            diveY = dy / d;
            setMode('dive');
          }
          break;
        }
        case 'dive': {
          const v = speed * def.diveSpeed;
          boss.body.x += diveX * v * dt;
          boss.body.y += diveY * v * dt;
          boss.body.vx = diveX * v;
          boss.body.vy = diveY * v;
          clamp();
          if (lureX >= 0 && ctx.world.get(lureX, lureY) === lure) {
            const lx = (lureX + 0.5) * T;
            const ly = (lureY + 0.5) * T;
            if (
              Math.abs(lx - c.x) <= boss.body.width / 2 + T / 2 &&
              Math.abs(ly - c.y) <= boss.body.height / 2 + T / 2
            ) {
              // Into the lure: it bursts and she falls stunned.
              ctx.world.set(lureX, lureY, AIR);
              lureX = -1;
              ctx.action('stunned', c.x, c.y);
              setMode('stunned');
              break;
            }
          }
          if (t >= def.diveSeconds) setMode('recover');
          break;
        }
        case 'recover':
          moveTowards(c.x, (b.y0 + 2) * T, speed, dt);
          if (t >= def.recoverSeconds) setMode('circle');
          break;
        case 'stunned':
          boss.body.vx = 0;
          boss.body.vy = Math.min(boss.body.vy + ENEMY_AI.gravity * dt, ENEMY_AI.maxFallSpeed);
          boss.body.y += boss.body.vy * dt;
          // Settle on the nest floor (the arena's bottom row).
          clamp();
          if (t >= def.stunSeconds) setMode('recover');
          break;
      }
      if (boss.body.vx !== 0) boss.facing = boss.body.vx > 0 ? 1 : -1;

      // Dust while she hunts (phase 2 on).
      const dustEvery = def.dustEvery[p] ?? 0;
      if (dustEvery > 0 && hasTarget && view.mode === 'circle') {
        dustT += dt;
        if (dustT >= dustEvery) {
          dustT = 0;
          ctx.shots.push({
            kind: 'dust',
            x: c.x + (ctx.random() - 0.5) * boss.body.width,
            y: c.y + boss.body.height / 2,
            vx: (ctx.random() - 0.5) * def.dustFall * 0.5,
            vy: def.dustFall,
            gravity: 0,
            radius: BOSS.shotRadius,
            damage: def.dustDamage,
            life: BOSS.shotLife,
            solid: true,
          });
        }
      }
      if (p >= def.minionPhase && minionType >= 0) {
        minionT += dt;
        if (minionT >= def.minionEvery) {
          minionT = 0;
          let alive = summonedCount(ctx.enemies, minionType);
          for (let k = 0; k < def.minionsPerCall && alive < def.minionCap; k++, alive++) {
            ctx.spawn(def.minion, c.x + (ctx.random() - 0.5) * BOSS.minionSpread * T, c.y);
          }
        }
      }
    },
    phaseChanged() {
      minionT = def.minionEvery; // call the moths at once
    },
    hit() {
      // Struck from the dark: she turns on whoever did it.
      memory = def.hitMemory;
    },
    use() {
      return false;
    },
    reset() {
      setMode('circle');
      view.lost = false;
      memory = 0;
      for (const [x, y] of startLures) {
        if (ctx.world.get(x, y) === AIR) ctx.world.set(x, y, lure);
      }
    },
    won() {},
    lights(out) {
      const body = arena.boss?.body;
      if (!body) return;
      const c = centre();
      light.x = c.x;
      light.y = c.y;
      out.push(light);
    },
    status() {
      if (view.mode === 'stunned') return 'Stunned! Strike now';
      if (view.lost) return 'She has lost you in the dark';
      return '';
    },
  };
}
