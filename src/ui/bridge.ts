import { EventBus } from '../sim/events';
import type { SlotButton } from '../sim/inventory/Inventory';
import type { WorldSizeKey } from '../sim/world/worldData';

export type { WorldSizeKey };

/** Which top-level screen is showing. Scenes set this; the overlay renders to match. */
export type Screen = 'boot' | 'title' | 'worlds' | 'generating' | 'game' | 'art-test';

/** One saved world as listed on the world-select screen. */
export interface WorldListEntry {
  id: string;
  name: string;
  seed: number;
  sizeKey: WorldSizeKey;
  /** Epoch ms. */
  lastPlayed: number;
  /** Seconds played. */
  playTime: number;
}

/** F3 overlay contents (plan 7). Fields for later systems read "—" until those systems exist. */
export interface DebugInfo {
  fps: number;
  drawCalls: number | null;
  /** Average / worst CPU time per frame spent in simulation + chunk rendering, ms. */
  frameCpuAvgMs: number;
  frameCpuMaxMs: number;
  chunksLoaded: number;
  lateChunkLoads: number;
  entities: number;
  playerTileX: number;
  playerTileY: number;
  chunkX: number;
  chunkY: number;
  light: string;
  biome: string;
  gloam: string;
}

/** Heads-up display values, refreshed a few times per second. */
export interface HudView {
  health: number;
  healthMax: number;
  lumen: number;
  lumenMax: number;
  lanternOn: boolean;
  lensName: string;
  /** The lenses the player owns, for the Q switcher (in cycle order). */
  lenses: readonly { name: string; color: string; active: boolean }[];
  /** Clock text, e.g. "18:05". */
  clock: string;
  /** Whole seconds of the fairy-ring buff left (0 = none). */
  fae: number;
  /** Glimmer carried (M11 currency). */
  glimmer: number;
  /** The town the player is in, or null. */
  town: TownView | null;
  /** Someone following the player through the dark (escort quest), or null. */
  escort: EscortView | null;
}

/** The town around the player (M11): its name and how well lit it is. */
export interface TownView {
  name: string;
  /** 0..1: lamps burning (the Citadel: districts reclaimed). */
  light: number;
  /** A short status, e.g. "Lamps burning low" or "2 of 3 districts reclaimed". */
  status: string;
}

/** An escort's courage: 1 = calm, 0 = about to run home. */
export interface EscortView {
  name: string;
  courage: number;
}

/** Someone talking (M10); `id` changes per line so the text fades in anew. */
export interface DialogueView {
  name: string;
  role: string;
  text: string;
  id: number;
  /** Who is talking (for opening their shop). */
  npcId: number;
  /** A quest they offer right now (M11), or null. */
  offer: { key: string; title: string } | null;
  /** They trade: show a Trade button. */
  shop: boolean;
}

/** A trader's stall (M11): what they sell now, what they'd pay for what you carry. */
export interface ShopView {
  npcId: number;
  name: string;
  role: string;
  glimmer: number;
  /** e.g. "Fair prices", "Dark streets: prices up 30%", "Lit roads: prices down 15%". */
  terms: string;
  offers: readonly {
    /** Index into the trader's offers (the `buy` command takes it). */
    index: number;
    itemId: number;
    count: number;
    price: number;
    affordable: boolean;
    /** A festival stall offer. */
    festival: boolean;
  }[];
  /** Stacks they would buy from you: the whole stack's price. */
  sells: readonly { itemId: number; have: number; price: number }[];
}

/** The quest journal (M11). */
export interface JournalView {
  quests: readonly { key: string; title: string; summary: string; done: boolean }[];
}

/** A big centred title that fades (entering a town, a district reclaimed, a festival). */
export interface BannerView {
  title: string;
  sub: string;
  id: number;
}

/** A beacon's travel list (M10): the other beacons, nearest first (tile positions). */
export interface TravelView {
  options: readonly { x: number; y: number; label: string }[];
}

export interface StackView {
  itemId: number;
  count: number;
}

