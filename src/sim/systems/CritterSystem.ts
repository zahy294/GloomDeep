import { CRITTER, LIQUID, SPAWN, TILE_SIZE } from '../../config';
import { CRITTERS, type CritterDef } from '../../data/critters';
import { tileId } from '../../data/tiles';
import type { Player } from '../entities/Player';
import type { EventBus, SimEvents } from '../events';
import { createCollisionResult, moveAndCollide, type Body } from '../physics/tileCollision';
import { placeKeyAt } from '../world/biomeAt';
import type { World } from '../world/World';
import { lightAtPx } from './EnemyAI';
import type { TileRect } from './GloamSystem';

const BRANCH = tileId('branch');
const collision = createCollisionResult();

export type CritterState = 'idle' | 'flee' | 'flying';

export interface Critter {
  readonly id: number;
  readonly type: number;
  body: Body;
  prevX: number;
  prevY: number;
  facing: 1 | -1;
  onGround: boolean;
  state: CritterState;
  /** Seconds in the state / until the next hop or turn. */
  timer: number;
  /** Wander phase (flutter paths). */
  phase: number;
  /** The light where it settled (NaN until first seen): only light rising above it startles. */
  calmLight: number;
  /** Moths: the bright spot they circle (pixels), NaN if none. */
  lightX: number;
  lightY: number;
}

const startledPayload = { id: 0, type: 0, x: 0, y: 0 };

export interface CritterContext {
  world: World;
  player: Player;
  region: TileRect | null;
  focusX: number;
  focusY: number;
  day: boolean;
  random: () => number;
  events: EventBus<SimEvents>;
}

/**
 * Critters (plan 1.5, M10): fireflies drift at night, moths seek light, bats hang from cave
 * ceilings and scatter when you come close or shine light at them, deer and owls flee, frogs hop
 * away, glowfish swim off. Spawned like creatures (just outside the view, by place and time) but
 * harmless; removed when far away. A glass jar catches fireflies.
 */
export class CritterSystem {
  readonly critters: Critter[] = [];
  private timer = 0;
  private nextId = 1;
  private readonly weights = new Array<number>(CRITTERS.length).fill(0);

  update(ctx: CritterContext, dt: number): void {
    const { player } = ctx;
    const px = player.body.x + player.body.width / 2;
    const py = player.body.y + player.body.height / 2;
    for (let i = this.critters.length - 1; i >= 0; i--) {
      const c = this.critters[i];
      if (!c) continue;
      const def = CRITTERS[c.type];
      const far = Math.hypot(c.body.x - px, c.body.y - py) / TILE_SIZE > SPAWN.despawnTiles;
      if (!def || far) {
        this.critters[i] = this.critters[this.critters.length - 1] ?? c;
        this.critters.pop();
        continue;
      }
      this.move(c, def, ctx, px, py, dt);
    }
    this.timer += dt;
    if (this.timer >= CRITTER.spawnInterval && this.critters.length < CRITTER.max) {
      this.timer = 0;
      for (let a = 0; a < CRITTER.attemptsPerTick; a++) if (this.trySpawn(ctx)) break;
    }
  }

  /** Removes and returns a catchable critter within reach of a point (pixels), or null. */
  catchAt(x: number, y: number): Critter | null {
    for (let i = 0; i < this.critters.length; i++) {
      const c = this.critters[i];
      if (!c || !CRITTERS[c.type]?.caughtAs) continue;
      const b = c.body;
      if (Math.hypot(b.x + b.width / 2 - x, b.y + b.height / 2 - y) > CRITTER.catchRadius) continue;
      this.critters.splice(i, 1);
      return c;
    }
    return null;
  }

  /**
   * Debug and screenshots: a group of one kind at the nearest spot that fits within `radius`
   * tiles of (tx, ty). Returns false if there is none.
   */
  placeNear(
    world: World,
    type: number,
    tx: number,
    ty: number,
    radius: number,
    random: () => number,
  ): boolean {
    const def = CRITTERS[type];
    if (!def) return false;
    for (let r = 0; r <= radius; r++) {
      for (let y = ty - r; y <= ty + r; y++) {
        for (let x = tx - r; x <= tx + r; x++) {
          if (Math.max(Math.abs(x - tx), Math.abs(y - ty)) !== r || !fits(world, def, x, y))
            continue;
          for (let k = 0; k < def.group[1]; k++) {
            const gx =
              def.move === 'flutter' || def.move === 'swim' ? x + (random() - 0.5) * 2 : x + k;
            if (k > 0 && !fits(world, def, Math.round(gx), y)) continue;
            this.critters.push(this.create(type, def, gx, y, random));
          }
          return true;
        }
      }
    }
    return false;
  }

