import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { SAVE } from '../config';
import type { SaveState, WorldMeta } from '../sim/world/worldData';
import { gunzip, gzip } from './compression';
import { decodeSave, encodeSave } from './saveFormat';

interface SaveRecord {
  savedAt: number;
  /** gzip(encodeSave(state)) */
  bytes: Uint8Array;
}

interface SaveDB extends DBSchema {
  worlds: { key: string; value: WorldMeta };
  saves: { key: string; value: SaveRecord };
}

const DEFAULT_DB_NAME = 'gloamdeep';
const DB_VERSION = 1;

const slotKey = (id: string, slot: number): string => `${id}:${slot}`;

export class SaveStore {
  private dbPromise: Promise<IDBPDatabase<SaveDB>> | null = null;

  constructor(
    private readonly dbName: string = DEFAULT_DB_NAME,
    private readonly now: () => number = Date.now,
  ) {}

  private db(): Promise<IDBPDatabase<SaveDB>> {
    this.dbPromise ??= openDB<SaveDB>(this.dbName, DB_VERSION, {
      upgrade(db) {
        db.createObjectStore('worlds');
        db.createObjectStore('saves');
      },
    });
    return this.dbPromise;
  }

  async listWorlds(): Promise<WorldMeta[]> {
    const all = await (await this.db()).getAll('worlds');
    return all.sort((a, b) => b.lastPlayed - a.lastPlayed);
  }

  async save(state: SaveState): Promise<void> {
    // Compress first: IndexedDB transactions auto-commit if we await non-IDB promises inside them.
    const record: SaveRecord = { savedAt: this.now(), bytes: await gzip(encodeSave(state)) };
    const id = state.meta.id;
    const db = await this.db();
    const tx = db.transaction(['worlds', 'saves'], 'readwrite');
    const saves = tx.objectStore('saves');
    // Slot 0 is the latest save. It is kept as a backup (everything shifts down one) only when it
    // is far enough from the backup before it; otherwise the new save simply replaces it.
    const latest = await saves.get(slotKey(id, 0));
    const previous = await saves.get(slotKey(id, 1));
    const spacingMs = SAVE.backupSpacingSeconds * 1000;
    if (latest && (!previous || latest.savedAt - previous.savedAt >= spacingMs)) {
      for (let k = SAVE.backups - 2; k >= 0; k--) {
        const existing = await saves.get(slotKey(id, k));
        if (existing) await saves.put(existing, slotKey(id, k + 1));
      }
    }
    await saves.put(record, slotKey(id, 0));
    await tx.objectStore('worlds').put(state.meta, id);
    await tx.done;
  }

  async load(id: string): Promise<SaveState | null> {
    const db = await this.db();
    for (let slot = 0; slot < SAVE.backups; slot++) {
      const record = await db.get('saves', slotKey(id, slot));
      if (!record) continue;
      try {
        return decodeSave(await gunzip(record.bytes));
      } catch (err) {
        console.warn(`Save slot ${slot} of world ${id} is corrupt, trying older backup`, err);
      }
    }
    return null;
  }

  async deleteWorld(id: string): Promise<void> {
    const db = await this.db();
    const tx = db.transaction(['worlds', 'saves'], 'readwrite');
    for (let slot = 0; slot < SAVE.backups; slot++)
      await tx.objectStore('saves').delete(slotKey(id, slot));
    await tx.objectStore('worlds').delete(id);
    await tx.done;
  }

  async close(): Promise<void> {
    if (!this.dbPromise) return;
    (await this.dbPromise).close();
    this.dbPromise = null;
  }
}
