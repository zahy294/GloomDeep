import { BOSS, ENEMY_AI, TILE_SIZE } from '../../../config';
import type { WardenDef } from '../../../data/bosses';
import { ENEMIES } from '../../../data/enemies';
import { lightByKey } from '../../../data/lights';
import { TILES, tileId } from '../../../data/tiles';
import { createCollisionResult, moveAndCollide } from '../../physics/tileCollision';
import { LANTERN_HAND } from '../lanternCone';
import { summonedCount, type Arena, type BossContext, type BossRun } from './types';

const BOTH_WAYS = [-1, 1] as const;

const T = TILE_SIZE;
const GLOW = lightByKey('warden_glow');
const BEAM_LIGHT = lightByKey('reflected_beam');
/** Beam marching step (tiles) and light points along a reflected stretch (every n tiles, at most). */
const MARCH = 0.25;
const BEAM_LIGHT_EVERY = 4;
const BEAM_LIGHTS = 8;
/** Seconds between beam damage reports (burn hits). */
const BURN_EVERY = 0.25;
/** Hovering: tiles above the player it keeps, and its rise speed share. */
const HOVER_ABOVE = 6;
const MIRROR = TILES.map((t) => t.mirror?.kind ?? null);
const FLIPS_TO = TILES.map((t) => (t.mirror ? tileId(t.mirror.flipsTo) : -1));
const SOLID = Uint8Array.from(TILES, (t) => (t.solid ? 1 : 0));
const collision = createCollisionResult();

/**
 * The Hollow Warden (plan 1.4): it reflects your lantern beam — its moonstone shell shrugs off
 * blades and shines straight back. The hall's prisms turn the beam ("/" and "\" mirrors; right-
 * click one to turn it round); a beam that has bounced off at least one prism and then touches
 * the Warden burns it and cracks its shell, so for a few seconds blades bite deep. It walks and
 * slams shockwaves along the floor; from phase 2 it hovers and throws fans of crystal shards;
 * in phase 3 crystal mites join it.
 */
