/**
 * Small structures stamped into the world (debug village start now; generated villages later).
 * Rows top to bottom; each character is a cell from the legend. The last row sits on the ground.
 */
export interface PrefabCell {
  /** Foreground tile key ('' = air). */
  readonly fg: string;
  /** Background wall key ('' = none). */
  readonly bg: string;
}

export interface Prefab {
  readonly key: string;
  readonly rows: readonly string[];
  readonly legend: Readonly<Record<string, PrefabCell>>;
  /** Fill the ground under the bottom row with this tile, down to solid ground. */
  readonly foundation: string;
}

const HOUSE_LEGEND: Record<string, PrefabCell> = {
  '#': { fg: 'elderwood_planks', bg: '' },
  w: { fg: '', bg: 'elderwood_planks' },
  T: { fg: 'torch', bg: 'elderwood_planks' },
  D: { fg: 'door_closed', bg: '' },
  '.': { fg: '', bg: '' },
};

/** A one-room plank cottage: lit, walled, a door on the right — a valid home (M10). */
export const COTTAGE: Prefab = {
  key: 'cottage',
  rows: [
    '##########',
    '#wwwwwwww#',
    '#wTwwwwww#',
    '#wwwwwwwwD',
    '#wwwwwwwwD',
    '#wwwwwwwwD',
    '##########',
  ],
  legend: HOUSE_LEGEND,
  foundation: 'forest_soil',
};