  private trySpawn(ctx: CritterContext): boolean {
    const { world, region, random } = ctx;
    if (!region) return false;
    const x = region.x0 + Math.floor(random() * region.width);
    const y = region.y0 + Math.floor(random() * region.height);
    const offX = Math.abs(x + 0.5 - ctx.focusX) >= SPAWN.viewHalfWidth;
    const offY = Math.abs(y + 0.5 - ctx.focusY) >= SPAWN.viewHalfHeight;
    if ((!offX && !offY) || !world.inBounds(x, y) || world.isSolid(x, y)) return false;
    const place = placeKeyAt(world, x, y);
    let total = 0;
    for (let t = 0; t < CRITTERS.length; t++) {
      const def = CRITTERS[t];
      const ok =
        def &&
        def.places.includes(place) &&
        !(def.time === 'day' && !ctx.day) &&
        !(def.time === 'night' && ctx.day) &&
        fits(world, def, x, y);
      this.weights[t] = ok ? def.weight : 0;
      total += this.weights[t] ?? 0;
    }
    if (total <= 0) return false;
    let roll = random() * total;
    let type = 0;
    for (let t = 0; t < CRITTERS.length; t++) {
      roll -= this.weights[t] ?? 0;
      if (roll <= 0) {
        type = t;
        break;
      }
    }
    const def = CRITTERS[type];
    if (!def) return false;
    const count = def.group[0] + Math.floor(random() * (def.group[1] - def.group[0] + 1));
    for (let k = 0; k < count && this.critters.length < CRITTER.max; k++) {
      // Groups gather around the spot (perching ones along the same ceiling or branch).
      const gx =
        def.move === 'perch' || def.move === 'walk'
          ? x + k
          : x + (random() - 0.5) * CRITTER.groupSpread;
      const gy = def.move === 'flutter' ? y + (random() - 0.5) * CRITTER.groupSpread : y;
      if (k > 0 && !fits(world, def, Math.round(gx), Math.round(gy))) continue;
      this.critters.push(this.create(type, def, gx, gy, random));
    }
    return true;
  }

  private create(
    type: number,
    def: CritterDef,
    tx: number,
    ty: number,
    random: () => number,
  ): Critter {
    const w = def.width;
    const h = def.height;
    // Perched under a ceiling: hanging from the top of the cell; otherwise standing on its floor.
    const x = (tx + 0.5) * TILE_SIZE - w / 2;
    const y = def.perch === 'ceiling' ? ty * TILE_SIZE : (ty + 1) * TILE_SIZE - h;
    return {
      id: this.nextId++,
      type,
      body: { x, y, width: w, height: h, vx: 0, vy: 0 },
      prevX: x,
      prevY: y,
      facing: random() < 0.5 ? -1 : 1,
      onGround: false,
      state: 'idle',
      timer: random() * CRITTER.idleSeconds,
      phase: random() * Math.PI * 2,
      calmLight: Number.NaN,
      lightX: Number.NaN,
      lightY: Number.NaN,
    };
  }

