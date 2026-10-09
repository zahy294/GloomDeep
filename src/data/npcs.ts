/**
 * Folk (plan 1.7, section 4 "NPCs"). Villagers move into lit homes in your village; the Old Dryad
 * waits by the spawn tree and talks about the forest. Dialogue is data: villagers cycle through
 * their lines; the Dryad's lines depend on how much of the forest's Gloam is cleansed.
 */
import type { RampName } from './palette';

export interface NpcDef {
  readonly key: string;
  readonly name: string;
  /** What they do (shown when talking; trading arrives with M11). */
  readonly role: string;
  /** Cloak and accent colours of the placeholder sprite. */
  readonly ramp: RampName;
  readonly accent: RampName;
  /** Moves in once the village has at least this many valid homes (and one is free). */
  readonly homesNeeded: number;
  readonly lines: readonly string[];
}

export const VILLAGERS: readonly NpcDef[] = [
  {
    key: 'tinker',
    name: 'Bramwell',
    role: 'Tinker',
    ramp: 'bark',
    accent: 'gold',
    homesNeeded: 1,
    lines: [
      'A lit room and a door that shuts. That is all a tinker asks.',
      'Bring me copper and I will make it sing. Later, mind. My tools are still packed.',
      'The roots groan at night. Something down there is hungry for the dark.',
    ],
  },
  {
    key: 'herbalist',
    name: 'Fennel',
    role: 'Herbalist',
    ramp: 'leaf',
    accent: 'rose',
    homesNeeded: 2,
    lines: [
      'Lumen blooms only open in the light. Pick them then, or not at all.',
      'Glowmoss creeps where it is dark and damp. A good sign, mostly.',
      'Fairy rings at night? Stand inside one. Your feet will thank you.',
    ],
  },
  {
    key: 'glassblower',
    name: 'Ysolde',
    role: 'Glassblower',
    ramp: 'cyan',
    accent: 'moonSilver',
    homesNeeded: 3,
    lines: [
      'Silt, fire and patience: that is glass. Jars, lenses, lamps.',
      'Catch fireflies in a jar and they will light your hall for good.',
      'Azure glass shows what hides. Mind where you step in the deep caves.',
    ],
  },
  {
    key: 'archivist',
    name: 'Old Corwin',
    role: 'Archivist',
    ramp: 'moonSilver',
    accent: 'honey',
    homesNeeded: 4,
    lines: [
      'The beacons were the old way of keeping the dark at bay. Build them again.',
      'Four homes, four lamps. A village, at last. The Heartlight may yet remember us.',
      'The runes wake when you pass. They remember the Lamplighters.',
    ],
  },
];

/** The Old Dryad: a tree spirit at the spawn tree (always present, never needs a home). */
export const DRYAD: NpcDef = {
  key: 'dryad',
  name: 'The Old Dryad',
  role: 'Spirit of the Elder Tree',
  ramp: 'moss',
  accent: 'mint',
  homesNeeded: 0,
  lines: [],
};

/** The Dryad's words by the share of the forest's Gloam that has been cleansed (0..1). */
export const DRYAD_LINES: readonly { readonly from: number; readonly lines: readonly string[] }[] =
  [
    {
      from: 0,
      lines: [
        'Lamplighter. You came. The Heartlight is fading, and the Gloam climbs my roots.',
        'Light is life here. Where you carry it, the Gloam must give way.',
        'Build homes, and light them. My folk are scattered, but they will come to a warm window.',
      ],
    },
    {
      from: 0.05,
      lines: [
        'I felt that. A little of the dark has lifted. Keep going.',
        'Beacons hold the dark back for good. Your folk will know how to make them.',
      ],
    },
    {
      from: 0.25,
      lines: [
        'The roots breathe easier. A quarter of the Gloam is gone, burned away by your light.',
        'Deeper, Lamplighter. The heart of the dark waits at the bottom of the world.',
      ],
    },
    {
      from: 0.6,
      lines: ['I can feel the Heartlight stirring again. You have done more than I dared hope.'],
    },
  ];

export function dryadLines(cleansed: number): readonly string[] {
  let lines = DRYAD_LINES[0]?.lines ?? [];
  for (const tier of DRYAD_LINES) if (cleansed >= tier.from) lines = tier.lines;
  return lines;
}
