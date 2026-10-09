import { ENEMY_AI, SETTLEMENT, TILE_SIZE } from '../../config';
import { DRYAD, VILLAGERS } from '../../data/npcs';
import { createNpc, type Npc } from '../entities/Npc';
import type { EventBus, SimEvents } from '../events';
import { createCollisionResult, moveAndCollide } from '../physics/tileCollision';
import { isDoor } from '../world/doors';
import { findRoom, type Room } from '../world/rooms';
import type { World } from '../world/World';

const collision = createCollisionResult();
const arrivedPayload = { key: '', name: '' };
const leftPayload = { key: '', name: '' };

/**
 * Your village (plan 1.7, plan 3.4 SettlementSystem): every SETTLEMENT.checkSeconds it finds the
 * valid homes next to doors (closed in, walled, lit, with room to stand — src/sim/world/rooms.ts),
 * keeps each villager in a home, and when a home is free and the village is big enough the next
 * villager moves in (`npcArrived`). A villager whose home stops being valid is homeless until
 * another one is free. Villagers stroll inside their homes (schedules and paths come in M11).
 * The Old Dryad stands by the spawn tree and never needs a home.
 */
export class SettlementSystem {
  readonly npcs: Npc[] = [];
  /** Valid homes by room id (re-derived each check). */
  readonly homes = new Map<number, Room>();
  /** Every door cell in the world (tile indices). */
  private readonly doors = new Set<number>();
  private timer = 0;
  private nextId = 1;
  private readonly unsubscribe: () => void;

  constructor(
    private readonly world: World,
    private readonly events: EventBus<SimEvents>,
    private readonly random: () => number,
  ) {
    for (let i = 0; i < world.fg.length; i++) if (isDoor(world.fg[i] ?? 0)) this.doors.add(i);
    this.unsubscribe = events.on('tileChanged', ({ x, y, id, previous, layer }) => {
      if (layer !== 'fg') return;
      const i = world.index(x, y);
      if (isDoor(id)) this.doors.add(i);
      else if (isDoor(previous)) this.doors.delete(i);
    });
  }

  destroy(): void {
    this.unsubscribe();
  }

  /** Places the Old Dryad (new worlds, or saves from before M10). */
  ensureDryad(feetTileX: number): void {
    if (this.npcs.some((n) => n.key === DRYAD.key)) return;
    const feetY = this.world.groundRow(feetTileX);
    this.add(DRYAD.key, (feetTileX + 0.5) * TILE_SIZE, feetY * TILE_SIZE);
  }

  /** Restores a saved resident. */
  restore(key: string, feetX: number, feetY: number, homeId: number): Npc {
    const npc = this.add(key, feetX, feetY);
    npc.homeId = homeId;
    return npc;
  }

  update(dt: number): void {
    this.timer += dt;
    if (this.timer >= SETTLEMENT.checkSeconds) {
      this.timer = 0;
      this.check();
    }
    for (const npc of this.npcs) this.move(npc, dt);
  }

  private add(key: string, feetX: number, feetY: number): Npc {
    const npc = createNpc(this.nextId++, key, feetX, feetY);
    this.npcs.push(npc);
    return npc;
  }

