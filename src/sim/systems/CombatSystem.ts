import { COMBAT, PROJECTILE, TILE_SIZE } from '../../config';
import { ENEMIES } from '../../data/enemies';
import { ITEMS, itemId, type WeaponDef } from '../../data/items';
import { lensByKey } from '../../data/lenses';
import type { Enemy } from '../entities/Enemy';
import type { Player } from '../entities/Player';
import type { Projectile } from '../entities/Projectile';
import type { EventBus, SimEvents } from '../events';
import type { ActionState } from '../input';
import type { Inventory } from '../inventory/Inventory';
import { createCollisionResult, moveAndCollide, type Body } from '../physics/tileCollision';
import type { World } from '../world/World';
import { damagePlayer } from './HealthSystem';
import { lanternLit } from './LanternSystem';
import { createCone, inCone, lanternCone, LANTERN_HAND, type Cone } from './lanternCone';
import { lightAtPx } from './EnemyAI';
import type { SpawnDrop } from './MiningSystem';

/** Per item id: its weapon, or null. Ammo resolved to an item id. */
const WEAPON: readonly (WeaponDef | null)[] = ITEMS.map((i) => i.weapon ?? null);
const AMMO = ITEMS.map((i) => (i.weapon?.ammo ? itemId(i.weapon.ammo) : -1));
/** Per item id: the extra damage it adds when fired as ammo. */
const AMMO_DAMAGE = ITEMS.map((i) => i.ammoDamage ?? 0);
const DROP_IDS = ENEMIES.map((e) => e.drops.map((d) => ({ ...d, id: itemId(d.item) })));
const collision = createCollisionResult();

export interface CombatState {
  /** The swing in progress (melee): seconds into it and how long it lasts; 0 = none. */
  swingTime: number;
  swingDuration: number;
  swingReach: number;
  swingDamage: number;
  swingKnockback: number;
  /** Unit vector the swing aims along. */
  swingDirX: number;
  swingDirY: number;
  /** Enemies this swing already hit. */
  readonly swingHits: number[];
  /** Seconds until the selected weapon can be used again. */
  cooldown: number;
  /** Set when a hit landed this step: the simulation freezes briefly (hit-stop). */
  hitLanded: boolean;
  readonly cone: Cone;
}

export function createCombatState(): CombatState {
  return {
    swingTime: 0,
    swingDuration: 0,
    swingReach: 0,
    swingDamage: 0,
    swingKnockback: 0,
    swingDirX: 1,
    swingDirY: 0,
    swingHits: [],
    cooldown: 0,
    hitLanded: false,
    cone: createCone(),
  };
}

/** The weapon in the selected hotbar slot, or null (then left click mines). */
export function selectedWeapon(inventory: Inventory): WeaponDef | null {
  const s = inventory.selectedStack;
  return s ? (WEAPON[s.itemId] ?? null) : null;
}

const hitPayload = { id: 0, x: 0, y: 0, amount: 0, source: 'melee' as HitSource };
const diedPayload = { id: 0, type: 0, x: 0, y: 0 };
const hurtPayload = { amount: 0, x: 0, y: 0 };
const attackPayload = { kind: 'melee' as WeaponDef['kind'], dirX: 0, dirY: 0, duration: 0 };
const NO_PAYLOAD: Record<string, never> = {};

/**
 * What hurt a creature. `light` (shades burning) ignores invulnerability; `hazard` (fire, lava,
 * a falling block) respects it but neither knocks back nor triggers hit-stop.
 */
export type HitSource = 'melee' | 'arrow' | 'beam' | 'light' | 'hazard';

/** Everything combat touches, gathered by the Simulation each step. */
export interface CombatContext {
  player: Player;
  input: ActionState;
  inventory: Inventory;
  world: World;
  enemies: Enemy[];
  projectiles: Projectile[];
  events: EventBus<SimEvents>;
  spawnDrop: SpawnDrop;
  random: () => number;
}

