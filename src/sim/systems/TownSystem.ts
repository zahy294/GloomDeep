import { DIMMING, FESTIVAL, TILE_SIZE, TOWN } from '../../config';
import { FESTIVALS, type FestivalDef } from '../../data/festivals';
import { prefabByKey } from '../../data/prefabs';
import { TILES, tileId } from '../../data/tiles';
import {
  scheduledPlace,
  TOWNS,
  type DistrictDef,
  type ResidentDef,
  type TownDef,
} from '../../data/towns';
import { createNpc, type Npc } from '../entities/Npc';
import type { EventBus, SimEvents } from '../events';
import type { TownPlace } from '../world/worldData';
import type { World } from '../world/World';
import {
  buildNavGraph,
  createNavState,
  goTo,
  pickNode,
  placeAtNode,
  stepNav,
  type NavGraph,
} from './NavSystem';
import type { ProgressionSystem } from './ProgressionSystem';

/** The lamp tiles from full to out (src/data/tiles.ts `lamp.next` chain). */
const LAMP_CHAIN: readonly number[] = (() => {
  const next = new Set(TILES.flatMap((t) => (t.lamp?.next ? [t.lamp.next] : [])));
  const head = TILES.find((t) => t.lamp && !next.has(t.key));
  const chain: number[] = [];
  for (let t = head; t; t = t.lamp?.next ? TILES[tileId(t.lamp.next)] : undefined) chain.push(t.id);
  return chain;
})();
const LAMP_STAGE = new Int8Array(TILES.length).fill(-1);
LAMP_CHAIN.forEach((id, stage) => (LAMP_STAGE[id] = stage));
const RELIGHTS = TILES.map((t) => (t.relights ? tileId(t.relights) : -1));

export interface Lamp {
  readonly x: number;
  readonly y: number;
  /** 0..1 of a full lamp. */
  fuel: number;
}

export interface District {
  readonly def: DistrictDef;
  /** World tiles, inclusive. */
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
  /** Its dormant beacon (relit: a great beacon) — the first one inside it. */
  readonly beaconX: number;
  readonly beaconY: number;
  reclaimed: boolean;
}

export interface Lift {
  readonly x: number;
  readonly y: number;
  readonly line: string;
  readonly level: number;
}

export type FestivalPhase = 'none' | 'due' | 'on' | 'over';

export interface Town {
  readonly def: TownDef;
  readonly place: TownPlace;
  readonly graph: NavGraph;
  readonly lamps: Lamp[];
  readonly districts: District[];
  readonly lifts: readonly Lift[];
  /** 0..1: lamps burning (or districts reclaimed, for the Citadel). */
  light: number;
  /** Every festival the town holds, in order; the one up next (or on); and those held. */
  readonly festivals: readonly FestivalDef[];
  festival: FestivalDef | null;
  festivalPhase: FestivalPhase;
  readonly festivalsDone: string[];
  /** A Dimming night and the town is bright enough to keep a vigil (M12). */
  vigil: boolean;
}

/** What a town remembers in a save (its place comes from world generation). */
export interface SavedTown {
  key: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** [x, y, fuel] per lamp. */
  lamps: [number, number, number][];
  /** The phase of the festival up next, and the festivals already held (M12). */
  festival: FestivalPhase;
  festivalsDone: string[];
}

const townPayload = { town: '', name: '' };
const districtPayload = { town: '', district: '', name: '', x: 0, y: 0 };
const lampPayload = { x: 0, y: 0 };

/**
 * Towns (plan 1.7, plan 3.4 TownSystem): each placed town's waypoint graph, street lamps, light
 * level, residents and (the Citadel) districts.
 * - Street lamps burn fuel at night and step down lit → dim → out; refuelling relights them.
 * - A town's light is the share of its lamps burning (the Citadel's: districts reclaimed). Folk
 *   in a town that is dark at night are afraid and go home; a bright town keeps the Gloam and
 *   creatures out of its streets.
 * - Residents live by their schedules (ScheduleSystem rules are data: src/data/towns.ts) and move
 *   on the graph (NavSystem). Citadel residents return when their district is reclaimed: its
 *   beacon relit and its Gloam burned down.
 * - Festivals: the night after their flag is set.
 */
