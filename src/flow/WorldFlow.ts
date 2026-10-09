import { WORLD_SIZES } from '../config';
import { SAVE_VERSION } from '../persistence/saveFormat';
import type { GeneratedWorld, SaveState, WorldMeta, WorldSizeKey } from '../sim/world/worldData';
import type { UiBridge, WorldListEntry } from '../ui/bridge';
import type { WorldgenRequest } from '../workers/worldgen/worldgenMessages';
import type { WorldgenProgress } from '../workers/worldgen/worldgenClient';

/** How the game scene gets its world. `debug` = a `?scene=game` start that is never saved. */
export type GameStart =
  | { kind: 'new'; meta: WorldMeta; world: GeneratedWorld }
  | { kind: 'saved'; save: SaveState }
  | { kind: 'debug' };

/** The parts of SaveStore the flow uses (a fake stands in during tests). */
export interface WorldStore {
  listWorlds(): Promise<WorldMeta[]>;
  save(state: SaveState): Promise<void>;
  load(id: string): Promise<SaveState | null>;
  deleteWorld(id: string): Promise<void>;
}

/** Scene switching, implemented with Phaser's scene manager in main.ts. */
export interface SceneControl {
  startGame(start: GameStart): void;
  /** Shows the title backdrop with the given overlay screen. */
  showMenu(screen: 'title' | 'worlds'): void;
}

export interface WorldFlowDeps {
  bridge: UiBridge;
  store: WorldStore;
  scenes: SceneControl;
  generate: (request: WorldgenRequest, onProgress: WorldgenProgress) => Promise<GeneratedWorld>;
  now?: () => number;
  /** Seed for worlds created without one, and new world ids. */
  random?: () => number;
}

/**
 * Title → world select → generate/load → play → save & quit (plan 3.5, 6). Owns the save store;
 * the game scene calls `save` and `quitToWorlds`. UI commands arrive through the bridge.
 */
export class WorldFlow {
  private busy = false;
  private readonly now: () => number;
  private readonly random: () => number;

  constructor(private readonly deps: WorldFlowDeps) {
    this.now = deps.now ?? Date.now;
    this.random = deps.random ?? Math.random;
    const { commands } = deps.bridge;
    commands.on('openWorlds', () => void this.openWorlds());
    commands.on('backToTitle', () => this.deps.scenes.showMenu('title'));
    commands.on('createWorld', ({ name, seed, size }) => void this.createWorld(name, seed, size));
    commands.on('playWorld', ({ id }) => void this.playWorld(id));
    commands.on('deleteWorld', ({ id }) => void this.deleteWorld(id));
  }

  async openWorlds(error: string | null = null): Promise<void> {
    await this.refreshList();
    this.deps.bridge.set({ error });
    this.deps.scenes.showMenu('worlds');
  }

  async createWorld(name: string, seed: number | null, sizeKey: WorldSizeKey): Promise<void> {
    if (!this.begin()) return;
    const { bridge, generate, scenes } = this.deps;
    const size = WORLD_SIZES[sizeKey];
    const worldSeed = seed ?? Math.floor(this.random() * 0x7fffffff);
    bridge.set({ screen: 'generating', generation: { stage: '', progress: 0 }, error: null });
    try {
      const world = await generate(
        { width: size.width, height: size.height, seed: worldSeed },
        (progress, stage) => bridge.set({ generation: { stage, progress } }),
      );
      const now = this.now();
      const meta: WorldMeta = {
        id: this.newId(),
        name,
        seed: worldSeed,
        sizeKey,
        width: size.width,
        height: size.height,
        createdAt: now,
        lastPlayed: now,
        playTime: 0,
      };
      bridge.set({ generation: null });
      scenes.startGame({ kind: 'new', meta, world });
    } catch (error) {
      console.error('World generation failed', error);
      bridge.set({ generation: null });
      await this.openWorlds(`World generation failed: ${message(error)}`);
    } finally {
      this.busy = false;
    }
  }

  async playWorld(id: string): Promise<void> {
    if (!this.begin()) return;
    try {
      const save = await this.deps.store.load(id);
      if (!save) throw new Error('no readable save found');
      this.deps.scenes.startGame({ kind: 'saved', save });
    } catch (error) {
      console.error('Loading world failed', error);
      await this.openWorlds(`Could not load this world: ${message(error)}`);
    } finally {
      this.busy = false;
    }
  }

  async deleteWorld(id: string): Promise<void> {
    try {
      await this.deps.store.deleteWorld(id);
      await this.openWorlds();
    } catch (error) {
      console.error('Deleting world failed', error);
      await this.openWorlds(`Could not delete this world: ${message(error)}`);
    }
  }

  /** Called by the game scene (first save, autosave, tab hidden, save & quit). */
  save(state: SaveState): Promise<void> {
    if (state.version !== SAVE_VERSION) throw new Error(`unexpected save version ${state.version}`);
    return this.deps.store.save(state);
  }

  /** Called by the game scene once it has saved and is shutting down. */
  quitToWorlds(): Promise<void> {
    return this.openWorlds();
  }

  private async refreshList(): Promise<void> {
    let worlds: WorldListEntry[] = [];
    try {
      worlds = (await this.deps.store.listWorlds()).map((m) => ({
        id: m.id,
        name: m.name,
        seed: m.seed,
        sizeKey: m.sizeKey,
        lastPlayed: m.lastPlayed,
        playTime: m.playTime,
      }));
    } catch (error) {
      console.error('Listing worlds failed', error);
    }
    this.deps.bridge.set({ worlds });
  }

  /** One create/load at a time (double clicks, Enter held down). */
  private begin(): boolean {
    if (this.busy) return false;
    this.busy = true;
    return true;
  }

  private newId(): string {
    const time = this.now().toString(36);
    const rand = Math.floor(this.random() * 36 ** 8)
      .toString(36)
      .padStart(8, '0');
    return `${time}-${rand}`;
  }
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
