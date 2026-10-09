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
}

/** Someone talking (M10); `id` changes per line so the text fades in anew. */
export interface DialogueView {
  name: string;
  role: string;
  text: string;
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
  /** Close the travel list (or the dialogue). */
  closePanel: Record<string, never>;
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