  private move(
    c: Critter,
    def: CritterDef,
    ctx: CritterContext,
    px: number,
    py: number,
    dt: number,
  ): void {
    const { world } = ctx;
    const b = c.body;
    c.prevX = b.x;
    c.prevY = b.y;
    c.timer -= dt;
    c.phase += dt;
    const cx = b.x + b.width / 2;
    const cy = b.y + b.height / 2;
    const dx = cx - px;
    const dy = cy - py;
    const dist = Math.hypot(dx, dy);
    const near = dist < def.fleeRange * TILE_SIZE;
    // Light-shy critters startle when light at them rises well above what they settled in (your
    // lantern swinging onto a roost), not merely because their cave glows.
    let startledByLight = false;
    if (def.startledByLight !== undefined) {
      const light = lightAtPx(world, cx, cy);
      if (Number.isNaN(c.calmLight)) c.calmLight = light;
      startledByLight = light >= def.startledByLight && light >= c.calmLight + CRITTER.startleRise;
    }
    if ((near || startledByLight) && c.state !== 'flying') {
      c.state = def.move === 'perch' ? 'flying' : 'flee';
      c.timer = CRITTER.fleeSeconds;
      startledPayload.id = c.id;
      startledPayload.type = c.type;
      startledPayload.x = cx;
      startledPayload.y = cy;
      ctx.events.emit('critterStartled', startledPayload);
    } else if (c.state === 'flee' && c.timer <= 0) {
      c.state = 'idle';
    }
    const away = dist > 0 ? dx / dist : c.facing;
    switch (def.move) {
      case 'flutter':
        this.flutter(c, def, ctx, away, dy, dist, dt);
        break;
      case 'perch':
        if (c.state === 'flying') {
          // Off and away: up and out, wings beating.
          b.vx = Math.sign(away || 1) * def.fleeSpeed;
          b.vy =
            -def.fleeSpeed * CRITTER.flyLift +
            Math.sin(c.phase * CRITTER.flapRate) * CRITTER.flapBob;
          c.facing = b.vx > 0 ? 1 : -1;
          moveAndCollide(world, b, dt, collision);
        }
        break;
      case 'walk':
        this.walk(c, def, world, away, dt, false);
        break;
      case 'hop':
        this.walk(c, def, world, away, dt, true);
        break;
      case 'swim':
        this.swim(c, def, world, away, dt);
        break;
    }
  }

  private flutter(
    c: Critter,
    def: CritterDef,
    ctx: CritterContext,
    away: number,
    dy: number,
    dist: number,
    dt: number,
  ): void {
    const b = c.body;
    let tx = Math.cos(c.phase * CRITTER.wanderRate) * def.speed;
    let ty = Math.sin(c.phase * CRITTER.wanderRate * CRITTER.wanderSkew) * def.speed;
    if (c.state === 'flee' && dist > 0) {
      tx = away * def.fleeSpeed;
      ty = (dy / dist) * def.fleeSpeed;
    } else if (def.drawnToLight) {
      if (c.timer <= 0) {
        c.timer = CRITTER.lightSearchSeconds;
        this.findLight(c, ctx.world);
      }
      if (!Number.isNaN(c.lightX)) {
        // Circle the light.
        const ox = c.lightX + Math.cos(c.phase * CRITTER.orbitRate) * CRITTER.orbitRadius;
        const oy = c.lightY + Math.sin(c.phase * CRITTER.orbitRate) * CRITTER.orbitRadius;
        tx = Math.max(
          -def.speed,
          Math.min(def.speed, (ox - (b.x + b.width / 2)) * CRITTER.orbitPull),
        );
        ty = Math.max(
          -def.speed,
          Math.min(def.speed, (oy - (b.y + b.height / 2)) * CRITTER.orbitPull),
        );
      }
    }
    b.vx += (tx - b.vx) * Math.min(1, dt * CRITTER.steer);
    b.vy += (ty - b.vy) * Math.min(1, dt * CRITTER.steer);
    if (Math.abs(b.vx) > 1) c.facing = b.vx > 0 ? 1 : -1;
    moveAndCollide(ctx.world, b, dt, collision);
  }

  /** Moths: the brightest spot within a few tiles (lamps, torches, the lantern). */
  private findLight(c: Critter, world: World): void {
    const b = c.body;
    const cx = Math.floor((b.x + b.width / 2) / TILE_SIZE);
    const cy = Math.floor((b.y + b.height / 2) / TILE_SIZE);
    let best: number = CRITTER.mothMinLight;
    c.lightX = Number.NaN;
    c.lightY = Number.NaN;
    const r = CRITTER.lightSearchRadius;
    for (let y = cy - r; y <= cy + r; y += 2) {
      for (let x = cx - r; x <= cx + r; x += 2) {
        if (!world.inBounds(x, y) || world.isSolid(x, y)) continue;
        const i = world.index(x, y);
        const l = Math.max(world.lightR[i] ?? 0, world.lightG[i] ?? 0, world.lightB[i] ?? 0);
        if (l > best) {
          best = l;
          c.lightX = (x + 0.5) * TILE_SIZE;
          c.lightY = (y + 0.5) * TILE_SIZE;
        }
      }
    }
  }