export class TownSystem {
  readonly towns: Town[] = [];
  private readonly byKey = new Map<string, Town>();
  private timer = 0;
  private hour = 0;
  private dimming = false;
  private readonly unsubscribe: () => void;

  constructor(
    private readonly world: World,
    private readonly events: EventBus<SimEvents>,
    private readonly npcs: Npc[],
    private readonly progression: ProgressionSystem,
    private readonly newId: () => number,
    private readonly random: () => number,
    places: readonly TownPlace[],
  ) {
    for (const place of places) {
      const def = TOWNS.find((t) => t.key === place.key);
      if (def) this.towns.push(this.build(def, place));
    }
    for (const t of this.towns) this.byKey.set(t.def.key, t);
    this.unsubscribe = events.on('tileChanged', ({ x, y, id, previous, layer }) => {
      if (layer !== 'fg') return;
      const wasLamp = (LAMP_STAGE[previous] ?? -1) >= 0;
      const isLamp = (LAMP_STAGE[id] ?? -1) >= 0;
      if (wasLamp && !isLamp) {
        for (const town of this.towns) {
          const k = town.lamps.findIndex((l) => l.x === x && l.y === y);
          if (k >= 0) town.lamps.splice(k, 1);
        }
      }
    });
  }

  destroy(): void {
    this.unsubscribe();
  }

  private build(def: TownDef, place: TownPlace): Town {
    const prefab = prefabByKey(def.prefab);
    const { world } = this;
    const lamps: Lamp[] = [];
    for (let y = place.y0; y <= place.y1; y++) {
      for (let x = place.x0; x <= place.x1; x++) {
        if ((LAMP_STAGE[world.get(x, y)] ?? -1) < 0) continue;
        const start = def.lampFuelStart[lamps.length % def.lampFuelStart.length] ?? 1;
        lamps.push({ x, y, fuel: start });
      }
    }
    const districts: District[] = [];
    for (const o of prefab.objects) {
      if (o.kind !== 'district') continue;
      const d = def.districts?.find((k) => k.key === o.name);
      if (!d) continue;
      const r = {
        x0: place.x0 + o.x0,
        y0: place.y0 + o.y0,
        x1: place.x0 + o.x1,
        y1: place.y0 + o.y1,
      };
      let beaconX = -1;
      let beaconY = -1;
      for (let y = r.y0; y <= r.y1 && beaconX < 0; y++) {
        for (let x = r.x0; x <= r.x1; x++) {
          const id = world.get(x, y);
          if (RELIGHTS[id]! >= 0 || TILES[id]?.beacon) {
            beaconX = x;
            beaconY = y;
            break;
          }
        }
      }
      districts.push({
        def: d,
        ...r,
        beaconX,
        beaconY,
        reclaimed: this.progression.has(districtFlag(d.key)),
      });
    }
    const lifts: Lift[] = prefab.objects
      .filter((o) => o.kind === 'lift')
      .map((o) => ({
        x: place.x0 + o.x0,
        y: place.y0 + o.y0,
        line: String(o.props.line ?? ''),
        level: Number(o.props.level ?? 0),
      }));
    const town: Town = {
      def,
      place,
      graph: buildNavGraph(prefab, place.x0, place.y0),
      lamps,
      districts,
      lifts,
      light: 1,
      festivals: FESTIVALS.filter((f) => f.town === def.key),
      festival: null,
      festivalPhase: 'none',
      festivalsDone: [],
      vigil: false,
    };
    town.festival = town.festivals[0] ?? null;
    town.light = this.lightOf(town);
    return town;
  }