  /** Re-finds the homes, rehouses villagers, and lets one newcomer in. */
  private check(): void {
    const { world } = this;
    this.homes.clear();
    for (const i of this.doors) {
      const x = i % world.width;
      const y = (i - x) / world.width;
      if (isDoor(world.get(x, y + 1))) continue; // seed from each door's bottom cell only
      for (const side of [-1, 1]) {
        const room = findRoom(world, x + side, y);
        if (room && room.problem === null) this.homes.set(room.id, room);
      }
    }
    const taken = new Set<number>();
    for (const npc of this.npcs) {
      if (npc.key === DRYAD.key) continue;
      if (npc.homeId < 0) continue;
      // A home's id is its smallest cell, so an edit in its corner renames it: match by place too.
      const home = this.homes.get(npc.homeId) ?? this.homeAround(npc, taken);
      if (home && !taken.has(home.id)) {
        // Also restores the stroll range after loading (a restored villager starts with none).
        npc.homeId = home.id;
        npc.roamX0 = home.x0;
        npc.roamX1 = home.x1;
        taken.add(home.id);
      } else {
        npc.homeId = -1;
        leftPayload.key = npc.key;
        leftPayload.name = VILLAGERS.find((v) => v.key === npc.key)?.name ?? npc.key;
        this.events.emit('npcHomeless', leftPayload);
      }
    }
    const free = [...this.homes.values()].filter((h) => !taken.has(h.id));
    // Homeless villagers move into free homes first.
    for (const npc of this.npcs) {
      if (npc.key === DRYAD.key || npc.homeId >= 0) continue;
      const home = free.shift();
      if (!home) break;
      this.settle(npc, home);
    }
    // Then one newcomer, if the village is big enough for them.
    const home = free[0];
    if (!home) return;
    const next = VILLAGERS.find(
      (v) => v.homesNeeded <= this.homes.size && !this.npcs.some((n) => n.key === v.key),
    );
    if (!next) return;
    const npc = this.add(next.key, (home.spotX + 0.5) * TILE_SIZE, home.spotY * TILE_SIZE);
    this.settle(npc, home);
    arrivedPayload.key = next.key;
    arrivedPayload.name = next.name;
    this.events.emit('npcArrived', arrivedPayload);
  }

  /** A free home whose box holds this villager's feet. */
  private homeAround(npc: Npc, taken: ReadonlySet<number>): Room | undefined {
    const b = npc.body;
    const x = Math.floor((b.x + b.width / 2) / TILE_SIZE);
    const y = Math.floor((b.y + b.height - 1) / TILE_SIZE);
    for (const home of this.homes.values()) {
      if (taken.has(home.id)) continue;
      if (x >= home.x0 && x <= home.x1 && y >= home.y0 && y <= home.y1) return home;
    }
    return undefined;
  }

  private settle(npc: Npc, home: Room): void {
    npc.homeId = home.id;
    npc.roamX0 = home.x0;
    npc.roamX1 = home.x1;
    const b = npc.body;
    b.x = (home.spotX + 0.5) * TILE_SIZE - b.width / 2;
    b.y = home.spotY * TILE_SIZE - b.height;
    b.vx = 0;
    b.vy = 0;
    npc.prevX = b.x;
    npc.prevY = b.y;
  }

  /** Gravity, and short strolls within the home (walls stop them; they don't open doors). */
  private move(npc: Npc, dt: number): void {
    const b = npc.body;
    npc.prevX = b.x;
    npc.prevY = b.y;
    b.vy = Math.min(b.vy + ENEMY_AI.gravity * dt, ENEMY_AI.maxFallSpeed);
    const roams = npc.key !== DRYAD.key && npc.homeId >= 0;
    if (roams) {
      if (Number.isNaN(npc.targetX)) {
        npc.timer -= dt;
        b.vx = 0;
        if (npc.timer <= 0) {
          const span = npc.roamX1 - npc.roamX0 + 1;
          npc.targetX = (npc.roamX0 + this.random() * span) * TILE_SIZE;
        }
      } else {
        const cx = b.x + b.width / 2;
        const dx = npc.targetX - cx;
        if (Math.abs(dx) < SETTLEMENT.arrivePx) {
          npc.targetX = Number.NaN;
          npc.timer =
            SETTLEMENT.idleSecondsMin +
            this.random() * (SETTLEMENT.idleSecondsMax - SETTLEMENT.idleSecondsMin);
          b.vx = 0;
        } else {
          npc.facing = dx > 0 ? 1 : -1;
          b.vx = npc.facing * SETTLEMENT.walkSpeed;
        }
      }
    } else {
      b.vx = 0;
    }
    moveAndCollide(this.world, b, dt, collision, ENEMY_AI.stepUp, npc.onGround);
    npc.onGround = collision.onGround;
    if ((collision.hitWallLeft || collision.hitWallRight) && roams) npc.targetX = Number.NaN;
  }
}
