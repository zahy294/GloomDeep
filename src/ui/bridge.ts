import { EventBus } from '../sim/events';

/** Which top-level screen is showing. Scenes set this; the overlay renders to match. */
export type Screen = 'boot' | 'title' | 'game';

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

/** Read-only snapshot of the player's inventory for the UI (rebuilt when it changes). */
export interface InventoryView {
  slots: readonly ({ itemId: number; count: number; name: string } | null)[];
  selected: number;
  hotbarSize: number;
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
}

/** Commands the UI sends. The UI never changes game state directly (CLAUDE.md rule 3). */
export interface UiCommands {
  startGame: Record<string, never>;
  selectSlot: { slot: number };
  swapSlots: { a: number; b: number };
  /** The mouse is over an interactive panel, so clicks must not mine/place in the world. */
  pointerOverUi: { over: boolean };
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