/**
 * Combat (plan 3.4 CombatSystem; M8): the player's attacks (melee swings, arrows, Lumen beams),
 * projectiles, enemies touching the player, shades burning in light, deaths and drops. Hits knock
 * back and set short invulnerability; any hit landed asks for hit-stop (`hitLanded`).
 */
export function updateCombat(state: CombatState, ctx: CombatContext, dt: number): void {
  state.hitLanded = false;
  state.cooldown = Math.max(0, state.cooldown - dt);
  const { player } = ctx;
  if (!player.dead) {
    playerAttack(state, ctx);
    updateSwing(state, ctx, dt);
  } else {
    state.swingDuration = 0; // a swing doesn't outlive its swinger
  }
  updateProjectiles(state, ctx, dt);
  lightBurn(state, ctx, dt);
  if (!player.dead) contactDamage(ctx);
}

function playerAttack(state: CombatState, ctx: CombatContext): void {
  const { player, input, inventory, events } = ctx;
  const weapon = selectedWeapon(inventory);
  if (!weapon || !input.isHeld('useItem') || state.cooldown > 0) return;
  const b = player.body;
  const hx = b.x + b.width / 2;
  const hy = b.y + b.height + LANTERN_HAND.y;
  const dx = input.aimX - hx;
  const dy = input.aimY - hy;
  const len = Math.hypot(dx, dy) || 1;
  const dirX = dx / len;
  const dirY = dy / len;
  player.facing = dirX >= 0 ? 1 : -1;

  if (weapon.kind === 'melee') {
    state.swingTime = 0;
    state.swingDuration = weapon.useTime;
    state.swingReach = weapon.reach ?? COMBAT.defaultReach;
    state.swingDamage = weapon.damage;
    state.swingKnockback = weapon.knockback;
    state.swingDirX = dirX;
    state.swingDirY = dirY;
    state.swingHits.length = 0;
  } else if (weapon.kind === 'ranged') {
    const ammo = AMMO[inventory.selectedStack?.itemId ?? -1] ?? -1;
    if (ammo < 0 || inventory.remove(ammo, 1) === 0) return;
    events.emit('inventoryChanged', NO_PAYLOAD);
    fire(ctx, 'arrow', hx, hy, dirX, dirY, weapon, weapon.damage + (AMMO_DAMAGE[ammo] ?? 0));
  } else {
    const cost = weapon.lumenCost ?? 0;
    if (player.lumen < cost) return;
    player.lumen -= cost;
    fire(ctx, 'beam', hx, hy, dirX, dirY, weapon, weapon.damage);
  }
  state.cooldown = weapon.useTime;
  attackPayload.kind = weapon.kind;
  attackPayload.dirX = dirX;
  attackPayload.dirY = dirY;
  attackPayload.duration = weapon.useTime;
  events.emit('attackStarted', attackPayload);
}

function fire(
  ctx: CombatContext,
  kind: Projectile['kind'],
  x: number,
  y: number,
  dirX: number,
  dirY: number,
  weapon: WeaponDef,
  damage: number,
): void {
  const p = PROJECTILE[kind];
  const speed = weapon.projectileSpeed ?? p.speed;
  ctx.projectiles.push({
    kind,
    body: {
      x: x - p.size / 2,
      y: y - p.size / 2,
      width: p.size,
      height: p.size,
      vx: dirX * speed,
      vy: dirY * speed,
    },
    prevX: x - p.size / 2,
    prevY: y - p.size / 2,
    damage,
    knockback: weapon.knockback,
    pierce: weapon.pierce ?? 1,
    hit: [],
    life: p.life,
    gravity: p.gravity,
  });
}

