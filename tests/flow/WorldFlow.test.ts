import { describe, expect, it, vi } from 'vitest';
import { WORLD_SIZES } from '../../src/config';
import { WorldFlow, type GameStart, type WorldStore } from '../../src/flow/WorldFlow';
import { SAVE_VERSION } from '../../src/persistence/saveFormat';
import type { GeneratedWorld, SaveState, WorldMeta } from '../../src/sim/world/worldData';
import { UiBridge, type UiState } from '../../src/ui/bridge';
import type { WorldgenRequest } from '../../src/workers/worldgen/worldgenMessages';
import type { WorldgenProgress } from '../../src/workers/worldgen/worldgenClient';

const initial: UiState = {
  screen: 'title',
  showUi: true,
  debug: null,
  inventory: null,
  inventoryOpen: false,
  hud: null,
  icons: [],
  notice: null,
  dialogue: null,
  travel: null,
  shop: null,
  journal: null,
  banner: null,
  guide: false,
  boss: null,
  titleCard: null,
  ending: null,
  respawnIn: null,
  packDir: 'packed',
  worlds: [],
  generation: null,
  paused: false,
  error: null,
};

const meta = (id: string): WorldMeta => ({
  id,
  name: `World ${id}`,
  seed: 7,
  sizeKey: 'small',
  width: 10,
  height: 10,
  createdAt: 1,
  lastPlayed: 1,
  playTime: 0,
});

// Only identity matters to the flow: it hands saves and worlds to the game scene untouched.
const fakeSave = (id: string): SaveState =>
  ({ version: SAVE_VERSION, meta: meta(id) }) as SaveState;
const fakeWorld = { width: 10, height: 10 } as GeneratedWorld;

type Generate = (r: WorldgenRequest, p: WorldgenProgress) => Promise<GeneratedWorld>;

class FakeStore implements WorldStore {
  readonly saves = new Map<string, SaveState>();
  listWorlds = vi.fn(() => Promise.resolve([...this.saves.values()].map((s) => s.meta)));
  save = vi.fn((state: SaveState) => {
    this.saves.set(state.meta.id, state);
    return Promise.resolve();
  });
  load = vi.fn((id: string) => Promise.resolve(this.saves.get(id) ?? null));
  deleteWorld = vi.fn((id: string) => {
    this.saves.delete(id);
    return Promise.resolve();
  });
}

