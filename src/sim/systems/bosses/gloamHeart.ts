import { BOSS, TILE_SIZE } from '../../../config';
import type { HeartDef } from '../../../data/bosses';
import { ENEMIES } from '../../../data/enemies';
import { ITEMS, itemId } from '../../../data/items';
import { lightByKey } from '../../../data/lights';
import { tileId } from '../../../data/tiles';
import type { Enemy } from '../../entities/Enemy';
import { summonedCount, type Arena, type BossContext, type BossRun } from './types';

const T = TILE_SIZE;
const GLOW = lightByKey('heart_glow');
/** The Heart's slow breathing bob (px, rad/s). */
const BOB_PX = 6;
const BOB_RATE = 1.3;

/**
 * The Gloam Heart (plan 1.4): the final fight, wrapped round the World Tree's taproot. Its
 * chamber has dark root-lamps; right-clicking one with a Lumen crystal relights it. The Heart
 * takes damage in proportion to the lamps lit (none lit: none at all), and fights back for the
 * dark: it sends tendrils crawling to lit lamps (kill them, or burn them with light, before they
 * choke the lamp), rings of Gloam orbs, shades, and on each new phase a surge that chokes lamps
 * at once. When it falls the Heartlight takes its place.
 */
export function createHeartRun(arena: Arena<HeartDef>, ctx: BossContext): BossRun {
  const def = arena.def;
  const node = tileId(def.node);
  const nodeLit = tileId(def.nodeLit);
  const heartlight = tileId(def.heartlight);
  const costItem = itemId(def.nodeCost.item);
  const tendrilType = ENEMIES.findIndex((e) => e.key === def.tendril);
  const minionType = ENEMIES.findIndex((e) => e.key === def.minion);
  const lamps: [number, number][] = [];
  for (let y = arena.bounds.y0; y <= arena.bounds.y1; y++) {
    for (let x = arena.bounds.x0; x <= arena.bounds.x1; x++) {
      const id = ctx.world.get(x, y);
      if (id === node || id === nodeLit) lamps.push([x, y]);
    }
  }
  const view = { script: 'heart' as const, lit: 0, lamps: lamps.length, exposure: 0 };
  /** Which lamp each tendril (by enemy id) is crawling to. */
  const targets = new Map<number, number>();
  let tendrilT = 0;
  let orbT = 0;
  let minionT = 0;
  let time = 0;
  let homeY = 0;
  const glow = { x: 0, y: 0, light: GLOW };

  /** Indices of the lit lamps (one reused list). */
  const lit: number[] = [];
  const litLamps = (): number[] => {
    lit.length = 0;
    for (let i = 0; i < lamps.length; i++) {
      const lamp = lamps[i];
      if (lamp && ctx.world.get(lamp[0], lamp[1]) === nodeLit) lit.push(i);
    }
    return lit;
  };
  const choke = (i: number) => {
    const lamp = lamps[i];
    if (!lamp || ctx.world.get(lamp[0], lamp[1]) !== nodeLit) return;
    ctx.world.set(lamp[0], lamp[1], node);
    ctx.action('nodeChoked', (lamp[0] + 0.5) * T, (lamp[1] + 0.5) * T);
  };
  const pick = (list: number[]) => list[Math.floor(ctx.random() * list.length)];

  const moveTendril = (e: Enemy, dt: number) => {
    let target = targets.get(e.id);
    const lamp = target !== undefined ? lamps[target] : undefined;
    if (target === undefined || !lamp || ctx.world.get(lamp[0], lamp[1]) !== nodeLit) {
      const lit = litLamps();
      target = pick(lit);
      if (target === undefined) {
        ctx.remove(e); // nothing left to choke: it sinks back into the dark
        targets.delete(e.id);
        return;
      }
      targets.set(e.id, target);
      return;
    }
    const speed = ENEMIES[e.type]?.speed ?? 0;
    const tx = (lamp[0] + 0.5) * T;
    const ty = (lamp[1] + 0.5) * T;
    const cx = e.body.x + e.body.width / 2;
    const cy = e.body.y + e.body.height / 2;
    const d = Math.hypot(tx - cx, ty - cy);
    if (d <= def.chokeTiles * T) {
      choke(target);
      targets.delete(e.id);
      ctx.remove(e);
      return;
    }
    // Through rock and air alike, straight at the lamp.
    e.body.x += ((tx - cx) / d) * speed * dt;
    e.body.y += ((ty - cy) / d) * speed * dt;
    e.facing = tx >= cx ? 1 : -1;
  };

  return {
    view,
    start() {
      tendrilT = 0;
      orbT = 0;
      minionT = 0;
      time = 0;
      targets.clear();
      homeY = arena.boss?.body.y ?? 0;
    },
    update(dt) {
      const boss = arena.boss;
      if (!boss) return;
      const p = arena.phase;
      time += dt;
      boss.body.y = homeY + Math.sin(time * BOB_RATE) * BOB_PX;
      const lit = litLamps();
      view.lit = lit.length;
      view.exposure =
        lamps.length > 0 ? Math.min(1, (def.exposure * lit.length) / lamps.length) : 1;
      boss.damageTaken = view.exposure;
      const cx = boss.body.x + boss.body.width / 2;
      const cy = boss.body.y + boss.body.height / 2;

      for (let i = ctx.enemies.length - 1; i >= 0; i--) {
        const e = ctx.enemies[i];
        if (e && e.type === tendrilType) moveTendril(e, dt);
      }
      tendrilT += dt;
      if (tendrilT >= (def.tendrilEvery[p] ?? def.tendrilEvery[0] ?? 0) && lit.length > 0) {
        tendrilT = 0;
        const alive = summonedCount(ctx.enemies, tendrilType);
        const target = pick(lit);
        if (alive < def.tendrilCap && target !== undefined) {
          const t = ctx.spawn(def.tendril, cx, cy + boss.body.height / 2);
          targets.set(t.id, target);
        }
      }
      orbT += dt;
      if (orbT >= (def.orbEvery[p] ?? def.orbEvery[0] ?? 0)) {
        orbT = 0;
        const turn = ctx.random() * Math.PI * 2;
        for (let k = 0; k < def.orbs; k++) {
          const a = turn + (k / def.orbs) * Math.PI * 2;
          ctx.shots.push({
            kind: 'orb',
            x: cx,
            y: cy,
            vx: Math.cos(a) * def.orbSpeed,
            vy: Math.sin(a) * def.orbSpeed,
            gravity: 0,
            radius: BOSS.shotRadius + 1,
            damage: def.orbDamage,
            life: BOSS.shotLife,
            solid: false,
          });
        }
        ctx.action('volley', cx, cy);
      }
      if (p >= def.minionPhase && minionType >= 0) {
        minionT += dt;
        if (minionT >= def.minionEvery) {
          minionT = 0;
          if (summonedCount(ctx.enemies, minionType) < def.minionCap) {
            const a = ctx.random() * Math.PI * 2;
            const r = BOSS.minionSpread * T;
            ctx.spawn(def.minion, cx + Math.cos(a) * r, cy + Math.sin(a) * r);
          }
        }
      }
    },
    hit() {},
    phaseChanged() {
      // A surge: the dark lashes out and chokes lamps at once.
      for (let k = 0; k < def.surgeChokes; k++) {
        const target = pick(litLamps());
        if (target !== undefined) choke(target);
      }
    },
    use(x, y) {
      const i = lamps.findIndex(([lx, ly]) => lx === x && ly === y);
      if (i < 0) return false;
      if (ctx.world.get(x, y) !== node) return true;
      if (ctx.inventory.count(costItem) < def.nodeCost.count) {
        ctx.blocked(
          `${def.nodeCost.count} ${ITEMS[costItem]?.name ?? def.nodeCost.item} to relight it`,
        );
        return true;
      }
      ctx.inventory.remove(costItem, def.nodeCost.count);
      ctx.world.set(x, y, nodeLit);
      ctx.action('nodeLit', (x + 0.5) * T, (y + 0.5) * T);
      return true;
    },
    reset() {
      targets.clear();
      for (const [x, y] of lamps) if (ctx.world.get(x, y) === nodeLit) ctx.world.set(x, y, node);
      view.lit = 0;
      view.exposure = 0;
    },
    won() {
      targets.clear();
      for (const [x, y] of lamps) ctx.world.set(x, y, nodeLit);
      // The Heartlight where the Heart hung.
      ctx.world.set(arena.bossX, arena.bossY, heartlight);
    },
    lights(out) {
      const body = arena.boss?.body;
      if (!body) return;
      glow.x = body.x + body.width / 2;
      glow.y = body.y + body.height / 2;
      out.push(glow);
    },
    status() {
      return `${view.lit} of ${view.lamps} root-lamps lit`;
    },
  };
}