/** Melee: during the active part of a swing, every enemy in the arc in front is hit once. */
function updateSwing(state: CombatState, ctx: CombatContext, dt: number): void {
  if (state.swingDuration <= 0) return;
  state.swingTime += dt;
  if (state.swingTime >= state.swingDuration) {
    state.swingDuration = 0;
    return;
  }
  if (state.swingTime > state.swingDuration * COMBAT.swingActiveFraction) return;
  const b = ctx.player.body;
  const hx = b.x + b.width / 2;
  const hy = b.y + b.height + LANTERN_HAND.y;
  const cosArc = Math.cos(COMBAT.swingHalfArc);
  for (const enemy of ctx.enemies) {
    if (enemy.health <= 0 || state.swingHits.includes(enemy.id)) continue;
    // Nearest point of the enemy's box to the hand.
    const e = enemy.body;
    const nx = Math.max(e.x, Math.min(hx, e.x + e.width)) - hx;
    const ny = Math.max(e.y, Math.min(hy, e.y + e.height)) - hy;
    const d = Math.hypot(nx, ny);
    if (d > state.swingReach) continue;
    const cx = e.x + e.width / 2 - hx;
    const cy = e.y + e.height / 2 - hy;
    const cd = Math.hypot(cx, cy) || 1;
    if (d > COMBAT.swingInnerReach && (cx * state.swingDirX + cy * state.swingDirY) / cd < cosArc) {
      continue;
    }
    state.swingHits.push(enemy.id);
    hitEnemy(
      state,
      ctx,
      enemy,
      state.swingDamage,
      state.swingKnockback,
      Math.sign(cx) || 1,
      'melee',
    );
  }
}

function overlaps(a: Body, b: Body): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

function updateProjectiles(state: CombatState, ctx: CombatContext, dt: number): void {
  const list = ctx.projectiles;
  for (let i = list.length - 1; i >= 0; i--) {
    const p = list[i];
    if (!p) continue;
    p.life -= dt;
    const b = p.body;
    p.prevX = b.x;
    p.prevY = b.y;
    b.vy += p.gravity * dt;
    const vx = b.vx;
    const vy = b.vy;
    moveAndCollide(ctx.world, b, dt, collision);
    const hitTile =
      collision.onGround || collision.hitCeiling || collision.hitWallLeft || collision.hitWallRight;
    if (hitTile) {
      // Keep flying direction for rendering the last frame; it is removed below.
      b.vx = vx;
      b.vy = vy;
    }
    for (const enemy of ctx.enemies) {
      if (p.pierce <= 0) break;
      if (enemy.health <= 0 || p.hit.includes(enemy.id) || !overlaps(b, enemy.body)) continue;
      p.hit.push(enemy.id);
      p.pierce--;
      const def = ENEMIES[enemy.type];
      const bonus = p.kind === 'beam' && def?.ai === 'shade' ? COMBAT.beamShadeMultiplier : 1;
      hitEnemy(state, ctx, enemy, p.damage * bonus, p.knockback, Math.sign(vx) || 1, p.kind);
    }
    if (hitTile || p.life <= 0 || p.pierce <= 0) {
      list[i] = list[list.length - 1] ?? p;
      list.pop();
    }
  }
}

/** Damages an enemy (respecting its invulnerability), knocks it back, and kills it at 0 health. */
export function hitEnemy(
  state: CombatState,
  ctx: CombatContext,
  enemy: Enemy,
  amount: number,
  knockback: number,
  dir: number,
  source: HitSource,
): void {
  if (enemy.health <= 0 || (source !== 'light' && enemy.invuln > 0)) return;
  const def = ENEMIES[enemy.type];
  if (!def) return;
  const dealt = Math.min(enemy.health, amount);
  enemy.health -= dealt;
  if (source === 'hazard') {
    enemy.invuln = COMBAT.hazardInvuln;
  } else if (source !== 'light') {
    enemy.invuln = COMBAT.enemyInvuln;
    const k = knockback * def.knockbackTaken;
    if (k > 0) {
      enemy.body.vx = dir * k * COMBAT.knockbackSpeed;
      enemy.body.vy = -k * COMBAT.knockbackLift;
      enemy.stunned = COMBAT.enemyStun;
    }
    state.hitLanded = true;
  }
  const e = enemy.body;
  hitPayload.id = enemy.id;
  hitPayload.x = e.x + e.width / 2;
  hitPayload.y = e.y;
  hitPayload.amount = Math.round(dealt);
  hitPayload.source = source;
  ctx.events.emit('enemyHit', hitPayload);
  if (enemy.health <= 0) kill(ctx, enemy);
}

