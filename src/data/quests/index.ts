/**
 * Quests (plan 1.7: "four types only: deliver an item, escort someone through the dark, light a
 * route, find something or someone (wisps help)"). A quest is offered by its giver when you talk to
 * them; its texts are what the giver says at each stage.
 */
import type { ItemCount } from '../items';

export type QuestGoal =
  /** Bring `count` of an item to the giver (handed over when you next talk to them). */
  | { readonly kind: 'deliver'; readonly item: string; readonly count: number }
  /**
   * Lead `npc` from their town to your village (the spawn glade). They follow you, but darkness
   * frightens them: too long in the dark and they run home (the quest fails; ask again).
   */
  | { readonly kind: 'escort'; readonly npc: string }
  /** Light a road (src/data/roads.ts) from end to end, then tell the giver. */
  | { readonly kind: 'lightRoute'; readonly road: string }
  /**
   * Something lost in a cave between `minTiles` and `maxTiles` from the giver: find it (a wisp
   * will lead you) and bring it back.
   */
  | {
      readonly kind: 'find';
      readonly item: string;
      readonly minTiles: number;
      readonly maxTiles: number;
    };

export interface QuestDef {
  readonly key: string;
  readonly title: string;
  /** Folk key of who offers it and takes it back. */
  readonly giver: string;
  readonly goal: QuestGoal;
  /** Offered only once every flag here is set. */
  readonly requires?: readonly string[];
  readonly reward: {
    readonly items?: readonly ItemCount[];
    /** Story flags set on completion (unlocking recipes, NPCs, dialogue). */
    readonly flags?: readonly string[];
  };
  /** One line for the quest journal. */
  readonly summary: string;
  readonly text: {
    readonly offer: string;
    readonly active: string;
    readonly done: string;
    /** Escorts: what they say when they give up and run home. */
    readonly failed?: string;
  };
}

export const QUESTS: readonly QuestDef[] = [
  {
    key: 'glowcap_stew',
    title: 'Glowcap Stew',
    giver: 'innkeeper',
    goal: { kind: 'deliver', item: 'glowcap_flesh', count: 12 },
    reward: {
      items: [
        { item: 'glimmer', count: 30 },
        { item: 'hanging_lantern', count: 4 },
      ],
      flags: ['recipe:hanging_lantern'],
    },
    summary: 'Bring Rowan 12 glowcap flesh from the Glowcap Grottos for the inn’s stew.',
    text: {
      offer:
        'My stew needs glowcaps, and my cellar is empty. Twelve pieces of glowcap flesh, from the grottos below. I’ll make it worth your while.',
      active: 'Twelve glowcap flesh, from the grottos. The pot is waiting.',
      done: 'Ah, they glow even in the pot! Here, take these lanterns, and the way to make more.',
    },
  },
  {
    key: 'canopy_road',
    title: 'Light the Canopy Road',
    giver: 'lampwright',
    goal: { kind: 'lightRoute', road: 'canopy_road' },
    reward: {
      items: [
        { item: 'glimmer', count: 40 },
        { item: 'firefly_jar', count: 4 },
      ],
    },
    summary: 'Light the road from your village to Canopyhold, end to end, then tell Wren.',
    text: {
      offer:
        'The road from the Old Dryad’s glade to our gate has gone dark. Line it with light, torches or jars or lamps, every stretch of it, and the caravans will roll again.',
      active:
        'Every stretch of the road needs a light near it. Walk it with your lantern out and you will see where it is dark.',
      done: 'I can see it from the lookout: a whole road of little lights! Hesper is already harnessing the stag.',
    },
  },
  {
    key: 'juniper_escort',
    title: 'Through the Dark',
    giver: 'caravaneer',
    goal: { kind: 'escort', npc: 'courier' },
    reward: {
      items: [{ item: 'glimmer', count: 25 }],
      flags: ['juniper_moved'],
    },
    summary:
      'Lead Juniper from Canopyhold to the Old Dryad’s glade. Keep her in the light, or she runs home.',
    text: {
      offer:
        'Juniper wants to start her hives again, out by your village. She will not walk the dark alone. Take her there, and keep your lantern on her.',
      active: 'Juniper is waiting for you. Keep her in the light, all the way to the glade.',
      done: 'She made it? Then your village has a beekeeper. Give her a lit home and she’ll stay.',
      failed: 'Too dark… too dark! I’m going home!',
    },
  },
  {
    key: 'lost_locket',
    title: 'Pip’s Locket',
    giver: 'child',
    goal: { kind: 'find', item: 'lost_locket', minTiles: 30, maxTiles: 90 },
    reward: {
      items: [
        { item: 'glimmer', count: 20 },
        { item: 'firefly_jar', count: 3 },
      ],
    },
    summary: 'Find the locket Pip lost in a cave near Canopyhold. Wisps may lead you to it.',
    text: {
      offer:
        'I dropped my locket in a cave. It was Mum’s. It’s dark down there and the wisps keep trying to show me, but I’m scared. Could you find it?',
      active: 'Follow the wisps! They know where it is. They always know.',
      done: 'My locket! You found it! Here, you can have my firefly jars. I’ll catch more.',
    },
  },
];

export function questByKey(key: string): QuestDef | undefined {
  return QUESTS.find((q) => q.key === key);
}