export function createWardenRun(arena: Arena<WardenDef>, ctx: BossContext): BossRun {
  const def = arena.def;
  const minionType = ENEMIES.findIndex((e) => e.key === def.minion);
  const beam: number[] = [];
  const view = {
    script: 'warden' as const,
    beam: beam as readonly number[],
    bounces: 0,
    hit: false,
    cracked: 0,
    hovering: false,
  };
  let slamT = 0;
  let shardT = 0;
  let minionT = 0;
  let burnT = 0;
  let onGround = false;
  const glow = { x: 0, y: 0, light: GLOW };
  const beamLights = Array.from({ length: BEAM_LIGHTS }, () => ({ x: 0, y: 0, light: BEAM_LIGHT }));
  let beamLightCount = 0;
  const b = arena.bounds;

  /** Traces the lantern beam through the prisms; returns whether a reflected stretch hit it. */
  const trace = (): boolean => {
    beam.length = 0;
    view.bounces = 0;
    beamLightCount = 0;
    if (!ctx.lanternLit()) return false;
    const { player, input, world } = ctx;
    const pb = player.body;
    let x = (pb.x + pb.width / 2 + LANTERN_HAND.x * player.facing) / T;
    let y = (pb.y + pb.height + LANTERN_HAND.y) / T;
    let dx = input.aimX / T - x;
    let dy = input.aimY / T - y;
    const len = Math.hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;
    let left = ctx.lens().range * def.beamRangeScale;
    beam.push(x * T, y * T);
    let lastCell = -1;
    let hit = false;
    let sinceLight = 0;
    const body = arena.boss?.body;
    while (left > 0) {
      x += dx * MARCH;
      y += dy * MARCH;
      left -= MARCH;
      const tx = Math.floor(x);
      const ty = Math.floor(y);
      if (!world.inBounds(tx, ty)) break;
      const id = world.get(tx, ty);
      const cell = ty * world.width + tx;
      if (SOLID[id] === 1) break;
      const mirror = MIRROR[id] ?? null;
      if (mirror && cell !== lastCell && view.bounces < def.bounces) {
        // Turn at the prism's centre: "/" maps (dx, dy) to (−dy, −dx), "\" to (dy, dx).
        x = tx + 0.5;
        y = ty + 0.5;
        const ndx = mirror === 'slash' ? -dy : dy;
        const ndy = mirror === 'slash' ? -dx : dx;
        dx = ndx;
        dy = ndy;
        view.bounces++;
        left += def.bounceRange;
        beam.push(x * T, y * T);
        lastCell = cell;
        continue;
      }
      if (view.bounces > 0) {
        sinceLight += MARCH;
        if (sinceLight >= BEAM_LIGHT_EVERY && beamLightCount < BEAM_LIGHTS) {
          sinceLight = 0;
          const l = beamLights[beamLightCount++];
          if (l) {
            l.x = x * T;
            l.y = y * T;
          }
        }
        if (body) {
          const px = x * T;
          const py = y * T;
          if (
            px >= body.x &&
            px <= body.x + body.width &&
            py >= body.y &&
            py <= body.y + body.height
          ) {
            hit = true;
            break;
          }
        }
      }
    }
    beam.push(x * T, y * T);
    return hit;
  };

  return {
    view,
    start() {
      slamT = 0;
      shardT = 0;
      minionT = 0;
      view.cracked = 0;
      view.hovering = false;
    },
    update(dt) {
      const boss = arena.boss;
      if (!boss) return;
      const p = arena.phase;
      const speed = def.speed[p] ?? def.speed[0] ?? 0;
      const body = boss.body;
      const pb = ctx.player.body;
      const px = pb.x + pb.width / 2;
      const py = pb.y + pb.height / 2;
      const cx = body.x + body.width / 2;
      const cy = body.y + body.height / 2;
      view.hovering = p >= def.hoverPhase;
      boss.facing = px >= cx ? 1 : -1;
      if (!view.hovering) {
        body.vx = Math.sign(px - cx) * speed;
        body.vy = Math.min(body.vy + ENEMY_AI.gravity * dt, ENEMY_AI.maxFallSpeed);
        moveAndCollide(ctx.world, body, dt, collision, ENEMY_AI.stepUp, onGround);
        onGround = collision.onGround;
        slamT += dt;
        if (onGround && slamT >= def.slamEvery && Math.abs(px - cx) <= def.slamRange * T) {
          slamT = 0;
          const fy = body.y + body.height - T / 2;
          for (const dir of BOTH_WAYS) {
            ctx.shots.push({
              kind: 'slam',
              x: cx + (dir * body.width) / 2,
              y: fy,
              vx: dir * def.slamSpeed,
              vy: 0,
              gravity: 0,
              radius: T * 0.6,
              damage: def.slamDamage,
              life: BOSS.shotLife / 2,
              solid: true,
            });
          }
          ctx.action('slam', cx, body.y + body.height);
        }
      } else {
        // Hovers over the player, kept inside the hall.
        const gx = px - cx;
        const gy = py - HOVER_ABOVE * T - cy;
        const d = Math.hypot(gx, gy);
        const step = Math.min(d, speed * dt);
        if (d > 0) {
          body.x += (gx / d) * step;
          body.y += (gy / d) * step;
        }
        body.vx = 0;
        body.vy = 0;
        body.x = Math.max(b.x0 * T, Math.min((b.x1 + 1) * T - body.width, body.x));
        body.y = Math.max(b.y0 * T, Math.min((b.y1 + 1) * T - body.height, body.y));
        shardT += dt;
        if (shardT >= def.shardEvery) {
          shardT = 0;
          const base = Math.atan2(py - cy, px - cx);
          for (let k = 0; k < def.shards; k++) {
            const a = base + (k / Math.max(1, def.shards - 1) - 0.5) * def.shardSpread * 2;
            ctx.shots.push({
              kind: 'shard',
              x: cx,
              y: cy,
              vx: Math.cos(a) * def.shardSpeed,
              vy: Math.sin(a) * def.shardSpeed,
              gravity: 0,
              radius: BOSS.shotRadius,
              damage: def.shardDamage,
              life: BOSS.shotLife,
              solid: true,
            });
          }
          ctx.action('volley', cx, cy);
        }
      }

      // The reflected beam.
      const hit = trace();
      if (hit && view.cracked <= 0) ctx.action('cracked', cx, cy);
      view.hit = hit;
      view.cracked = hit ? def.crackSeconds : Math.max(0, view.cracked - dt);
      boss.damageTaken = view.cracked > 0 ? def.crackedDamage : def.shellDamage;
      if (hit) {
        burnT += dt;
        if (burnT >= BURN_EVERY) {
          ctx.burn(boss, def.beamDps * burnT);
          burnT = 0;
          if (!arena.boss) return; // the burn brought it down
        }
      } else {
        burnT = 0;
      }

      if (p >= def.minionPhase && minionType >= 0) {
        minionT += dt;
        if (minionT >= def.minionEvery) {
          minionT = 0;
          if (summonedCount(ctx.enemies, minionType) < def.minionCap) {
            const x = b.x0 + 2 + Math.floor(ctx.random() * (b.x1 - b.x0 - 4));
            ctx.spawn(def.minion, (x + 0.5) * T, (b.y1 + 1) * T);
          }
        }
      }
    },
    phaseChanged() {},
    hit() {},
    use(x, y) {
      const into = FLIPS_TO[ctx.world.get(x, y)] ?? -1;
      if (into < 0) return false;
      ctx.world.set(x, y, into);
      ctx.action('prism', (x + 0.5) * T, (y + 0.5) * T);
      return true;
    },
    reset() {
      beam.length = 0;
      view.cracked = 0;
      view.hit = false;
      view.hovering = false;
    },
    won() {
      this.reset();
    },
    lights(out) {
      const body = arena.boss?.body;
      if (!body) return;
      glow.x = body.x + body.width / 2;
      glow.y = body.y + body.height / 2;
      out.push(glow);
      for (let i = 0; i < beamLightCount; i++) {
        const l = beamLights[i];
        if (l) out.push(l);
      }
    },
    status() {
      if (view.cracked > 0) return 'Its shell is cracked!';
      return view.bounces > 0 ? '' : 'Blades glance off its shell';
    },
  };
}
