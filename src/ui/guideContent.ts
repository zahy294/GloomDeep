/**
 * The in-game guide (H): what to do and how. Plain data, one entry per page; `lines` are short
 * paragraphs, `keys` are [key, what it does] rows.
 */
export interface GuidePage {
  readonly key: string;
  readonly title: string;
  readonly lines: readonly string[];
  readonly keys?: readonly (readonly [string, string])[];
}

export const GUIDE: readonly GuidePage[] = [
  {
    key: 'start',
    title: 'Your goal',
    lines: [
      'The Heartlight of the World Tree is fading, and a living darkness, the Gloam, is climbing its roots. You are the last Lamplighter.',
      'Gather and build, light the forest, and go down through the depths. Beat the four bosses one after another and rekindle the Heartlight at the bottom of the world.',
      'Your first day: chop a tree (click a trunk), make planks, build a workbench, and put up a small lit shelter before night falls.',
      'Talk to the Old Dryad by the great tree at the spawn (right-click her). The Journal (J) always shows what to do next and where.',
    ],
  },
  {
    key: 'controls',
    title: 'Controls',
    lines: ['Hover over an item in the inventory to see what it does.'],
    keys: [
      ['A / D', 'Walk left and right'],
      ['W / Space', 'Jump (hold for higher)'],
      ['S', 'Drop through a platform; swim down'],
      ['Left click', 'Mine, chop, or attack with the selected weapon'],
      [
        'Right click',
        'Place the selected block or light; talk, open doors, refuel lamps, pull levers, turn prisms',
      ],
      ['Shift + click', 'Mine or place back walls'],
      ['1–0 / wheel', 'Choose a hotbar slot'],
      ['F', 'Lantern on or off'],
      ['Q', 'Switch lantern lens'],
      ['E', 'Inventory and crafting'],
      ['J', 'Journal: quests and the way down'],
      ['H', 'This guide'],
      ['Esc', 'Close a panel, or pause'],
    ],
  },
  {
    key: 'light',
    title: 'Light and the Gloam',
    lines: [
      'Light is life here. Your lantern burns Lumen: refill it with Lumen crystals or petals in your bag. It refills on its own while you carry them.',
      'The Gloam is darkness that grows. It creeps across any tile left dark and breeds shades there. Light pushes it back: a placed torch burns a ring of Gloam away at once.',
      'Shades only live in the dark. They burn in bright light, so stand near your torches when they come.',
      'Lenses (crafted at an anvil) change your lantern. Amber heals you slowly. Azure reveals hidden ore and passages. Crimson burns shades and the Gloam. Verdant makes plants grow.',
      'Throw flares (right-click) to light a cave ahead of you.',
    ],
  },
  {
    key: 'crafting',
    title: 'Gathering and crafting',
    lines: [
      'Open the inventory (E) to craft. Recipes need materials, and some need a station within reach: a workbench, a furnace or an anvil.',
      'A good path: wood → elderwood pickaxe and workbench → stone and copper → furnace and copper bars → anvil → iron tools and weapons. Better pickaxes mine harder rock.',
      'Deeper layers have better ore: Lumen crystals and moonstone in the caves, moonsilver in the Moonstone Hollows, emberite in the Ember Roots.',
      'Water and lava flow. Water poured on lava makes obsidian. Silt and gravel fall when nothing holds them up. Fire spreads through wood and grass.',
    ],
  },
  {
    key: 'village',
    title: 'Homes and your village',
    lines: [
      'Folk move into homes you build. A home is a closed room with back walls, a door, a light inside and floor space to stand on.',
      'Each new home lets the next villager arrive: a tinker, a herbalist, a glassblower and an archivist. They trade, and some will teach you things.',
      'Beacons (crafted at an anvil) keep a wide safe circle with no creatures and no Gloam. Right-click one to travel to your other beacons.',
    ],
  },
  {
    key: 'towns',
    title: 'Towns, quests and trade',
    lines: [
      'Canopyhold trades in the branches of a great tree, a walk from the spawn. Its folk keep daily routines, sell goods for glimmer, and give quests (look for a ! over their heads).',
      'A town is only as safe as its street lamps. Refuel dark lamps with a Lumen petal or crystal (right-click), or its folk hide at night and prices rise.',
      'Light the road between the village and Canopyhold with torches and caravans will travel it, bringing prices down.',
      'The Rootdeep Citadel lies lost to the Gloam. Relight its district beacons with Lumen crystals and moonstone to bring its people home.',
    ],
  },
  {
    key: 'dimming',
    title: 'Dimming nights',
    lines: [
      'Every few days a Dimming night comes. The HUD counts down to it, and you are warned in the afternoon.',
      'The sun dims (deeper each time), auroras fill the sky, the Gloam spreads faster, and waves of shades rise from the dark.',
      'Stay in the light, ideally in a lit home or a town. Towns that are well lit keep a vigil; dark ones hide. Survive to the dawn and it leaves Lumen crystals at your feet.',
    ],
  },
  {
    key: 'bosses',
    title: 'Bosses and the way down',
    lines: [
      'Bands of warded stone seal the deep layers. No pickaxe breaks a ward until its boss has fallen. The Journal shows each boss whose way is open, how to fight it, and which way to go.',
      'The Moth Matriarch (Glowcap Grottos) hunts light. Put your lantern out to hide, and set moth lures (craft them at a workbench); diving into one stuns her.',
      'The Mire Sovereign (Weeping Mire) hides in dark water. Pull the sluice levers to drain the flood and keep the braziers burning; it only feels your blows when it is lit.',
      'The Hollow Warden (Moonstone Hollows) shrugs off blades. Shine your lantern into the prisms (right-click turns them) and bounce the beam back onto it to crack its shell.',
      'The Gloam Heart waits straight down beneath the spawn. Relight its root-lamps with Lumen crystals and kill the tendrils that crawl to choke them.',
      'Each boss you beat opens the way deeper, and Canopyhold throws a festival. If you fall or leave mid-fight, the boss waits for you.',
    ],
  },
];
