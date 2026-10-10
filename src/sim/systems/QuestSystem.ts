import { ENEMY_AI, ESCORT, FIND, TILE_SIZE } from '../../config';
import { ITEMS, itemId } from '../../data/items';
import { npcDef } from '../../data/npcs';
import { QUESTS, questByKey, type QuestDef } from '../../data/quests';
import type { Npc } from '../entities/Npc';
import type { Player } from '../entities/Player';
import type { EventBus, SimEvents } from '../events';
import type { Inventory } from '../inventory/Inventory';
import { createCollisionResult, moveAndCollide } from '../physics/tileCollision';
import type { World } from '../world/World';
import type { ProgressionSystem } from './ProgressionSystem';
import type { RoadSystem } from './RoadSystem';
import type { TownSystem } from './TownSystem';

export type QuestState = 'active' | 'done';

/** A quest you have taken (saved). `x`, `y`: a find quest's hiding place (tiles), else -1. */
export interface QuestProgress {
  key: string;
  state: QuestState;
  x: number;
  y: number;
}

export interface QuestContext {
  world: World;
  player: Player;
  inventory: Inventory;
  npcs: Npc[];
  towns: TownSystem;
  roads: RoadSystem;
  progression: ProgressionSystem;
  events: EventBus<SimEvents>;
  random: () => number;
  /** Where your village is (an escort's destination): feet, pixels. */
  villageX: number;
  villageY: number;
  /** Drops what doesn't fit in the inventory at the player. */
  drop: (item: number, count: number) => void;
}

/** What someone says about quests when you talk to them. */
export interface QuestTalk {
  text: string;
  /** A quest they are offering ('' = none). */
  offer: string;
}

const questPayload = { key: '', title: '' };
const progressPayload = { key: '', text: '' };
const collision = createCollisionResult();

/**
 * Quests (plan 1.7, plan 3.4 QuestSystem): the four kinds in src/data/quests/.
 * - Talking to a giver offers their next quest, reminds you of an active one, or hands it in
 *   (deliver: the items; find: the found thing; light a route: once the road is lit).
 * - Escort: after accepting, the person joins you when you come close and follows (walking and
 *   jumping). The dark frightens them: ESCORT.fearSeconds of it and they run home (try again).
 *   Bring them to your village and the quest completes at once.
 * - Find: the lost thing hides in a cave near the giver; you pick it up when you come close, and
 *   wisps lead you to it.
 */
export class QuestSystem {
  readonly quests = new Map<string, QuestProgress>();
  /** Seconds of darkness the current escort has suffered (0..ESCORT.fearSeconds). */
  escortFear = 0;

  constructor(private readonly ctx: QuestContext) {}

  toSave(): QuestProgress[] {
    return [...this.quests.values()].map((q) => ({ ...q }));
  }

  restore(saved: readonly QuestProgress[]): void {
    for (const q of saved) if (questByKey(q.key)) this.quests.set(q.key, { ...q });
  }

  state(key: string): QuestState | 'new' {
    return this.quests.get(key)?.state ?? 'new';
  }

  private available(q: QuestDef): boolean {
    return (
      this.state(q.key) === 'new' && (q.requires ?? []).every((f) => this.ctx.progression.has(f))
    );
  }

  /** Is an active quest ready to hand in to its giver? */
  private ready(q: QuestDef): boolean {
    const { inventory, roads } = this.ctx;
    const g = q.goal;
    switch (g.kind) {
      case 'deliver':
        return inventory.count(itemId(g.item)) >= g.count;
      case 'find':
        return inventory.count(itemId(g.item)) > 0;
      case 'lightRoute': {
        const road = roads.roads.find((r) => r.def.key === g.road);
        return road !== undefined && roads.isLit(road);
      }
      case 'escort':
        return false; // completes on arrival
    }
  }

  /**
   * Someone was talked to. Returns quest talk (an offer, a reminder, a hand-in), or null to fall
   * back to their ordinary lines.
   */
  talk(npc: Npc): QuestTalk | null {
    for (const q of QUESTS) {
      if (q.giver !== npc.key) continue;
      const state = this.state(q.key);
      if (state === 'done') continue;
      if (state === 'active') {
        if (this.ready(q)) {
          this.complete(q);
          return { text: q.text.done, offer: '' };
        }
        return { text: q.text.active, offer: '' };
      }
      if (this.available(q)) return { text: q.text.offer, offer: q.key };
    }
    return null;
  }