  private walk(
    c: Critter,
    def: CritterDef,
    world: World,
    away: number,
    dt: number,
    hops: boolean,
  ): void {
    const b = c.body;
    b.vy = Math.min(b.vy + CRITTER.gravity * dt, CRITTER.maxFall);
    const fleeing = c.state === 'flee';
    if (fleeing) c.facing = away >= 0 ? 1 : -1;
    if (hops) {
      if (c.onGround) {
        b.vx = 0;
        if (c.timer <= 0 || fleeing) {
          c.timer = CRITTER.hopSeconds * (fleeing ? CRITTER.fleeHopPace : 1);
          if (!fleeing && Math.abs(c.phase % 2) < 1) c.facing = c.facing === 1 ? -1 : 1;
          b.vx = c.facing * (fleeing ? def.fleeSpeed : def.speed);
          b.vy = -(fleeing ? CRITTER.fleeHop : CRITTER.hop);
        }
      }
    } else {
      if (!fleeing && c.timer <= 0) {
        c.timer = CRITTER.idleSeconds;
        c.facing = c.facing === 1 ? -1 : 1;
      }
      b.vx = c.facing * (fleeing ? def.fleeSpeed : def.speed);
    }
    moveAndCollide(world, b, dt, collision, CRITTER.stepUp, c.onGround);
    c.onGround = collision.onGround;
    if ((collision.hitWallLeft || collision.hitWallRight) && c.onGround) {
      if (fleeing)
        b.vy = -CRITTER.fleeHop; // leap the obstacle
      else c.facing = c.facing === 1 ? -1 : 1;
    }
  }

  private swim(c: Critter, def: CritterDef, world: World, away: number, dt: number): void {
    const b = c.body;
    const wet = (x: number, y: number) => {
      const tx = Math.floor(x / TILE_SIZE);
      const ty = Math.floor(y / TILE_SIZE);
      return world.inBounds(tx, ty) && (world.liquid[world.index(tx, ty)] ?? 0) >= LIQUID.wetAmount;
    };
    const cx = b.x + b.width / 2;
    const cy = b.y + b.height / 2;
    if (!wet(cx, cy)) {
      // Out of the water: flop down.
      b.vy = Math.min(b.vy + CRITTER.gravity * dt, CRITTER.maxFall);
      moveAndCollide(world, b, dt, collision);
      return;
    }
    if (c.state === 'flee') c.facing = away >= 0 ? 1 : -1;
    else if (c.timer <= 0) {
      c.timer = CRITTER.idleSeconds;
      c.facing = c.facing === 1 ? -1 : 1;
    }
    const speed = c.state === 'flee' ? def.fleeSpeed : def.speed;
    b.vx = c.facing * speed;
    b.vy = Math.sin(c.phase * CRITTER.wanderRate) * def.speed * CRITTER.swimBob;
    // Turn back rather than leave the water.
    if (!wet(cx + c.facing * (b.width / 2 + 2), cy)) {
      c.facing = c.facing === 1 ? -1 : 1;
      b.vx = -b.vx;
    }
    if (!wet(cx, cy + b.vy * dt * 4)) b.vy = 0;
    moveAndCollide(world, b, dt, collision);
  }
}

/** Can a critter of this kind appear at cell (x, y)? */
function fits(world: World, def: CritterDef, x: number, y: number): boolean {
  if (!world.inBounds(x, y) || world.isSolid(x, y)) return false;
  const i = world.index(x, y);
  const wet = (world.liquid[i] ?? 0) >= LIQUID.wetAmount;
  switch (def.move) {
    case 'swim':
      return wet;
    case 'flutter':
      return !wet && !world.isSolid(x, y - 1);
    case 'perch':
      return def.perch === 'ceiling'
        ? world.isSolid(x, y - 1) && !wet
        : world.get(x, y + 1) === BRANCH && !world.isSolid(x, y - 1);
    case 'walk':
    case 'hop':
      return !wet && world.isSolid(x, y + 1) && !world.isSolid(x, y - 1);
  }
}
