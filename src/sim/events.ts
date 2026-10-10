/** Which tile layer an event refers to. */
export type TileLayer = 'fg' | 'bg';

/**
 * Events the simulation emits. Rendering, audio and UI subscribe; the simulation never calls them.
 * Payload objects may be reused by the emitter: listeners must copy what they keep.
 */
export interface SimEvents {
  /** Fired once after every fixed simulation step. */
  stepped: { readonly step: number };
  /** Any tile write (mining, placing, worldgen edits after load, ...). */
  tileChanged: {
    readonly x: number;
    readonly y: number;
    readonly id: number;
    readonly previous: number;
    readonly layer: TileLayer;
  };
  /** Mining progress changed. `stage` 0 = undamaged/cleared, 1..CRACK_STAGES = visible cracks. */
  tileDamaged: {
    readonly x: number;
    readonly y: number;
    readonly layer: TileLayer;
    readonly stage: number;
  };
  /** A tile was mined out. `id` is the tile that was removed. */
  tileBroken: {
    readonly x: number;
    readonly y: number;
    readonly id: number;
    readonly layer: TileLayer;
  };
  /** The player placed a tile. */
  tilePlaced: {
    readonly x: number;
    readonly y: number;
    readonly id: number;
    readonly layer: TileLayer;
  };
  /**
   * The player tried to mine something they can't: `tier` — the tile needs a pickaxe of at least
   * `tier`; `support` — it holds up a station standing on it; `sealed` — a ward that holds until
   * the story flag `flag` is set (M12). Once per attempt.
   */
  miningBlocked: {
    readonly x: number;
    readonly y: number;
    readonly layer: TileLayer;
    readonly tier: number;
    readonly reason: 'tier' | 'support' | 'sealed';
    readonly flag: string;
  };
  /** Items were crafted (`count` = total output items). */
  crafted: { readonly itemId: number; readonly count: number };
  /** An item drop was collected; x/y is where it was picked up (pixels). */
  itemPickedUp: {
    readonly itemId: number;
    readonly count: number;
    readonly x: number;
    readonly y: number;
  };
  /** Lightning struck (storms, src/data/weather.ts): flash now, thunder after a delay. */
  lightning: { readonly flash: number };
  /** The light grid was rewritten in this rectangle (tiles, absolute). */
  lightUpdated: {
    readonly x0: number;
    readonly y0: number;
    readonly width: number;
    readonly height: number;
  };
  /** Gloam levels (world.gloam) changed somewhere in this rectangle (tiles, absolute). */
  gloamUpdated: {
    readonly x0: number;
    readonly y0: number;
    readonly width: number;
    readonly height: number;
  };
  /** The Azure lens revealed a veiled tile (it was replaced by its true tile). */
  tileRevealed: { readonly x: number; readonly y: number; readonly id: number };
  /** A flare was thrown (x, y = where it starts, pixels). */
  flareThrown: { readonly x: number; readonly y: number };
  /** A creature appeared (feet x, y in pixels). */
  enemySpawned: {
    readonly id: number;
    readonly type: number;
    readonly x: number;
    readonly y: number;
  };
  /** The player swung or fired a weapon along (dirX, dirY); a swing lasts `duration` seconds. */
  attackStarted: {
    readonly kind: 'melee' | 'ranged' | 'magic';
    readonly dirX: number;
    readonly dirY: number;
    readonly duration: number;
  };
  /** A creature took damage (x, y = top centre, pixels). `light`: burned by light. */
  enemyHit: {
    readonly id: number;
    readonly x: number;
    readonly y: number;
    readonly amount: number;
    readonly source: 'melee' | 'arrow' | 'beam' | 'light' | 'hazard';
  };
  /** A creature died (centre, pixels); drops are already spawned. */
  enemyDied: { readonly id: number; readonly type: number; readonly x: number; readonly y: number };
  /** The player took damage (x, y = top centre, pixels). */
  playerHurt: { readonly amount: number; readonly x: number; readonly y: number };
  playerDied: Record<string, never>;
  playerRespawned: Record<string, never>;
  /** Liquid amounts changed somewhere in this rectangle (tiles). */
  liquidChanged: {
    readonly x0: number;
    readonly y0: number;
    readonly width: number;
    readonly height: number;
  };
  /** Water met lava: the cell cooled into obsidian (steam). */
  liquidReaction: { readonly x: number; readonly y: number };
  /** Something entered water or lava (x, y = surface point, pixels). */
  splash: { readonly x: number; readonly y: number; readonly lava: boolean };
  /** A cell caught fire / burned down to what it leaves (tiles). */
  fireStarted: { readonly x: number; readonly y: number };
  tileBurned: { readonly x: number; readonly y: number; readonly layer: TileLayer };
  /** A falling block of silt or gravel landed and became a tile. */
  blockLanded: { readonly x: number; readonly y: number; readonly id: number };
  /**
   * Someone spoke (right-clicked): show their line. `offer`: a quest they offer (key, '' = none);
   * `shop`: they trade.
   */
  talk: {
    readonly npcId: number;
    readonly key: string;
    readonly name: string;
    readonly role: string;
    readonly text: string;
    readonly offer: string;
    readonly offerTitle: string;
    readonly shop: boolean;
  };
  /** A villager moved into a home / lost their home (it stopped being valid). */
  npcArrived: { readonly key: string; readonly name: string };
  npcHomeless: { readonly key: string; readonly name: string };
  /** A beacon was right-clicked: offer travel to the beacons (tile positions). */
  beaconMenu: {
    readonly x: number;
    readonly y: number;
    readonly beacons: readonly { readonly x: number; readonly y: number }[];
  };
  /** The player fast-travelled to a beacon. */
  travelled: { readonly x: number; readonly y: number };
  /** A critter fled or took flight (x, y pixels): bat flaps, deer bounds. */
  critterStartled: {
    readonly id: number;
    readonly type: number;
    readonly x: number;
    readonly y: number;
  };
  /** A critter was caught in a jar. */
  critterCaught: { readonly type: number; readonly x: number; readonly y: number };
  /** The fairy-ring buff began. */
  faeBuff: { readonly seconds: number };
  /** The player bounced off a glowcap (x, y = feet, pixels). */
  bounced: { readonly x: number; readonly y: number };
  /** A wisp appeared to lead the way / reached its secret (pixels). */
  wispAppeared: { readonly x: number; readonly y: number };
  wispArrived: { readonly x: number; readonly y: number };
  /** Inventory contents or the selected slot changed. */
  inventoryChanged: Record<string, never>;
  /** M11 — a story flag was set for the first time. */
  flagSet: { readonly flag: string };
  /** A street lamp was refuelled (tiles). */
  lampRefuelled: { readonly x: number; readonly y: number };
  /** Right-clicked a lamp or dormant beacon without what it needs (`need`: what's missing). */
  useBlocked: { readonly need: string };
  /** A Citadel district's beacon was relit / the district was reclaimed (its folk return). */
  beaconRelit: {
    readonly town: string;
    readonly district: string;
    readonly name: string;
    readonly x: number;
    readonly y: number;
  };
  districtReclaimed: {
    readonly town: string;
    readonly district: string;
    readonly name: string;
    readonly x: number;
    readonly y: number;
  };
  /** A town's festival began / ended. */
  festivalStarted: { readonly town: string; readonly name: string };
  festivalEnded: { readonly town: string; readonly name: string };
  /** The player rode a lift basket to tile (x, y). */
  liftRode: { readonly x: number; readonly y: number };
  questStarted: { readonly key: string; readonly title: string };
  questCompleted: { readonly key: string; readonly title: string };
  /** Something happened on a quest worth a notice (found the lost thing, the escort joined). */
  questProgress: { readonly key: string; readonly text: string };
  /** The escort was too long in the dark and ran home (`text`: what they cried). */
  escortFled: { readonly key: string; readonly text: string };
  /** A road's lit points changed (after a light was placed or removed) / it became fully lit. */
  roadProgress: {
    readonly road: string;
    readonly name: string;
    readonly lit: number;
    readonly total: number;
  };
  roadLit: { readonly road: string; readonly name: string };
  /** A caravan reached one end of its road (`place`: a town key or 'village'). */
  caravanArrived: { readonly road: string; readonly place: string };
  /** The player bought or sold something. */
  traded: { readonly npc: string; readonly glimmer: number };
  /** M12 — tonight will be a Dimming night (late afternoon) / it began / its dawn came. */
  dimmingWarning: Record<string, never>;
  dimmingStarted: Record<string, never>;
  dimmingEnded: { readonly survived: number };
  /** A wave of shades rose around the player during a Dimming night. */
  shadeWave: { readonly count: number };
  /**
   * M12 boss fights. `bossIntro`: the player stepped into an arena and its boss appears (x, y =
   * its centre, pixels; the camera zooms in and the title card shows). `bossPhase`: its health
   * fell to the next phase (from 0). `bossDefeated`: it fell (`reward`: what changed).
   * `bossReset`: the fight was lost or left; the arena is as it was.
   */
  bossIntro: {
    readonly key: string;
    readonly name: string;
    readonly epithet: string;
    readonly x: number;
    readonly y: number;
  };
  bossPhase: { readonly key: string; readonly phase: number };
  bossDefeated: {
    readonly key: string;
    readonly name: string;
    readonly reward: string;
    readonly x: number;
    readonly y: number;
  };
  bossReset: { readonly key: string };
  /**
   * Something happened in a fight worth a sound or a shake (pixels): the Matriarch stunned by a
   * lure, a flood rising or a sluice draining, a slam, a prism turned, a root-lamp lit or choked,
   * a volley loosed.
   */
  bossAction: {
    readonly kind:
      | 'stunned'
      | 'flood'
      | 'drain'
      | 'slam'
      | 'prism'
      | 'nodeLit'
      | 'nodeChoked'
      | 'volley'
      | 'cracked';
    readonly x: number;
    readonly y: number;
  };
}

type Listener<T> = (payload: T) => void;

/**
 * Small typed event bus. Listeners run in subscription order.
 * Listener lists are copy-on-write: subscribing allocates, emitting never does, and a listener
 * that (un)subscribes during an emit doesn't affect who receives the current event.
 */
export class EventBus<Events extends object> {
  private readonly listeners: { [K in keyof Events]?: readonly Listener<Events[K]>[] } = {};

  /** Subscribes and returns a function that unsubscribes. */
  on<K extends keyof Events>(type: K, listener: Listener<Events[K]>): () => void {
    this.listeners[type] = [...(this.listeners[type] ?? []), listener];
    return () => this.off(type, listener);
  }

  off<K extends keyof Events>(type: K, listener: Listener<Events[K]>): void {
    const list = this.listeners[type];
    if (!list?.includes(listener)) return;
    this.listeners[type] = list.filter((l) => l !== listener);
  }

  emit<K extends keyof Events>(type: K, payload: Events[K]): void {
    const list = this.listeners[type];
    if (!list) return;
    for (let i = 0; i < list.length; i++) list[i]?.(payload);
  }

  clear(): void {
    for (const key of Object.keys(this.listeners) as (keyof Events)[]) delete this.listeners[key];
  }
}
