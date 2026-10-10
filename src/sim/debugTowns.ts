import { FESTIVAL, ROAD, TILE_SIZE } from '../config';
import { scheduledPlace } from '../data/towns';
import { FESTIVALS } from '../data/festivals';
import { tileId, TILES } from '../data/tiles';
import type { Simulation } from './Simulation';
import { AIR } from './world/World';

/**
 * Debug starts for M11 (`?spot=canopyhold|citadel|road`, `?road=lit`, `?festival=1`,
 * `?quest=<key>`, `?reclaim=<districts>`), so towns can be screenshotted and tried at once.
 * They change the world through the same tiles and flags play would.
 */

const TORCH = tileId('torch');
const RELIGHTS = TILES.map((t) => (t.relights ? tileId(t.relights) : -1));

/** Feet position (tile x, the row the feet rest on) for a town debug spot, or null. */
export function townSpot(
  sim: Simulation,
  spot: 'canopyhold' | 'citadel' | 'road',
): { x: number; y: number } | null {
  if (spot === 'road') {
    // On the road a little way out of the town, where its caravan sets out.
    const road = sim.roads.roads[0];
    if (!road) return null;
    const village = Math.floor(sim.spawnX / TILE_SIZE);
    const townEnd = Math.abs(road.x0 - village) < Math.abs(road.x1 - village) ? road.x1 : road.x0;
    const x = townEnd + Math.sign(village - townEnd) * ROAD_SPOT_TILES;
    return { x, y: sim.world.groundRow(x) };
  }
  const town = sim.towns.townByKey(spot);
  if (!town) return null;
  const tag = spot === 'canopyhold' ? 'plaza' : 'street:gate_ward';
  const node = town.graph.nodes.find((n) => n.tag === tag);
  return node ? { x: node.x, y: node.y + 1 } : null;
}

/**
 * `?near=<npc>`: beside a townsperson, at the place their schedule has them at the start time
 * (they arrive there on the first town check), so screenshots can talk and trade at once.
 */
export function besideResident(sim: Simulation, npc: string): { x: number; y: number } | null {
  for (const town of sim.towns.towns) {
    const res = town.def.residents.find((r) => r.npc === npc);
    if (!res) continue;
    const place = scheduledPlace(res.schedule, sim.dayFraction * 24);
    const node = town.graph.nodes.find((n) => n.tag === place);
    if (!node) return null;
    return { x: node.x - NEAR_TILES, y: node.y + 1 };
  }
  return null;
}

/** How far from a road's town end `?spot=road` stands, and from someone `?near=` stands. */
const ROAD_SPOT_TILES = 14;
const NEAR_TILES = 2;

/** Lights every road: a torch on the ground every ROAD.litRadius columns from end to end. */
export function lightRoads(sim: Simulation): void {
  const { world } = sim;
  for (const road of sim.roads.roads) {
    for (let x = road.x0; x <= road.x1; x += ROAD.litRadius) {
      if (sim.towns.townAt(x, world.groundRow(x) - 1)) continue;
      const y = world.groundRow(x) - 1;
      if (world.get(x, y) === AIR) world.set(x, y, TORCH);
    }
  }
}

/** Relights these districts' beacons and burns their Gloam away (reclaimed on the next check). */
export function relightDistricts(sim: Simulation, keys: readonly string[]): void {
  const { world } = sim;
  for (const town of sim.towns.towns) {
    for (const d of town.districts) {
      if (!keys.includes(d.def.key)) continue;
      const into = RELIGHTS[world.get(d.beaconX, d.beaconY)] ?? -1;
      if (into >= 0) world.set(d.beaconX, d.beaconY, into);
      for (let y = d.y0; y <= d.y1; y++) {
        for (let x = d.x0; x <= d.x1; x++) {
          const i = world.index(x, y);
          sim.gloam.total -= world.gloam[i] ?? 0;
          world.gloam[i] = 0;
        }
      }
    }
  }
}

/** The first festival's flag is set and the clock moved to its dusk, so it starts at once. */
export function startFestival(sim: Simulation): void {
  const festival = FESTIVALS[0];
  if (!festival) return;
  sim.progression.set(festival.after);
  if (sim.dayFraction < FESTIVAL.startsAt && sim.dayFraction >= FESTIVAL.endsAt) {
    sim.setDayFraction(FESTIVAL.startsAt + FESTIVAL_LEAD);
  }
}

/** How far past the festival's start the clock is set (a few in-game minutes). */
const FESTIVAL_LEAD = 0.005;
