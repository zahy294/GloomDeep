import { ROAD, TILE_SIZE } from '../../config';
import { ROADS, VILLAGE, type RoadDef } from '../../data/roads';
import { lightByKey, type LightDef } from '../../data/lights';
import { TILES } from '../../data/tiles';
import type { EventBus, SimEvents } from '../events';
import type { World } from '../world/World';
import type { LightPoint } from './LightSystem';
import type { ProgressionSystem } from './ProgressionSystem';
import type { TownSystem } from './TownSystem';

/** Placed lights count for lighting a road; glowing flora and ore don't. */
const ROAD_LIGHT = Uint8Array.from(TILES, (t) =>
  t.light && !t.decor && !t.placeholderOre ? 1 : 0,
);
const CARAVAN_LIGHT = lightByKey(ROAD.caravanLight);

export interface Caravan {
  /** Feet centre, pixels. */
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  /** +1 heading for the road's higher column, -1 for the lower. */
  dir: 1 | -1;
  /** Seconds left resting at an end. */
  rest: number;
}

export interface Road {
  readonly def: RoadDef;
  /** End columns (x0 < x1) and the columns checked for light between them. */
  readonly x0: number;
  readonly x1: number;
  readonly samples: readonly number[];
  readonly lit: Uint8Array;
  litCount: number;
  caravan: Caravan | null;
  /** The caravan's lantern (pixels), reused. */
  readonly lamp: { x: number; y: number; light: LightDef };
}

const progressPayload = { road: '', name: '', lit: 0, total: 0 };
const roadPayload = { road: '', name: '' };
const caravanPayload = { road: '', place: '' };

/**
 * Lit trade roads and caravans (plan 1.7, plan 3.4 TradeSystem "Shops and caravans"). Each road
 * runs along the ground between your village (the spawn) and a town's nearest gate. A road is lit
 * when every point on it (every ROAD.sampleSpacing columns, outside towns) has a placed light
 * within ROAD.litRadius. A lit road sets the flag `road:<key>`, lowers prices in its towns, and a
 * caravan walks it back and forth (only while it stays lit). Caravans are not saved: a lit road
 * gets one again on load.
 */
export class RoadSystem {
  readonly roads: Road[] = [];
  private dirty = false;
  private timer = 0;
  private readonly unsubscribe: () => void;

  constructor(
    private readonly world: World,
    private readonly events: EventBus<SimEvents>,
    private readonly towns: TownSystem,
    private readonly progression: ProgressionSystem,
    villageColumn: number,
  ) {
    for (const def of ROADS) {
      const a = this.endColumn(def.from, villageColumn, def.to);
      const b = this.endColumn(def.to, villageColumn, def.from);
      if (a === null || b === null) continue;
      const x0 = Math.min(a, b);
      const x1 = Math.max(a, b);
      const samples: number[] = [];
      for (let x = x0; x <= x1; x += ROAD.sampleSpacing) {
        if (!this.towns.townAt(x, world.groundRow(x) - 1)) samples.push(x);
      }
      const road: Road = {
        def,
        x0,
        x1,
        samples,
        lit: new Uint8Array(samples.length),
        litCount: 0,
        caravan: null,
        lamp: { x: 0, y: 0, light: CARAVAN_LIGHT },
      };
      this.recount(road, false);
      this.roads.push(road);
    }
    this.unsubscribe = events.on('tileChanged', ({ x, id, previous, layer }) => {
      if (layer !== 'fg' || (ROAD_LIGHT[id] !== 1 && ROAD_LIGHT[previous] !== 1)) return;
      for (const r of this.roads) {
        if (x >= r.x0 - ROAD.litRadius && x <= r.x1 + ROAD.litRadius) this.dirty = true;
      }
    });
  }

  destroy(): void {
    this.unsubscribe();
  }

  /** A road end: the village's column, or the gate of the town nearest the other end. */
  private endColumn(end: string, villageColumn: number, other: string): number | null {
    if (end === VILLAGE) return villageColumn;
    const town = this.towns.townByKey(end);
    if (!town) return null;
    const toward =
      other === VILLAGE ? villageColumn : (this.towns.townByKey(other)?.place.x0 ?? villageColumn);
    let best: number | null = null;
    for (const n of town.graph.nodes) {
      if (!n.tag.startsWith('gate')) continue;
      if (best === null || Math.abs(n.x - toward) < Math.abs(best - toward)) best = n.x;
    }
    return best;
  }

  isLit(road: Road): boolean {
    return road.samples.length > 0 && road.litCount === road.samples.length;
  }