/** Read-only snapshot of the player's inventory for the UI (rebuilt when it changes). */
export interface InventoryView {
  slots: readonly (StackView | null)[];
  selected: number;
  hotbarSize: number;
  /** The stack held by the mouse (drag and drop), or null. */
  cursor: StackView | null;
  /** Crafting station keys within reach of the player. */
  stations: readonly string[];
  /** Recipes not known yet (taught by folk, M11): hidden from the crafting list. */
  lockedRecipes: readonly string[];
}

/** Where an item icon sits in one of the pack's images, in game pixels. */
export interface IconRect {
  url: string;
  x: number;
  y: number;
  /** Size of the whole image, for CSS `background-size`. */
  sheetWidth: number;
  sheetHeight: number;
}

/** A short message over the hotbar (e.g. "Needs a Copper Pickaxe"); `id` changes per message. */
export interface Notice {
  text: string;
  id: number;
}

export interface UiState {
  screen: Screen;
  showUi: boolean;
  /** Non-null while the F3 overlay is open. */
  debug: DebugInfo | null;
  /** Null outside the game scene. */
  inventory: InventoryView | null;
  /** The full inventory panel (E) is open. */
  inventoryOpen: boolean;
  /** Null outside the game scene. */
  hud: HudView | null;
  /** Icon per item id (null = no icon); set once the game scene has loaded the pack. */
  icons: readonly (IconRect | null)[];
  notice: Notice | null;
  /** Null unless someone is talking. */
  dialogue: DialogueView | null;
  /** Null unless a beacon's travel list is open. */
  travel: TravelView | null;
  /** Null unless a trader's stall is open. */
  shop: ShopView | null;
  /** Null unless the quest journal is open. */
  journal: JournalView | null;
  banner: BannerView | null;
  /** Seconds until the player respawns, or null while alive. */
  respawnIn: number | null;
  /** Pack folder the game loaded (icons are cut from its tile atlas). */
  packDir: string;
  worlds: WorldListEntry[];
  /** Non-null while a world is being generated; progress is 0..1. */
  generation: { stage: string; progress: number } | null;
  /** The pause menu is open (game screen). */
  paused: boolean;
  /** A message to show on the world-select screen, or null. */
  error: string | null;
}

/** Commands the UI sends. The UI never changes game state directly (CLAUDE.md rule 3). */
export interface UiCommands {
  selectSlot: { slot: number };
  /** Inventory screen click (drag and drop is a press on one slot and a release on another). */
  slotClick: { slot: number; button: SlotButton; quick: boolean };
  sortInventory: Record<string, never>;
  /** Throw the stack on the cursor into the world (released outside the panels). */
  dropCursor: Record<string, never>;
  craft: { recipe: string; times: number };
  /** The mouse is over an interactive panel, so clicks must not mine/place in the world. */
  pointerOverUi: { over: boolean };
  openWorlds: Record<string, never>;
  createWorld: { name: string; seed: number | null; size: WorldSizeKey };
  playWorld: { id: string };
  deleteWorld: { id: string };
  backToTitle: Record<string, never>;
  resume: Record<string, never>;
  /** Fast travel to the beacon at tile (x, y), from the travel list. */
  travelTo: { x: number; y: number };
  /** Close the travel list (or the dialogue, the shop, the journal). */
  closePanel: Record<string, never>;
  /** Accept the quest offered in the dialogue. */
  acceptQuest: { quest: string };
  /** Open the trader's stall from the dialogue. */
  openShop: { npcId: number };
  buy: { npcId: number; offer: number };
  /** Sell `count` of an item (the stall offers whole stacks). */
  sell: { npcId: number; item: number; count: number };
  toggleJournal: Record<string, never>;
  saveAndQuit: Record<string, never>;
}

type Listener = (state: UiState) => void;

/** Shared state between Phaser scenes and the Preact overlay. */
export class UiBridge {
  readonly commands = new EventBus<UiCommands>();
  private current: UiState;
  private readonly listeners = new Set<Listener>();

  constructor(initial: UiState) {
    this.current = initial;
  }

  get state(): UiState {
    return this.current;
  }

  set(patch: Partial<UiState>): void {
    this.current = { ...this.current, ...patch };
    for (const listener of this.listeners) listener(this.current);
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
