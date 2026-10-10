/**
 * Folk (plan 1.7, section 4 "NPCs"): everyone with a name and a sprite. Villagers move into lit
 * homes in your village; townsfolk live in towns (src/data/towns.ts); the Old Dryad waits by the
 * spawn tree. What they say is in src/data/dialogue/, what they sell in src/data/shops.ts.
 */
import type { RampName } from './palette';

export interface NpcDef {
  readonly key: string;
  readonly name: string;
  /** What they do (shown when talking). */
  readonly role: string;
  /** Cloak and accent colours of the placeholder sprite. */
  readonly ramp: RampName;
  readonly accent: RampName;
  /**
   * Moves into your village once it has at least `homesNeeded` valid homes (and one is free), and
   * only after the story flag `requires` is set, if any.
   */
  readonly village?: { readonly homesNeeded: number; readonly requires?: string };
}

/** Your village's folk (M10), in the order they arrive. */
export const VILLAGERS: readonly NpcDef[] = [
  {
    key: 'tinker',
    name: 'Bramwell',
    role: 'Tinker',
    ramp: 'bark',
    accent: 'gold',
    village: { homesNeeded: 1 },
  },
  {
    key: 'herbalist',
    name: 'Fennel',
    role: 'Herbalist',
    ramp: 'leaf',
    accent: 'rose',
    village: { homesNeeded: 2 },
  },
  {
    key: 'glassblower',
    name: 'Ysolde',
    role: 'Glassblower',
    ramp: 'cyan',
    accent: 'moonSilver',
    village: { homesNeeded: 3 },
  },
  {
    key: 'archivist',
    name: 'Old Corwin',
    role: 'Archivist',
    ramp: 'moonSilver',
    accent: 'honey',
    village: { homesNeeded: 4 },
  },
];

/** The Old Dryad: a tree spirit at the spawn tree (always present, never needs a home). */
export const DRYAD: NpcDef = {
  key: 'dryad',
  name: 'The Old Dryad',
  role: 'Spirit of the Elder Tree',
  ramp: 'moss',
  accent: 'mint',
};

/** Townsfolk (M11): Canopyhold and the Rootdeep Citadel. */
export const TOWNSFOLK: readonly NpcDef[] = [
  { key: 'innkeeper', name: 'Rowan', role: 'Innkeeper', ramp: 'ember', accent: 'honey' },
  { key: 'merchant', name: 'Tamsin', role: 'Trader', ramp: 'gold', accent: 'bark' },
  { key: 'lampwright', name: 'Wren', role: 'Lampwright', ramp: 'honey', accent: 'ember' },
  { key: 'caravaneer', name: 'Hesper', role: 'Caravan Master', ramp: 'soil', accent: 'gold' },
  {
    key: 'courier',
    name: 'Juniper',
    role: 'Beekeeper',
    ramp: 'honey',
    accent: 'leaf',
    // After you escort her through the dark, she settles in your village.
    village: { homesNeeded: 5, requires: 'juniper_moved' },
  },
  { key: 'child', name: 'Pip', role: 'Lamplighter-to-be', ramp: 'rose', accent: 'moonSilver' },
  { key: 'ropewright', name: 'Moss', role: 'Ropewright', ramp: 'moss', accent: 'bark' },
  { key: 'weaver', name: 'Bryony', role: 'Weaver', ramp: 'emerald', accent: 'rose' },
  { key: 'warden', name: 'Aldric', role: 'Gate Warden', ramp: 'stone', accent: 'cyan' },
  { key: 'smith', name: 'Dorran', role: 'Root-smith', ramp: 'tealShadow', accent: 'ember' },
  { key: 'lampkeeper', name: 'Sefa', role: 'Lampkeeper', ramp: 'mint', accent: 'gold' },
  {
    key: 'scholar',
    name: 'Isolde',
    role: 'Scholar of the Hall',
    ramp: 'moonSilver',
    accent: 'cyan',
  },
  {
    // M12: once the Mire Sovereign falls, the ferrywoman comes up out of the Mire to your village.
    key: 'ferrywoman',
    name: 'Hulda',
    role: 'Mire Ferrywoman',
    ramp: 'mud',
    accent: 'mint',
    village: { homesNeeded: 5, requires: 'boss:mire_sovereign' },
  },
];

/** Everyone with a sprite, in `folk` sheet order (two frames each: standing, mid-step). */
export const FOLK: readonly NpcDef[] = [...VILLAGERS, DRYAD, ...TOWNSFOLK];

/** Everyone who can move into your village, in arrival order. */
export const VILLAGE_ARRIVALS: readonly NpcDef[] = FOLK.filter((n) => n.village);

export function folkFrame(key: string): number {
  return (
    Math.max(
      0,
      FOLK.findIndex((n) => n.key === key),
    ) * 2
  );
}

export function npcDef(key: string): NpcDef | undefined {
  return FOLK.find((n) => n.key === key);
}
