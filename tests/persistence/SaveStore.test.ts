import 'fake-indexeddb/auto';
import { openDB } from 'idb';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SAVE } from '../../src/config';
import { SaveStore } from '../../src/persistence/SaveStore';
import type { SaveState } from '../../src/sim/world/worldData';
import { makeState } from './saveFormat.test';

let counter = 0;
const stores: SaveStore[] = [];
/** Each save is a full backup interval after the previous one unless a clock is passed. */
function newStore(now?: () => number): { store: SaveStore; name: string } {
  const name = `test-db-${counter++}`;
  let t = 0;
  const store = new SaveStore(name, now ?? (() => (t += SAVE.backupSpacingSeconds * 1000)));
  stores.push(store);
  return { store, name };
}

function stateWith(id: string, lumen: number, lastPlayed = 2000): SaveState {
  const s = makeState(8, 6);
  s.meta = { ...s.meta, id, lastPlayed };
  s.player = { ...s.player, lumen };
  return s;
}

afterEach(async () => {
  await Promise.all(stores.splice(0).map((s) => s.close()));
  vi.restoreAllMocks();
});

describe('SaveStore', () => {
  it('saves and loads a world', async () => {
    const { store } = newStore();
    const state = stateWith('a', 10);
    await store.save(state);
    const out = await store.load('a');
    expect(out?.meta).toEqual(state.meta);
    expect(out?.player.lumen).toBe(10);
    expect(Array.from(out?.arrays.fg ?? [])).toEqual(Array.from(state.arrays.fg));
    expect(await store.load('missing')).toBeNull();
  });

  it('rotates backups newest-first and drops the oldest', async () => {
    const { store, name } = newStore();
    for (const lumen of [1, 2, 3, 4]) await store.save(stateWith('a', lumen));
    const db = await openDB(name);
    expect(await db.getAllKeys('saves')).toEqual(['a:0', 'a:1', 'a:2']);
    db.close();
    expect((await store.load('a'))?.player.lumen).toBe(4);
    // Corrupt newest two: the oldest kept backup (lumen 2) must remain.
    const raw = await openDB(name);
    await raw.put('saves', { savedAt: 0, bytes: new Uint8Array([1, 2, 3]) }, 'a:0');
    await raw.put('saves', { savedAt: 0, bytes: new Uint8Array([1, 2, 3]) }, 'a:1');
    raw.close();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect((await store.load('a'))?.player.lumen).toBe(2);
  });

  it('quick saves replace the latest instead of pushing out older backups', async () => {
    let t = 0;
    const { store, name } = newStore(() => t);
    for (const lumen of [1, 2, 3, 4, 5]) {
      await store.save(stateWith('a', lumen));
      t += 5_000; // alt-tabbing: saves seconds apart
    }
    // 1 became a backup when 2 arrived (no backup yet); 2..4 were each replaced by the next.
    const raw = await openDB(name);
    expect(await raw.getAllKeys('saves')).toEqual(['a:0', 'a:1']);
    raw.close();
    expect((await store.load('a'))?.player.lumen).toBe(5);
    t += SAVE.backupSpacingSeconds * 1000;
    await store.save(stateWith('a', 6)); // replaces 5; now a full interval after backup 1
    await store.save(stateWith('a', 7)); // so 6 is kept as a backup
    const after = await openDB(name);
    expect(await after.getAllKeys('saves')).toEqual(['a:0', 'a:1', 'a:2']);
    after.close();
    expect((await store.load('a'))?.player.lumen).toBe(7);
  });

  it('falls back to the previous backup when slot 0 is corrupt', async () => {
    const { store, name } = newStore();
    await store.save(stateWith('a', 1));
    await store.save(stateWith('a', 2));
    const raw = await openDB(name);
    await raw.put('saves', { savedAt: 0, bytes: new Uint8Array([9, 9, 9, 9]) }, 'a:0');
    raw.close();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect((await store.load('a'))?.player.lumen).toBe(1);
    expect(warn).toHaveBeenCalled();
  });

  it('lists worlds by lastPlayed descending', async () => {
    const { store } = newStore();
    await store.save(stateWith('old', 1, 100));
    await store.save(stateWith('new', 1, 300));
    await store.save(stateWith('mid', 1, 200));
    expect((await store.listWorlds()).map((w) => w.id)).toEqual(['new', 'mid', 'old']);
  });

  it('deleteWorld removes meta and every backup', async () => {
    const { store, name } = newStore();
    for (const lumen of [1, 2, 3]) await store.save(stateWith('a', lumen));
    await store.save(stateWith('b', 1));
    await store.deleteWorld('a');
    expect(await store.load('a')).toBeNull();
    expect((await store.listWorlds()).map((w) => w.id)).toEqual(['b']);
    const db = await openDB(name);
    expect(await db.getAllKeys('saves')).toEqual(['b:0']);
    db.close();
  });
});