  /** What to show over someone's head: '!' a quest to offer, '?' one ready to hand in. */
  marker(npc: Npc): '' | '!' | '?' {
    let mark: '' | '!' | '?' = '';
    for (const q of QUESTS) {
      if (q.giver !== npc.key) continue;
      const state = this.state(q.key);
      if (state === 'active' && this.ready(q)) return '?';
      if (state === 'active') return '';
      if (mark === '' && this.available(q)) mark = '!';
    }
    return mark;
  }

  /** Takes a quest on (from the dialogue's Accept). */
  accept(key: string): boolean {
    const q = questByKey(key);
    if (!q || !this.available(q)) return false;
    const progress: QuestProgress = { key, state: 'active', x: -1, y: -1 };
    if (q.goal.kind === 'find') {
      const giver = this.ctx.npcs.find((n) => n.key === q.giver);
      const b = giver?.body ?? this.ctx.player.body;
      const spot = this.hidingPlace(
        Math.floor((b.x + b.width / 2) / TILE_SIZE),
        Math.floor((b.y + b.height - 1) / TILE_SIZE),
        q.goal.minTiles,
        q.goal.maxTiles,
      );
      progress.x = spot.x;
      progress.y = spot.y;
    }
    this.quests.set(key, progress);
    questPayload.key = key;
    questPayload.title = q.title;
    this.ctx.events.emit('questStarted', questPayload);
    return true;
  }

  private complete(q: QuestDef): void {
    const { inventory, progression, events, npcs } = this.ctx;
    const g = q.goal;
    if (g.kind === 'deliver') inventory.remove(itemId(g.item), g.count);
    if (g.kind === 'find') inventory.remove(itemId(g.item), 1);
    if (g.kind === 'escort') {
      const k = npcs.findIndex((n) => n.key === g.npc && n.escorting);
      if (k >= 0) npcs.splice(k, 1);
      this.escortFear = 0;
    }
    for (const { item, count } of q.reward.items ?? []) {
      const left = inventory.add(itemId(item), count);
      if (left > 0) this.ctx.drop(itemId(item), left);
    }
    for (const flag of q.reward.flags ?? []) progression.set(flag);
    const p = this.quests.get(q.key);
    if (p) p.state = 'done';
    questPayload.key = q.key;
    questPayload.title = q.title;
    events.emit('questCompleted', questPayload);
    events.emit('inventoryChanged', {});
  }

  /** An open cave floor cell between min and max tiles from (cx, cy), or the start if none. */
  private hidingPlace(cx: number, cy: number, min: number, max: number): { x: number; y: number } {
    const { world, random, towns } = this.ctx;
    const open = (x: number, y: number) =>
      world.inBounds(x, y) &&
      !world.isSolid(x, y) &&
      (world.liquid[world.index(x, y)] ?? 0) === 0 &&
      world.get(x, y) === 0;
    for (let k = 0; k < FIND.attempts; k++) {
      const angle = random() * Math.PI * 2;
      const d = min + random() * (max - min);
      const x = Math.round(cx + Math.cos(angle) * d);
      let y = Math.round(cy + Math.abs(Math.sin(angle)) * d);
      if (!world.inBounds(x, y) || y <= world.groundRow(x) + FIND.minDepth) continue;
      if (towns.townAt(x, y) || !open(x, y)) continue;
      // Drop to the floor below.
      while (open(x, y + 1)) y++;
      if (!world.inBounds(x, y + 1) || !world.isSolid(x, y + 1) || !open(x, y - 1)) continue;
      return { x, y };
    }
    return { x: cx, y: cy };
  }

  /**
   * The active find quest's hiding place while the thing is still lost (tiles), or null. Once
   * picked up it is found for good (the quest forgets the place). The result is reused.
   */
  lostThing(): { x: number; y: number; item: number } | null {
    for (const p of this.quests.values()) {
      if (p.state !== 'active' || p.x < 0) continue;
      const q = questByKey(p.key);
      if (q?.goal.kind !== 'find') continue;
      this.lost.x = p.x;
      this.lost.y = p.y;
      this.lost.item = itemId(q.goal.item);
      this.lostQuest = p;
      return this.lost;
    }
    return null;
  }

  private readonly lost = { x: 0, y: 0, item: 0 };
  private lostQuest: QuestProgress | null = null;

  /** The person being escorted right now, if any. */
  escortee(): Npc | undefined {
    return this.ctx.npcs.find((n) => n.escorting);
  }