function kill(ctx: CombatContext, enemy: Enemy): void {
  const e = enemy.body;
  const x = e.x + e.width / 2;
  const y = e.y + e.height / 2;
  for (const drop of DROP_IDS[enemy.type] ?? []) {
    if (ctx.random() >= drop.chance) continue;
    const count = drop.min + Math.floor(ctx.random() * (drop.max - drop.min + 1));
    if (count > 0) ctx.spawnDrop(drop.id, count, x, y);
  }
  diedPayload.id = enemy.id;
  diedPayload.type = enemy.type;
  diedPayload.x = x;
  diedPayload.y = y;
  ctx.events.emit('enemyDied', diedPayload);
  const i = ctx.enemies.indexOf(enemy);
  if (i >= 0) {
    ctx.enemies[i] = ctx.enemies[ctx.enemies.length - 1] ?? enemy;
    ctx.enemies.pop();
  }
}

/** Shades take damage in light (more in a Crimson cone), reported in small hits. */
function lightBurn(state: CombatState, ctx: CombatContext, dt: number): void {
  const { player, input, world } = ctx;
  const lens = lensByKey(player.lens);
  const crimson =
    lanternLit(player) && lens.effect === 'burn'
      ? lanternCone(player, input, lens, state.cone)
      : null;
  for (let i = ctx.enemies.length - 1; i >= 0; i--) {
    const enemy = ctx.enemies[i];
    const def = enemy ? ENEMIES[enemy.type] : undefined;
    if (!enemy || !def?.lightDamage) continue;
    const e = enemy.body;
    const cx = e.x + e.width / 2;
    const cy = e.y + e.height / 2;
    const light = lightAtPx(world, cx, cy);
    let dps = light >= COMBAT.shadeBurnLight ? def.lightDamage * (light / 255) : 0;
    if (crimson && inCone(crimson, Math.floor(cx / TILE_SIZE), Math.floor(cy / TILE_SIZE))) {
      dps += COMBAT.crimsonShadeDps;
    }
    if (dps <= 0) continue;
    enemy.burn += dps * dt;
    if (enemy.burn >= COMBAT.burnReportEvery) {
      const amount = Math.floor(enemy.burn);
      enemy.burn -= amount;
      hitEnemy(state, ctx, enemy, amount, 0, 0, 'light');
    }
  }
}

/** An enemy touching the player hurts them (with knockback and invulnerability frames). */
function contactDamage(ctx: CombatContext): void {
  const { player } = ctx;
  if (player.invuln > 0) return;
  const pb = player.body;
  for (const enemy of ctx.enemies) {
    const def = ENEMIES[enemy.type];
    if (!def || enemy.health <= 0 || !overlaps(pb, enemy.body)) continue;
    const dir = pb.x + pb.width / 2 >= enemy.body.x + enemy.body.width / 2 ? 1 : -1;
    hurtPlayer(ctx, def.contactDamage, dir);
    return;
  }
}

/** Damage to the player from anything: knockback away from `dir`, invulnerability, death. */
export function hurtPlayer(ctx: CombatContext, amount: number, dir: number): void {
  const { player } = ctx;
  if (player.dead || player.invuln > 0) return;
  const dealt = damagePlayer(player, amount);
  player.invuln = COMBAT.playerInvuln;
  player.knockbackTimer = COMBAT.playerKnockbackSeconds;
  player.body.vx = dir * COMBAT.playerKnockbackSpeed;
  player.body.vy = -COMBAT.playerKnockbackLift;
  player.jumping = false;
  const pb = player.body;
  hurtPayload.amount = Math.round(dealt);
  hurtPayload.x = pb.x + pb.width / 2;
  hurtPayload.y = pb.y;
  ctx.events.emit('playerHurt', hurtPayload);
  if (player.health <= 0) {
    player.dead = true;
    player.respawnTimer = COMBAT.respawnSeconds;
    player.lumen = Math.max(0, player.lumen * (1 - COMBAT.deathLumenLoss));
    ctx.events.emit('playerDied', NO_PAYLOAD);
  }
}
