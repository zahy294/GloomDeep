/**
 * Trade roads (plan 1.7 "Lit trade roads: once you light a road between two towns, caravan NPCs
 * travel it and trade prices improve"). Ends are a town key or `village` (your village: the spawn
 * glade). A road runs along the ground between the two ends; it is lit when every stretch of it
 * has a light nearby (ROAD in config).
 */

export interface RoadDef {
  readonly key: string;
  readonly name: string;
  readonly from: string;
  readonly to: string;
}

export const VILLAGE = 'village';

export const ROADS: readonly RoadDef[] = [
  { key: 'canopy_road', name: 'the Canopy Road', from: VILLAGE, to: 'canopyhold' },
];

export function roadByKey(key: string): RoadDef | undefined {
  return ROADS.find((r) => r.key === key);
}