  /**
   * Restores lamp fuel and festival state from a save (towns are rebuilt from their places), and
   * which districts are reclaimed (from the story flags, restored first).
   */
  restore(saved: readonly SavedTown[]): void {
    for (const town of this.towns) {
      for (const d of town.districts) d.reclaimed = this.progression.has(districtFlag(d.def.key));
      town.light = this.lightOf(town);
    }
    for (const s of saved) {
      const town = this.towns.find((t) => t.def.key === s.key);
      if (!town) continue;
      for (const [x, y, fuel] of s.lamps) {
        const lamp = town.lamps.find((l) => l.x === x && l.y === y);
        if (lamp) lamp.fuel = fuel;
      }
      town.festivalsDone.length = 0;
      town.festivalsDone.push(...s.festivalsDone);
      town.festival = town.festivals.find((f) => !town.festivalsDone.includes(f.key)) ?? null;
      town.festivalPhase = town.festival ? s.festival : 'none';
      town.light = this.lightOf(town);
    }
  }

  toSave(): SavedTown[] {
    return this.towns.map((t) => ({
      ...t.place,
      lamps: t.lamps.map((l): [number, number, number] => [l.x, l.y, l.fuel]),
      festival: t.festivalPhase,
      festivalsDone: [...t.festivalsDone],
    }));
  }

  /**
   * `dayFraction`: time of day (0 = midnight); `night`: the sun is down; `dimming`: 0..1, a
   * Dimming night's strength (M12). Lamps burn every step (faster on a Dimming night);
   * schedules, lamp tiles, districts and festivals are re-checked every TOWN.checkSeconds.
   */
  update(dt: number, dayFraction: number, night: boolean, dimming = 0): void {
    this.hour = dayFraction * 24;
    this.dimming = dimming > 0;
    if (night) {
      const burn = (dt / TOWN.lampBurnSeconds) * (this.dimming ? DIMMING.lampBurnScale : 1);
      for (const town of this.towns) {
        if (town.festivalPhase === 'on') continue;
        for (const lamp of town.lamps) if (lamp.fuel > 0) lamp.fuel = Math.max(0, lamp.fuel - burn);
      }
    }
    this.timer += dt;
    if (this.timer >= TOWN.checkSeconds) {
      this.timer = 0;
      for (const town of this.towns) this.check(town, dayFraction, night);
    }
    for (const npc of this.npcs) {
      if (npc.town === '' || npc.escorting) continue;
      const town = this.byKey.get(npc.town);
      if (town) stepNav(npc, town.graph, dt, this.random);
    }
  }

  private check(town: Town, dayFraction: number, night: boolean): void {
    this.updateFestival(town, dayFraction);
    for (const lamp of town.lamps) {
      const want = LAMP_CHAIN[lampStage(lamp.fuel)] ?? 0;
      if (this.world.get(lamp.x, lamp.y) !== want) this.world.set(lamp.x, lamp.y, want);
    }
    for (const d of town.districts) if (!d.reclaimed) this.checkDistrict(town, d);
    town.light = this.lightOf(town);
    this.updateResidents(town, night);
  }

  private lightOf(town: Town): number {
    if (town.districts.length > 0) {
      return town.districts.filter((d) => d.reclaimed).length / town.districts.length;
    }
    if (town.lamps.length === 0) return 1;
    let sum = 0;
    for (const lamp of town.lamps) {
      const stage = lampStage(lamp.fuel);
      sum += stage === 0 ? 1 : stage === 1 ? TOWN.dimLampWorth : 0;
    }
    return sum / town.lamps.length;
  }

  private updateFestival(town: Town, dayFraction: number): void {
    if (town.festivalPhase === 'over' && town.festival) {
      // On to the next festival this town has earned or will earn.
      town.festivalsDone.push(town.festival.key);
      town.festival = town.festivals.find((k) => !town.festivalsDone.includes(k.key)) ?? null;
      town.festivalPhase = 'none';
    }
    const f = town.festival;
    if (!f) return;
    const evening = dayFraction >= FESTIVAL.startsAt || dayFraction < FESTIVAL.endsAt;
    if (town.festivalPhase === 'none' && this.progression.has(f.after)) {
      town.festivalPhase = 'due';
    }
    if (town.festivalPhase === 'due' && dayFraction >= FESTIVAL.startsAt) {
      town.festivalPhase = 'on';
      for (const lamp of town.lamps) lamp.fuel = 1;
      townPayload.town = town.def.key;
      townPayload.name = f.name;
      this.events.emit('festivalStarted', townPayload);
    } else if (town.festivalPhase === 'on' && !evening) {
      town.festivalPhase = 'over';
      townPayload.town = town.def.key;
      townPayload.name = f.name;
      this.events.emit('festivalEnded', townPayload);
    }
  }