  update(dt: number, lightAt: (x: number, y: number) => number | null): void {
    this.updateFind();
    for (const p of this.quests.values()) {
      if (p.state !== 'active') continue;
      const q = questByKey(p.key);
      if (q?.goal.kind === 'escort') this.updateEscort(q, q.goal.npc, dt, lightAt);
    }
  }

  private updateFind(): void {
    const lost = this.lostThing();
    if (!lost) return;
    const b = this.ctx.player.body;
    const dx = (lost.x + 0.5) * TILE_SIZE - (b.x + b.width / 2);
    const dy = (lost.y + 0.5) * TILE_SIZE - (b.y + b.height / 2);
    if (Math.hypot(dx, dy) > FIND.pickupTiles * TILE_SIZE || this.ctx.player.dead) return;
    if (this.lostQuest) {
      this.lostQuest.x = -1;
      this.lostQuest.y = -1;
    }
    const left = this.ctx.inventory.add(lost.item, 1);
    if (left > 0) this.ctx.drop(lost.item, left);
    progressPayload.key = '';
    progressPayload.text = `You found ${ITEMS[lost.item]?.name ?? 'it'}!`;
    this.ctx.events.emit('questProgress', progressPayload);
    this.ctx.events.emit('inventoryChanged', {});
  }

  private updateEscort(
    q: QuestDef,
    key: string,
    dt: number,
    lightAt: (x: number, y: number) => number | null,
  ): void {
    const { npcs, player, events } = this.ctx;
    let npc: Npc | undefined;
    for (const n of npcs) if (n.key === key) npc = n;
    if (!npc || player.dead) return;
    const b = npc.body;
    const pb = player.body;
    const dx = pb.x + pb.width / 2 - (b.x + b.width / 2);
    const dy = pb.y + pb.height - (b.y + b.height);
    const dist = Math.hypot(dx, dy);
    if (!npc.escorting) {
      if (dist > ESCORT.joinTiles * TILE_SIZE) return;
      npc.escorting = true;
      npc.scared = false;
      this.escortFear = 0;
      progressPayload.key = q.key;
      progressPayload.text = `${npcDef(key)?.name ?? key} follows you. Keep them in the light!`;
      events.emit('questProgress', progressPayload);
      return;
    }
    this.follow(npc, dx, dist, dt);
    // Arrived in the village?
    const vx = this.ctx.villageX - (b.x + b.width / 2);
    const vy = this.ctx.villageY - (b.y + b.height);
    if (Math.hypot(vx, vy) <= ESCORT.arriveTiles * TILE_SIZE) {
      this.complete(q);
      return;
    }
    // Fear of the dark.
    const light = lightAt(
      Math.floor((b.x + b.width / 2) / TILE_SIZE),
      Math.floor((b.y + b.height / 2) / TILE_SIZE),
    );
    if (light !== null && light < ESCORT.fearLight) this.escortFear += dt;
    else this.escortFear = Math.max(0, this.escortFear - dt * ESCORT.calmRate);
    if (this.escortFear >= ESCORT.fearSeconds) {
      this.escortFear = 0;
      this.ctx.towns.sendHome(npc);
      progressPayload.key = q.key;
      progressPayload.text = q.text.failed ?? '';
      events.emit('escortFled', progressPayload);
    }
  }

  /** Walks after the player (jumping at walls), and catches up if left far behind. */
  private follow(npc: Npc, dx: number, dist: number, dt: number): void {
    const b = npc.body;
    const pb = this.ctx.player.body;
    npc.prevX = b.x;
    npc.prevY = b.y;
    if (dist > ESCORT.catchUpTiles * TILE_SIZE) {
      b.x = pb.x - this.ctx.player.facing * ESCORT.followTiles * TILE_SIZE;
      b.y = pb.y + pb.height - b.height;
      b.vx = 0;
      b.vy = 0;
      npc.prevX = b.x;
      npc.prevY = b.y;
      return;
    }
    const far = Math.abs(dx) > ESCORT.followTiles * TILE_SIZE;
    b.vx = far ? Math.sign(dx) * ESCORT.walkSpeed : 0;
    if (far) npc.facing = dx > 0 ? 1 : -1;
    b.vy = Math.min(b.vy + ENEMY_AI.gravity * dt, ENEMY_AI.maxFallSpeed);
    moveAndCollide(this.ctx.world, b, dt, collision, ENEMY_AI.stepUp, npc.onGround);
    npc.onGround = collision.onGround;
    if (far && npc.onGround && (collision.hitWallLeft || collision.hitWallRight)) {
      b.vy = -ESCORT.jumpSpeed;
      npc.onGround = false;
    }
  }
}
