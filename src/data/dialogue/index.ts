/**
 * What folk say (plan 1.7 "Dialogue changes with story flags and with how much of the forest has
 * been cleansed"). For each person, the LAST entry whose condition holds is used, so list the
 * general lines first and the specific ones after. Right-clicking someone again says their next
 * line. Quest offers and updates come from src/data/quests/ and take precedence.
 */

export interface DialogueCondition {
  /** Every one of these story flags is set. */
  readonly flags?: readonly string[];
  /** None of these is set. */
  readonly notFlags?: readonly string[];
  /** At least this share (0..1) of the world's starting Gloam has been cleansed. */
  readonly cleansedMin?: number;
  /** It is night (or day, if false). */
  readonly night?: boolean;
  /** Their town is dark at night and they are afraid (TownSystem). */
  readonly scared?: boolean;
  /** Their town's festival is on. */
  readonly festival?: boolean;
  /** A Dimming night is on (M12). */
  readonly dimming?: boolean;
}

export interface DialogueEntry {
  readonly npc: string;
  readonly when?: DialogueCondition;
  readonly lines: readonly string[];
}

export const DIALOGUE: readonly DialogueEntry[] = [
  // The Old Dryad: by how much of the forest's Gloam is gone.
  {
    npc: 'dryad',
    lines: [
      'Lamplighter. You came. The Heartlight is fading, and the Gloam climbs my roots.',
      'Light is life here. Where you carry it, the Gloam must give way.',
      'Build homes, and light them. My folk are scattered, but they will come to a warm window.',
      'Canopyhold still trades in the branches of the great tree. Follow the light to it.',
    ],
  },
  {
    npc: 'dryad',
    when: { cleansedMin: 0.05 },
    lines: [
      'I felt that. A little of the dark has lifted. Keep going.',
      'Beacons hold the dark back for good. Your folk will know how to make them.',
      'Deep in my roots lies the Citadel the old folk carved. Its beacons sleep. Wake them.',
    ],
  },
  {
    npc: 'dryad',
    when: { cleansedMin: 0.25 },
    lines: [
      'The roots breathe easier. A quarter of the Gloam is gone, burned away by your light.',
      'Deeper, Lamplighter. The heart of the dark waits at the bottom of the world.',
    ],
  },
  {
    npc: 'dryad',
    when: { cleansedMin: 0.6 },
    lines: ['I can feel the Heartlight stirring again. You have done more than I dared hope.'],
  },
  // M12: the way down, boss by boss, and the Dimming nights.
  {
    npc: 'dryad',
    when: { flags: ['dimming:1'] },
    lines: [
      'You saw the dawn after a Dimming night. Each one, the sun dims a little further.',
      'The Dimming will not stop while the Gloam has a heart. Go down, Lamplighter.',
    ],
  },
  {
    npc: 'dryad',
    when: { dimming: true },
    lines: [
      'The sky is dimming. Stay in the light; the shades rise in waves on nights like this.',
      'Lit homes hold. Keep your lantern burning until the dawn.',
    ],
  },
  {
    npc: 'dryad',
    when: { flags: ['boss:moth_matriarch'] },
    lines: [
      'The Matriarch is gone and her moths are only moths again. Canopyhold will celebrate.',
      'The ward over the Moonstone Hollows has broken. Cold light waits down there, and a Warden.',
    ],
  },
  {
    npc: 'dryad',
    when: { flags: ['boss:mire_sovereign'] },
    lines: [
      'The Mire breathes. Hulda the ferrywoman will come up to your village, if you have a home for her.',
    ],
  },
  {
    npc: 'dryad',
    when: { flags: ['boss:hollow_warden'] },
    lines: [
      'The deep ward has fallen. Below it lies the Gloam Heart, wrapped round my taproot.',
      'Light its root-lamps, one by one. It cannot bear to be seen.',
    ],
  },
  {
    npc: 'dryad',
    when: { flags: ['boss:gloam_heart'] },
    lines: [
      'The Heartlight burns. I feel it in every leaf. Thank you, Lamplighter.',
      'The Gloam cannot grow now. What is left of it, your light will burn away in time.',
    ],
  },
  {
    npc: 'dryad',
    when: { flags: ['road:canopy_road'] },
    lines: [
      'The road to Canopyhold glows like a string of dew. I hear wheels on it again.',
      'Light one road and the folk will walk it. Light them all, and the forest remembers itself.',
    ],
  },

  // Your village (M10).
  {
    npc: 'tinker',
    lines: [
      'A lit room and a door that shuts. That is all a tinker asks.',
      'Bring me ore and I will make it sing. Or glimmer, and I will sell you what I have made.',
      'The roots groan at night. Something down there is hungry for the dark.',
    ],
  },
  {
    npc: 'herbalist',
    lines: [
      'Lumen blooms only open in the light. Pick them then, or not at all.',
      'Glowmoss creeps where it is dark and damp. A good sign, mostly.',
      'Fairy rings at night? Stand inside one. Your feet will thank you.',
    ],
  },
  {
    npc: 'glassblower',
    lines: [
      'Silt, fire and patience: that is glass. Jars, lenses, lamps.',
      'Catch fireflies in a jar and they will light your hall for good.',
      'Azure glass shows what hides. Mind where you step in the deep caves.',
    ],
  },
  {
    npc: 'archivist',
    lines: [
      'The beacons were the old way of keeping the dark at bay. Build them again.',
      'Four homes, four lamps. A village, at last. The Heartlight may yet remember us.',
      'The runes wake when you pass. They remember the Lamplighters.',
    ],
  },
  {
    npc: 'archivist',
    when: { flags: ['district:gate_ward'] },
    lines: [
      'The Citadel! You have lit its gate? Then the old records were true.',
      'Three districts, three beacons. The High Hall held our histories. Light it, if you can.',
    ],
  },

  // Canopyhold.
  {
    npc: 'innkeeper',
    lines: [
      'Welcome to the Lantern & Leaf. Warm stew, dry beds, and nobody asks about the dark.',
      'Travellers stopped coming once the roads went dark. A lit road is a full inn.',
    ],
  },
  {
    npc: 'innkeeper',
    when: { night: true },
    lines: ['Late, isn’t it? Sit by the fire a while. The lamps outside will hold. I hope.'],
  },
  {
    npc: 'merchant',
    lines: [
      'Tamsin’s Trading Post. If it can be carried, I buy it. If it can be sold, I have it.',
      'Prices are better when the streets are bright. Folk spend more when they are not afraid.',
      'A caravan on a lit road brings goods from everywhere. Then my prices really drop.',
    ],
  },
  {
    npc: 'lampwright',
    lines: [
      'Every lamp in Canopyhold burns Lumen. Bring me petals or crystals and I keep them lit.',
      'Lamps run low at night. Right-click one with a Lumen petal or crystal and it burns again.',
      'A dark street invites shades. A bright one sends them home.',
    ],
  },
  {
    npc: 'caravaneer',
    lines: [
      'My wagons have stood in this yard since the roads went dark.',
      'Light a road for me, Lamplighter, and the caravans will roll again.',
    ],
  },
  {
    npc: 'caravaneer',
    when: { flags: ['road:canopy_road'] },
    lines: [
      'The wheels are turning again! My stag knows the way by the lamps now.',
      'Each lit road brings goods, and goods bring better prices. Everyone wins but the Gloam.',
    ],
  },
  {
    npc: 'courier',
    lines: [
      'I keep bees. Kept. The hives are in the meadow, and the meadow is dark.',
      'I would love to see your village. But alone, at night? Not on your life.',
    ],
  },
  {
    npc: 'child',
    lines: [
      'When I grow up I’m going to be a Lamplighter too. Like you!',
      'The wisps like me. They show me where things are hidden.',
    ],
  },
  {
    npc: 'ropewright',
    lines: [
      'Every bridge in Canopyhold is my knotting. Mind the gaps, they are deliberate. Mostly.',
      'The lift basket? Right-click it and hold on. It goes up, and from the top, back down.',
    ],
  },
  {
    npc: 'weaver',
    lines: [
      'I weave lantern-silk. It holds the light like a held breath.',
      'From the lookout you can see the old roads, all of them dark.',
    ],
  },
  // When their streets are dark at night, everyone in a town is afraid.
  ...[
    'innkeeper',
    'merchant',
    'lampwright',
    'caravaneer',
    'courier',
    'child',
    'ropewright',
    'weaver',
  ].map((npc): DialogueEntry => ({
    npc,
    when: { scared: true },
    lines: [
      'The lamps are out… I can hear them in the dark. Please, light the street.',
      'Not now. Not until the lamps are lit again.',
    ],
  })),
  // The festival.
  ...[
    'innkeeper',
    'merchant',
    'lampwright',
    'caravaneer',
    'courier',
    'child',
    'ropewright',
    'weaver',
  ].map((npc): DialogueEntry => ({
    npc,
    when: { festival: true },
    lines: [
      'A festival! Every light we have, all at once. Look up!',
      'Tonight we send our lanterns to the sky, so the Heartlight sees we are still here.',
    ],
  })),
  // M12: a Dimming night in a bright town (a vigil at the plaza) and in a dark one.
  ...[
    'innkeeper',
    'merchant',
    'lampwright',
    'caravaneer',
    'courier',
    'child',
    'ropewright',
    'weaver',
  ].flatMap((npc): DialogueEntry[] => [
    {
      npc,
      when: { dimming: true, scared: false },
      lines: [
        'A Dimming night. We keep vigil together, lamps high, until the dawn.',
        'Our streets are bright enough to hold. Stay close to the light, Lamplighter.',
      ],
    },
    {
      npc,
      when: { dimming: true, scared: true },
      lines: [
        'The sun has gone out of the sky and the lamps are low… they will come for the dark streets.',
        'Light the lamps, please! On a Dimming night half-lit is no better than dark.',
      ],
    },
  ]),

  // M12: Hulda, up from the Mire once its Sovereign has fallen.
  {
    npc: 'ferrywoman',
    lines: [
      'Forty years I poled folk across that black water. Now the Mire is still, and so am I.',
      'Moth lures, crystals, buckets of good water. A ferrywoman always has something to trade.',
      'You pulled the sluices on the Sovereign? Clever. It always hated the light.',
    ],
  },
  {
    npc: 'ferrywoman',
    when: { dimming: true },
    lines: ['A Dimming night. On the Mire we tied our lamps to the boats and sang till dawn.'],
  },

  // The Rootdeep Citadel (only there once their district is reclaimed).
  {
    npc: 'warden',
    lines: [
      'You lit the Gate Ward. I stood at this gate when the dark came, and I never left it.',
      'The Lantern Market lies past the pillars. Its beacon wants five crystals of Lumen.',
    ],
  },
  {
    npc: 'smith',
    lines: [
      'Root-iron and carved stone. The Citadel was built to last. So was I.',
      'I forge for glimmer, as my fathers did. The Gloam took the coin, not the craft.',
    ],
  },
  {
    npc: 'lampkeeper',
    lines: [
      'Every lamp in the Market, I lit by hand, every night for forty years.',
      'The High Hall’s beacon needs moonstone as well as Lumen. It was always proud.',
    ],
  },
  {
    npc: 'scholar',
    lines: [
      'The Hall remembers. Its runes kept our histories while we were gone.',
      'At the bottom of the world the Gloam has a heart. The records name it. I would rather not.',
    ],
  },
];