  /** A relit district whose Gloam is (nearly) gone is reclaimed: its lamps light, folk return. */
  private checkDistrict(town: Town, d: District): void {
    if (d.beaconX < 0 || RELIGHTS[this.world.get(d.beaconX, d.beaconY)]! >= 0) return;
    const { world } = this;
    let cells = 0;
    let gloamy = 0;
    for (let y = d.y0; y <= d.y1; y++) {
      for (let x = d.x0; x <= d.x1; x++) {
        cells++;
        if ((world.gloam[world.index(x, y)] ?? 0) >= TOWN.reclaimGloam) gloamy++;
      }
    }
    if (gloamy > cells * TOWN.reclaimShare) return;
    d.reclaimed = true;
    this.progression.set(districtFlag(d.def.key));
    for (const lamp of town.lamps) {
      if (lamp.x >= d.x0 && lamp.x <= d.x1 && lamp.y >= d.y0 && lamp.y <= d.y1) lamp.fuel = 1;
    }
    districtPayload.town = town.def.key;
    districtPayload.district = d.def.key;
    districtPayload.name = d.def.name;
    districtPayload.x = d.beaconX;
    districtPayload.y = d.beaconY;
    this.events.emit('districtReclaimed', districtPayload);
  }

  /** Who should be in town now arrives (at their scheduled place); who shouldn't, leaves. */
  private updateResidents(town: Town, night: boolean): void {
    // Underground (the Citadel) there is no night: its folk fear only the Gloam, which keeps
    // them away until their district is reclaimed.
    const underground = town.def.placement.kind === 'underground';
    // A Dimming night asks more of a town: bright ones keep a vigil, the rest hide.
    const dimming = this.dimming && !underground;
    town.vigil = dimming && town.light >= DIMMING.vigilLight && town.def.vigil !== undefined;
    const fearBelow = dimming ? DIMMING.vigilLight : TOWN.scaredBelow;
    const afraid = !underground && night && town.light < fearBelow && town.festivalPhase !== 'on';
    for (const res of town.def.residents) {
      const present = this.residentPresent(town, res);
      const k = this.npcs.findIndex((n) => n.key === res.npc && n.town === town.def.key);
      const npc = k >= 0 ? this.npcs[k] : undefined;
      if (!present) {
        if (npc && !npc.escorting) this.npcs.splice(k, 1);
        continue;
      }
      const place = afraid
        ? res.home
        : town.festivalPhase === 'on' && town.festival
          ? town.festival.gather
          : town.vigil && town.def.vigil
            ? town.def.vigil
            : scheduledPlace(res.schedule, this.hour);
      if (!npc) {
        this.spawnResident(town, res, place).scared = afraid;
        continue;
      }
      if (npc.escorting) continue;
      npc.scared = afraid;
      goTo(npc, town.graph, place);
    }
  }

  private residentPresent(town: Town, res: ResidentDef): boolean {
    if (res.leavesWith && this.progression.has(res.leavesWith)) return false;
    if (res.district) return town.districts.some((d) => d.def.key === res.district && d.reclaimed);
    return true;
  }

  private spawnResident(town: Town, res: ResidentDef, place: string): Npc {
    const id = this.newId();
    let node = pickNode(town.graph, place, id);
    if (node < 0) node = Math.max(0, pickNode(town.graph, res.home, id));
    const npc = createNpc(id, res.npc, 0, 0);
    npc.town = town.def.key;
    npc.nav = createNavState(node, place);
    placeAtNode(npc, town.graph, node);
    this.npcs.push(npc);
    return npc;
  }

  /** Sends a townsperson back to their home waypoint at once (an escort that ran home). */
  sendHome(npc: Npc): void {
    const town = this.towns.find((t) => t.def.key === npc.town);
    const res = town?.def.residents.find((r) => r.npc === npc.key);
    if (!town || !res) return;
    npc.escorting = false;
    const node = Math.max(0, pickNode(town.graph, res.home, npc.id));
    npc.nav = createNavState(node, res.home);
    placeAtNode(npc, town.graph, node);
  }