function setup(generate?: Generate) {
  const bridge = new UiBridge(initial);
  const store = new FakeStore();
  const started: GameStart[] = [];
  const menus: string[] = [];
  const screens: string[] = [];
  bridge.subscribe((s) => screens.push(s.screen));
  const gen = vi.fn<Generate>(
    generate ??
      ((_req, onProgress) => {
        onProgress(0.5, 'Caves');
        onProgress(1, 'Validation');
        return Promise.resolve(fakeWorld);
      }),
  );
  const flow = new WorldFlow({
    bridge,
    store,
    scenes: { startGame: (s) => started.push(s), showMenu: (s) => menus.push(s) },
    generate: gen,
    now: () => 1000,
    random: () => 0.5,
  });
  return { bridge, store, started, menus, screens, gen, flow };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('WorldFlow', () => {
  it('create → generating screen with progress → starts the game with a new meta', async () => {
    const { bridge, started, screens, gen } = setup();
    const progress: number[] = [];
    bridge.subscribe((s) => {
      if (s.generation) progress.push(s.generation.progress);
    });
    bridge.commands.emit('createWorld', {
      name: 'Glade',
      seed: 42,
      size: 'small',
      starterKit: true,
    });
    await settle();

    expect(screens).toContain('generating');
    expect(progress).toEqual([0, 0.5, 1]);
    expect(gen).toHaveBeenCalledWith(
      { width: WORLD_SIZES.small.width, height: WORLD_SIZES.small.height, seed: 42 },
      expect.any(Function),
    );
    expect(started).toHaveLength(1);
    const start = started[0];
    expect(start?.kind).toBe('new');
    if (start?.kind !== 'new') return;
    expect(start.world).toBe(fakeWorld);
    expect(start.starterKit).toBe(true);
    expect(start.meta).toMatchObject({
      name: 'Glade',
      seed: 42,
      sizeKey: 'small',
      width: WORLD_SIZES.small.width,
      createdAt: 1000,
      playTime: 0,
    });
    expect(bridge.state.generation).toBeNull();
  });

  it('a world created without a seed gets one from the random source', async () => {
    const { bridge, gen } = setup();
    bridge.commands.emit('createWorld', {
      name: 'X',
      seed: null,
      size: 'medium',
      starterKit: true,
    });
    await settle();
    expect(gen).toHaveBeenCalledWith(
      expect.objectContaining({ seed: Math.floor(0.5 * 0x7fffffff) }),
      expect.any(Function),
    );
  });

  it('ignores a second create while the first is still generating', async () => {
    let finish: (w: GeneratedWorld) => void = () => {};
    const { bridge, started, gen } = setup(
      () => new Promise<GeneratedWorld>((resolve) => (finish = resolve)),
    );
    bridge.commands.emit('createWorld', { name: 'A', seed: 1, size: 'small', starterKit: true });
    bridge.commands.emit('createWorld', { name: 'B', seed: 2, size: 'small', starterKit: true });
    finish(fakeWorld);
    await settle();
    expect(gen).toHaveBeenCalledTimes(1);
    expect(started).toHaveLength(1);
    // Once done, creating works again.
    bridge.commands.emit('createWorld', { name: 'C', seed: 3, size: 'small', starterKit: true });
    finish(fakeWorld);
    await settle();
    expect(started).toHaveLength(2);
  });

  it('a failed generation returns to the world list with an error', async () => {
    const { bridge, started, menus } = setup(() => Promise.reject(new Error('boom')));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    bridge.commands.emit('createWorld', { name: 'A', seed: 1, size: 'small', starterKit: true });
    await settle();
    expect(started).toHaveLength(0);
    expect(menus.at(-1)).toBe('worlds');
    expect(bridge.state.error).toContain('boom');
    expect(bridge.state.generation).toBeNull();
  });

  it('play loads the save and starts the game with it', async () => {
    const { bridge, store, started } = setup();
    const save = fakeSave('w1');
    store.saves.set('w1', save);
    bridge.commands.emit('playWorld', { id: 'w1' });
    await settle();
    expect(store.load).toHaveBeenCalledWith('w1');
    expect(started).toEqual([{ kind: 'saved', save }]);
  });

  it('a missing save shows an error on the world list instead of starting', async () => {
    const { bridge, started, menus } = setup();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    bridge.commands.emit('playWorld', { id: 'gone' });
    await settle();
    expect(started).toHaveLength(0);
    expect(menus.at(-1)).toBe('worlds');
    expect(bridge.state.error).toMatch(/Could not load/);
  });

  it('delete removes the world and refreshes the list', async () => {
    const { bridge, store } = setup();
    store.saves.set('a', fakeSave('a'));
    store.saves.set('b', fakeSave('b'));
    bridge.commands.emit('openWorlds', {});
    await settle();
    expect(bridge.state.worlds.map((w) => w.id)).toEqual(['a', 'b']);
    bridge.commands.emit('deleteWorld', { id: 'a' });
    await settle();
    expect(store.deleteWorld).toHaveBeenCalledWith('a');
    expect(bridge.state.worlds.map((w) => w.id)).toEqual(['b']);
  });

  it('save passes the state to the store and rejects a wrong version', async () => {
    const { store, flow } = setup();
    const save = fakeSave('w1');
    await flow.save(save);
    expect(store.save).toHaveBeenCalledWith(save);
    expect(() => flow.save({ ...save, version: SAVE_VERSION + 1 })).toThrow(/version/);
  });

  it('back to title shows the title menu; quit returns to the world list', async () => {
    const { bridge, menus, flow } = setup();
    bridge.commands.emit('backToTitle', {});
    await flow.quitToWorlds();
    expect(menus).toEqual(['title', 'worlds']);
    expect(bridge.state.error).toBeNull();
  });
});