  /** Lit roads with an end at this town (or the village). */
  litRoadsTo(place: string): number {
    return this.roads.filter((r) => (r.def.from === place || r.def.to === place) && this.isLit(r))
      .length;
  }

  update(dt: number): void {
    this.timer += dt;
    if (this.dirty && this.timer >= ROAD.checkSeconds) {
      this.timer = 0;
      this.dirty = false;
      for (const road of this.roads) this.recount(road, true);
    }
    for (const road of this.roads) this.moveCaravan(road, dt);
  }

  private recount(road: Road, announce: boolean): void {
    const before = road.litCount;
    const wasLit = this.isLit(road);
    road.litCount = 0;
    road.samples.forEach((x, i) => {
      const on = this.pointLit(x, this.world.groundRow(x) - 1) ? 1 : 0;
      road.lit[i] = on;
      road.litCount += on;
    });
    const lit = this.isLit(road);
    if (lit) this.progression.set(roadFlag(road.def.key));
    if (!announce) return;
    if (road.litCount !== before) {
      progressPayload.road = road.def.key;
      progressPayload.name = road.def.name;
      progressPayload.lit = road.litCount;
      progressPayload.total = road.samples.length;
      this.events.emit('roadProgress', progressPayload);
    }
    if (lit && !wasLit) {
      roadPayload.road = road.def.key;
      roadPayload.name = road.def.name;
      this.events.emit('roadLit', roadPayload);
    }
  }

  private pointLit(cx: number, cy: number): boolean {
    const { world } = this;
    const r = ROAD.litRadius;
    for (let y = cy - ROAD.litRows; y <= cy + ROAD.litRows; y++) {
      for (let x = cx - r; x <= cx + r; x++) {
        if (!world.inBounds(x, y)) continue;
        if (ROAD_LIGHT[world.fg[y * world.width + x] ?? 0] !== 1) continue;
        if ((x - cx) * (x - cx) + (y - cy) * (y - cy) <= r * r) return true;
      }
    }
    return false;
  }

  /**
   * A lit road gets a caravan at its town end; it walks the ground to the other end, rests,
   * and turns back. If the road goes dark it finishes its trip and stays home.
   */
  private moveCaravan(road: Road, dt: number): void {
    const lit = this.isLit(road);
    let c = road.caravan;
    if (!c) {
      if (!lit) return;
      const startHigh = road.def.to !== VILLAGE ? this.townIsHigh(road) : false;
      const x = ((startHigh ? road.x1 : road.x0) + 0.5) * TILE_SIZE;
      const y = this.groundY(x);
      c = { x, y, prevX: x, prevY: y, dir: startHigh ? -1 : 1, rest: 0 };
      road.caravan = c;
    }
    c.prevX = c.x;
    c.prevY = c.y;
    if (c.rest > 0) {
      c.rest -= dt;
      if (c.rest <= 0 && !lit) road.caravan = null;
      return;
    }
    c.x += c.dir * ROAD.caravanSpeed * dt;
    const lo = (road.x0 + 0.5) * TILE_SIZE;
    const hi = (road.x1 + 0.5) * TILE_SIZE;
    if (c.x <= lo || c.x >= hi) {
      c.x = Math.min(hi, Math.max(lo, c.x));
      c.rest = ROAD.caravanRestSeconds;
      const end = c.dir > 0 ? this.highEnd(road) : this.lowEnd(road);
      c.dir = c.dir > 0 ? -1 : 1;
      caravanPayload.road = road.def.key;
      caravanPayload.place = end;
      this.events.emit('caravanArrived', caravanPayload);
    }
    c.y = this.groundY(c.x);
  }

  private groundY(px: number): number {
    return this.world.groundRow(Math.floor(px / TILE_SIZE)) * TILE_SIZE;
  }

  /** Which end key sits at the road's higher column. */
  private highEnd(road: Road): string {
    return this.townIsHigh(road) ? road.def.to : road.def.from;
  }

  private lowEnd(road: Road): string {
    return this.townIsHigh(road) ? road.def.from : road.def.to;
  }

  private townIsHigh(road: Road): boolean {
    const town = this.towns.townByKey(road.def.to);
    return town ? town.place.x0 >= road.x0 + (road.x1 - road.x0) / 2 : true;
  }

  /** Adds the caravans' lanterns to a list of light points. */
  lights(out: LightPoint[]): void {
    for (const r of this.roads) {
      if (!r.caravan) continue;
      r.lamp.x = r.caravan.x;
      r.lamp.y = r.caravan.y - TILE_SIZE;
      out.push(r.lamp);
    }
  }
}

export function roadFlag(key: string): string {
  return `road:${key}`;
}
