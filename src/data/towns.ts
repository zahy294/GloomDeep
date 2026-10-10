/**
 * Towns (plan 1.7): where each prefab is placed by world generation, who lives there and on what
 * daily routine, and (for the Rootdeep Citadel) its districts. Places in schedules are waypoint
 * tags from the town's Tiled prefab (`home:<npc>`, `shop:<npc>`, `inn`, `plaza`, ...).
 */
import type { ItemCount } from './items';

/** From `hour` (0–24) until the next entry, the resident goes to a waypoint with this tag. */
export interface ScheduleEntry {
  readonly hour: number;
  readonly place: string;
}

export interface ResidentDef {
  /** Folk key (src/data/npcs.ts). */
  readonly npc: string;
  /** Where they sleep and where they flee when the town is dark at night. */
  readonly home: string;
  readonly schedule: readonly ScheduleEntry[];
  /** Citadel residents return only once their district is reclaimed. */
  readonly district?: string;
  /** Lives here only while this story flag is not set (e.g. after moving to your village). */
  readonly leavesWith?: string;
}

export interface DistrictDef {
  /** The `district` rectangle's name in the prefab. */
  readonly key: string;
  readonly name: string;
  /** What relighting its dormant beacon costs. */
  readonly relightCost: readonly ItemCount[];
}

export type TownPlacement =
  | {
      /** On the Elderglade surface, this many columns (to its near edge) from the spawn. */
      readonly kind: 'surface';
      readonly minOffset: number;
      readonly maxOffset: number;
    }
  | {
      /** Underground: its top this many rows below a depth layer's top. */
      readonly kind: 'underground';
      readonly layer: string;
      readonly depth: number;
      readonly minOffset: number;
      readonly maxOffset: number;
    };

export interface TownDef {
  readonly key: string;
  readonly name: string;
  /** Prefab key (src/data/prefabs). */
  readonly prefab: string;
  readonly placement: TownPlacement;
  readonly residents: readonly ResidentDef[];
  readonly districts?: readonly DistrictDef[];
  /**
   * Lamp fuel when the world begins, as a share of a full lamp, per lamp (cycled): a town that has
   * been tending its lamps starts mostly lit.
   */
  readonly lampFuelStart: readonly number[];
}

export const TOWNS: readonly TownDef[] = [
  {
    key: 'canopyhold',
    name: 'Canopyhold',
    prefab: 'canopyhold',
    placement: { kind: 'surface', minOffset: 150, maxOffset: 210 },
    lampFuelStart: [1, 0.8, 0.55, 0.3, 0.9, 0.2],
    residents: [
      {
        npc: 'innkeeper',
        home: 'home:innkeeper',
        schedule: [
          { hour: 6, place: 'inn' },
          { hour: 23, place: 'home:innkeeper' },
        ],
      },
      {
        npc: 'merchant',
        home: 'home:merchant',
        schedule: [
          { hour: 7, place: 'shop:merchant' },
          { hour: 19, place: 'inn' },
          { hour: 22, place: 'home:merchant' },
        ],
      },
      {
        npc: 'lampwright',
        home: 'home:lampwright',
        schedule: [
          { hour: 6, place: 'shop:lampwright' },
          { hour: 17, place: 'plaza' },
          { hour: 20, place: 'inn' },
          { hour: 23, place: 'home:lampwright' },
        ],
      },
      {
        npc: 'caravaneer',
        home: 'home:caravaneer',
        schedule: [
          { hour: 7, place: 'yard' },
          { hour: 18, place: 'inn' },
          { hour: 22, place: 'home:caravaneer' },
        ],
      },
      {
        npc: 'courier',
        home: 'home:courier',
        leavesWith: 'juniper_moved',
        schedule: [
          { hour: 8, place: 'lookout' },
          { hour: 12, place: 'plaza' },
          { hour: 18, place: 'inn' },
          { hour: 22, place: 'home:courier' },
        ],
      },
      {
        npc: 'child',
        home: 'home:child',
        schedule: [
          { hour: 8, place: 'plaza' },
          { hour: 12, place: 'bridge' },
          { hour: 16, place: 'plaza' },
          { hour: 20, place: 'home:child' },
        ],
      },
      {
        npc: 'ropewright',
        home: 'home:ropewright',
        schedule: [
          { hour: 7, place: 'deck' },
          { hour: 12, place: 'plaza' },
          { hour: 18, place: 'inn' },
          { hour: 22, place: 'home:ropewright' },
        ],
      },
      {
        npc: 'weaver',
        home: 'home:weaver',
        schedule: [
          { hour: 8, place: 'deck' },
          { hour: 13, place: 'lookout' },
          { hour: 18, place: 'plaza' },
          { hour: 21, place: 'home:weaver' },
        ],
      },
    ],
  },
  {
    key: 'citadel',
    name: 'Rootdeep Citadel',
    prefab: 'citadel',
    placement: {
      kind: 'underground',
      layer: 'rootdeep',
      depth: 30,
      minOffset: 260,
      maxOffset: 420,
    },
    lampFuelStart: [0],
    districts: [
      {
        key: 'gate_ward',
        name: 'the Gate Ward',
        relightCost: [{ item: 'lumen_crystal', count: 3 }],
      },
      {
        key: 'lantern_market',
        name: 'the Lantern Market',
        relightCost: [{ item: 'lumen_crystal', count: 5 }],
      },
      {
        key: 'high_hall',
        name: 'the High Hall',
        relightCost: [
          { item: 'lumen_crystal', count: 8 },
          { item: 'moonstone_crystal', count: 4 },
        ],
      },
    ],
    residents: [
      {
        npc: 'warden',
        home: 'home:gate_ward:a',
        district: 'gate_ward',
        schedule: [
          { hour: 6, place: 'gate:west' },
          { hour: 12, place: 'beacon:gate_ward' },
          { hour: 21, place: 'home:gate_ward:a' },
        ],
      },
      {
        npc: 'smith',
        home: 'home:lantern_market:a',
        district: 'lantern_market',
        schedule: [
          { hour: 7, place: 'street:lantern_market' },
          { hour: 20, place: 'home:lantern_market:a' },
        ],
      },
      {
        npc: 'lampkeeper',
        home: 'home:lantern_market:b',
        district: 'lantern_market',
        schedule: [
          { hour: 6, place: 'beacon:lantern_market' },
          { hour: 14, place: 'street:lantern_market' },
          { hour: 22, place: 'home:lantern_market:b' },
        ],
      },
      {
        npc: 'scholar',
        home: 'home:high_hall:a',
        district: 'high_hall',
        schedule: [
          { hour: 8, place: 'beacon:high_hall' },
          { hour: 15, place: 'street:high_hall' },
          { hour: 22, place: 'home:high_hall:a' },
        ],
      },
    ],
  },
];

export function townByKey(key: string): TownDef | undefined {
  return TOWNS.find((t) => t.key === key);
}

/** The schedule entry in force at `hour` (0–24): the last one at or before it, wrapping round. */
export function scheduledPlace(schedule: readonly ScheduleEntry[], hour: number): string {
  let place = schedule[schedule.length - 1]?.place ?? '';
  for (const entry of schedule) if (hour >= entry.hour) place = entry.place;
  return place;
}
