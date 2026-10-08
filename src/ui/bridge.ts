import { EventBus } from '../sim/events';

/** Which top-level screen is showing. Scenes set this; the overlay renders to match. */
export type Screen = 'boot' | 'title' | 'game';

export interface UiState {
  screen: Screen;
  showUi: boolean;
}

/** Commands the UI sends. The UI never changes game state directly (CLAUDE.md rule 3). */
export interface UiCommands {
  startGame: Record<string, never>;
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
