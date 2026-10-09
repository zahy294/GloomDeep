import { TILE_SIZE, WISP } from '../../config';
import { TILES } from '../../data/tiles';
import type { Player } from '../entities/Player';
import type { EventBus, SimEvents } from '../events';
import type { World } from '../world/World';

/** Per tile id: does it mark a secret a wisp can lead to? */
const SECRET = Uint8Array.from(TILES, (t) =>
  t.veiled || t.key === 'fairy_mushroom' || t.key === 'carved_runestone' ? 1 : 0,
);

export interface Wisp {
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  /** The secret it leads to (pixels). */
  targetX: number;
  targetY: number;
  age: number;
}

const appearedPayload = { x: 0, y: 0 };
const arrivedPayload = { x: 0, y: 0 };

/**
 * Wisps (plan 1.5, M10): small spirits of light that lead the player to secrets — veiled ore and
 * spirit platforms, fairy rings, carved ruins. Now and then (at night or underground) one appears
 * by the player and drifts towards the nearest secret not yet found, staying a little ahead and
 * waiting when the player falls behind; it sparkles away on arrival. Not saved.
 */
export class WispSystem {
  wisp: Wisp | null = null;
  private timer = 0;
  /** Secrets already led to, by coarse cell, so the same one isn't shown twice. */
  private readonly visited = new Set<number>();

  constructor(
    private readonly world: World,
    private readonly events: EventBus<SimEvents>,
    private readonly random: () => number,
  ) {}

  update(dt: number, player: Player, outdoorsByDay: boolean): void {
    const b = player.body;
    const px = b.x + b.width / 2;
    const py = b.y + b.height / 2;
    const w = this.wisp;
    if (!w) {
      this.timer += dt;
      if (this.timer < WISP.interval || outdoorsByDay) return;
      this.timer = 0;
      if (this.random() >= WISP.chance) return;
      this.appear(px, py);
      return;
    }
    w.prevX = w.x;
    w.prevY = w.y;
    w.age += dt;
    const toTarget = Math.hypot(w.targetX - px, w.targetY - py);
    if (toTarget <= WISP.arriveTiles * TILE_SIZE || w.age >= WISP.lifeSeconds) {
      if (toTarget <= WISP.arriveTiles * TILE_SIZE) {
        arrivedPayload.x = w.targetX;
        arrivedPayload.y = w.targetY;
        this.events.emit('wispArrived', arrivedPayload);
      }
      this.wisp = null;
      return;
    }
    // Lead: move towards the secret, but wait if the player is too far behind.
    const fromPlayer = Math.hypot(w.x - px, w.y - py);
    let tx = w.targetX;
    let ty = w.targetY;
    if (fromPlayer > WISP.leadTiles * TILE_SIZE) {
      tx = px + ((w.x - px) / fromPlayer) * WISP.waitTiles * TILE_SIZE;
      ty = py + ((w.y - py) / fromPlayer) * WISP.waitTiles * TILE_SIZE;
    }
    const dx = tx - w.x;
    const dy = ty - w.y;
    const d = Math.hypot(dx, dy);
    const stepLen = Math.min(d, WISP.speed * dt);
    if (d > 0) {
      w.x += (dx / d) * stepLen;
      w.y += (dy / d) * stepLen + Math.sin(w.age * WISP.bobRate) * WISP.bob * dt;
    }
  }

  /** Debug and screenshots: a wisp appears now (if there's a secret within reach). */
  summon(player: Player): void {
    const b = player.body;
    this.timer = 0;
    this.appear(b.x + b.width / 2, b.y + b.height / 2);
  }

  private appear(px: number, py: number): void {
    const target = this.findSecret(px / TILE_SIZE, py / TILE_SIZE);
    if (!target) return;
    const x = px + WISP.appearOffset * (target.x * TILE_SIZE > px ? 1 : -1);
    const y = py - WISP.appearOffset;
    this.wisp = {
      x,
      y,
      prevX: x,
      prevY: y,
      targetX: (target.x + 0.5) * TILE_SIZE,
      targetY: (target.y + 0.5) * TILE_SIZE,
      age: 0,
    };
    this.visited.add(this.cellKey(target.x, target.y));
    appearedPayload.x = x;
    appearedPayload.y = y;
    this.events.emit('wispAppeared', appearedPayload);
  }

  /** The nearest unvisited secret within WISP.searchTiles (scanned in a coarse grid first). */
  private findSecret(cx: number, cy: number): { x: number; y: number } | null {
    const { world } = this;
    const r = WISP.searchTiles;
    let best: { x: number; y: number } | null = null;
    let bestD = Infinity;
    const x0 = Math.max(0, Math.floor(cx - r));
    const x1 = Math.min(world.width - 1, Math.floor(cx + r));
    const y0 = Math.max(0, Math.floor(cy - r));
    const y1 = Math.min(world.height - 1, Math.floor(cy + r));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const id = world.fg[y * world.width + x] ?? 0;
        if (SECRET[id] !== 1) continue;
        const d = (x - cx) * (x - cx) + (y - cy) * (y - cy);
        if (d < WISP.minTiles * WISP.minTiles || d >= bestD) continue;
        if (this.visited.has(this.cellKey(x, y))) continue;
        best = { x, y };
        bestD = d;
      }
    }
    return best;
  }

  private cellKey(x: number, y: number): number {
    const g = WISP.secretCell;
    return Math.floor(y / g) * 100000 + Math.floor(x / g);
  }
}