  townOf(npc: Npc): Town | undefined {
    return this.towns.find((t) => t.def.key === npc.town);
  }

  townByKey(key: string): Town | undefined {
    return this.towns.find((t) => t.def.key === key);
  }

  /** The town whose rectangle holds tile (x, y). */
  townAt(x: number, y: number): Town | undefined {
    return this.towns.find(
      (t) => x >= t.place.x0 && x <= t.place.x1 && y >= t.place.y0 && y <= t.place.y1,
    );
  }

  /** Inside a town bright enough to keep the Gloam and creature spawns out (not the Citadel). */
  protects(x: number, y: number): boolean {
    for (const t of this.towns) {
      if (t.districts.length > 0 || t.light < TOWN.protectLight) continue;
      if (x >= t.place.x0 && x <= t.place.x1 && y >= t.place.y0 && y <= t.place.y1) return true;
    }
    return false;
  }

  /** The street lamp at a tile, if any (in any town). */
  lampAt(x: number, y: number): Lamp | undefined {
    for (const t of this.towns) {
      const lamp = t.lamps.find((l) => l.x === x && l.y === y);
      if (lamp) return lamp;
    }
    return undefined;
  }

  /** Refills a lamp and lights it at once. */
  refuel(lamp: Lamp): void {
    lamp.fuel = 1;
    const want = LAMP_CHAIN[0] ?? 0;
    if (this.world.get(lamp.x, lamp.y) !== want) this.world.set(lamp.x, lamp.y, want);
    const town = this.towns.find((t) => t.lamps.includes(lamp));
    if (town) town.light = this.lightOf(town);
    lampPayload.x = lamp.x;
    lampPayload.y = lamp.y;
    this.events.emit('lampRefuelled', lampPayload);
  }

  /** The district whose dormant beacon is at tile (x, y). */
  dormantDistrictAt(x: number, y: number): { town: Town; district: District } | undefined {
    if (RELIGHTS[this.world.get(x, y)]! < 0) return undefined;
    for (const town of this.towns) {
      const district = town.districts.find((d) => d.beaconX === x && d.beaconY === y);
      if (district) return { town, district };
    }
    return undefined;
  }

  /** Relights a district's beacon (the cost is paid by the caller). */
  relight(town: Town, d: District): void {
    const into = RELIGHTS[this.world.get(d.beaconX, d.beaconY)] ?? -1;
    if (into < 0) return;
    this.world.set(d.beaconX, d.beaconY, into);
    districtPayload.town = town.def.key;
    districtPayload.district = d.def.key;
    districtPayload.name = d.def.name;
    districtPayload.x = d.beaconX;
    districtPayload.y = d.beaconY;
    this.events.emit('beaconRelit', districtPayload);
  }

  /**
   * Riding a lift from its post at tile (x, y): to the next stop up its line, or from the top back
   * down to the bottom. Returns the stop's feet cell, or null if (x, y) is no lift stop.
   */
  liftDestination(x: number, y: number): { x: number; y: number } | null {
    for (const town of this.towns) {
      const from = town.lifts.find((l) => l.x === x && l.y === y);
      if (!from) continue;
      const line = town.lifts.filter((l) => l.line === from.line).sort((a, b) => a.level - b.level);
      const up = line.find((l) => l.level > from.level);
      const to = up ?? line[0];
      if (!to || to === from) return null;
      return { x: to.x, y: to.y };
    }
    return null;
  }

  /** Is the tile column at pixel x, row y inside a town at all (for the UI's town banner)? */
  townAtPixel(px: number, py: number): Town | undefined {
    return this.townAt(Math.floor(px / TILE_SIZE), Math.floor(py / TILE_SIZE));
  }
}

export function districtFlag(key: string): string {
  return `district:${key}`;
}

/** 0 = lit, 1 = dim, 2 = out (index into the lamp chain). */
export function lampStage(fuel: number): number {
  if (fuel > TOWN.lampDimBelow) return 0;
  return fuel > 0 ? Math.min(1, LAMP_CHAIN.length - 1) : LAMP_CHAIN.length - 1;
}
