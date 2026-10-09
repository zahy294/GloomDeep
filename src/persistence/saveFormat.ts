import { HEALTH, ITEM_DROP } from '../config';
import type { SaveState, WorldArrays } from '../sim/world/worldData';

/** Bump when the layout or header fields change, and add a migration for the old version. */
export const SAVE_VERSION = 3;

const MAGIC = [0x47, 0x4c, 0x44, 0x50]; // "GLDP"
const PREAMBLE_BYTES = 8; // magic + uint32 header length
const ALIGN = 4;

export class SaveFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SaveFormatError';
  }
}

type ArrayName = keyof WorldArrays;
type ArrayType = 'u8' | 'u16' | 'i32';
export type TypedArray = Uint8Array | Uint16Array | Int32Array;

interface ArrayEntry {
  name: ArrayName;
  type: ArrayType;
  length: number;
  /** Absolute byte offset from the start of the file (4-byte aligned). */
  offset: number;
}

/** Header as stored in the file: the SaveState minus `arrays`, plus the array table. */
export type SaveHeader = Record<string, unknown> & { version: number };

/** A decoded but not yet validated save: migrations may change the header and add, drop or
 * convert arrays (e.g. a new layer array, or a new depth layer in `layerTops`). */
export interface RawSave {
  header: SaveHeader;
  arrays: Record<string, TypedArray>;
}

export type MigrationTable = Record<number, (save: RawSave) => RawSave>;

/** MIGRATIONS[n] upgrades a version-n save to version n+1. */
export const MIGRATIONS: MigrationTable = {
  // v2 (M6): player health, the stack held by the inventory cursor, per-drop pickup delay.
  1: (save) => {
    const h = save.header as SaveHeader & {
      player?: Record<string, unknown>;
      inventory?: Record<string, unknown>;
      drops?: Record<string, unknown>[];
    };
    if (h.player) h.player.health = HEALTH.max;
    if (h.inventory) h.inventory.cursor = null;
    for (const d of h.drops ?? []) d.pickupAfter = ITEM_DROP.pickupDelay;
    return save;
  },
  // v3 (M10): villagers and the Old Dryad; the starting Gloam is unknown for older worlds.
  2: (save) => {
    const h = save.header as SaveHeader & { npcs?: unknown[]; gloamInitial?: number };
    h.npcs = [];
    h.gloamInitial = -1;
    return save;
  },
};

const ARRAY_TYPES: Record<ArrayName, ArrayType> = {
  fg: 'u16',
  bg: 'u16',
  liquid: 'u8',
  liquidType: 'u8',
  gloam: 'u8',
  surfaceBiome: 'u8',
  layerTops: 'i32',
};
const ARRAY_NAMES = Object.keys(ARRAY_TYPES) as ArrayName[];
const TYPE_SIZE: Record<ArrayType, number> = { u8: 1, u16: 2, i32: 4 };

const align = (n: number): number => Math.ceil(n / ALIGN) * ALIGN;

export function encodeSave(state: SaveState): Uint8Array {
  const { arrays, ...rest } = state;
  const table: ArrayEntry[] = ARRAY_NAMES.map((name) => ({
    name,
    type: ARRAY_TYPES[name],
    length: arrays[name].length,
    offset: 0,
  }));
  // Offsets depend on the header length, which depends on the offsets' digit count: iterate to a fixpoint.
  let headerBytes = new Uint8Array(0);
  let dataStart = 0;
  for (let pass = 0; pass < 8; pass++) {
    let cursor = dataStart;
    for (const e of table) {
      e.offset = cursor;
      cursor = align(cursor + e.length * TYPE_SIZE[e.type]);
    }
    headerBytes = new TextEncoder().encode(JSON.stringify({ ...rest, arrayTable: table }));
    const next = align(PREAMBLE_BYTES + headerBytes.length);
    if (next === dataStart) break;
    dataStart = next;
  }
  if (align(PREAMBLE_BYTES + headerBytes.length) !== dataStart) {
    throw new SaveFormatError('Save header layout did not converge'); // never overwrite the header
  }
  const last = table[table.length - 1];
  const total = last ? align(last.offset + last.length * TYPE_SIZE[last.type]) : dataStart;
  const out = new Uint8Array(total);
  out.set(MAGIC, 0);
  new DataView(out.buffer).setUint32(4, headerBytes.length, true);
  out.set(headerBytes, PREAMBLE_BYTES);
  for (const e of table) {
    const a = arrays[e.name];
    out.set(new Uint8Array(a.buffer, a.byteOffset, a.byteLength), e.offset);
  }
  return out;
}

export function decodeSave(bytes: Uint8Array): SaveState {
  return decodeWith(bytes, MIGRATIONS, SAVE_VERSION);
}

/** Exposed for tests so a fake migration table / version can be used. */
export function decodeWith(
  bytes: Uint8Array,
  migrations: MigrationTable,
  current: number,
): SaveState {
  if (bytes.length < PREAMBLE_BYTES) throw new SaveFormatError('Save is truncated (no preamble)');
  for (let i = 0; i < MAGIC.length; i++) {
    if (bytes[i] !== MAGIC[i]) throw new SaveFormatError('Bad magic: not a Gloamdeep save');
  }
  const headerLen = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(
    4,
    true,
  );
  if (PREAMBLE_BYTES + headerLen > bytes.length)
    throw new SaveFormatError('Save is truncated (header)');

  let header: SaveHeader;
  try {
    const text = new TextDecoder().decode(
      bytes.subarray(PREAMBLE_BYTES, PREAMBLE_BYTES + headerLen),
    );
    header = JSON.parse(text) as SaveHeader;
  } catch {
    throw new SaveFormatError('Save header is not valid JSON');
  }
  if (typeof header.version !== 'number') throw new SaveFormatError('Save header has no version');
  if (header.version > current) {
    throw new SaveFormatError(
      `Save version ${header.version} is newer than supported version ${current}`,
    );
  }
  const { arrayTable, ...fields } = header as SaveHeader & { arrayTable?: ArrayEntry[] };
  if (!Array.isArray(arrayTable)) throw new SaveFormatError('Save header has no array table');
  // Arrays are read by the file's own table (older versions may hold other arrays), then migrated.
  const fileArrays: Record<string, TypedArray> = {};
  for (const e of arrayTable) {
    const size = TYPE_SIZE[e.type];
    if (!size) throw new SaveFormatError(`Unknown array type for ${String(e.name)}`);
    const end = e.offset + e.length * size;
    if (end > bytes.length) throw new SaveFormatError(`Save is truncated (array ${e.name})`);
    const copy = bytes.slice(e.offset, end).buffer; // copy: source offset may be unaligned
    fileArrays[e.name] =
      e.type === 'u8'
        ? new Uint8Array(copy)
        : e.type === 'u16'
          ? new Uint16Array(copy)
          : new Int32Array(copy);
  }

  let save: RawSave = { header: fields as SaveHeader, arrays: fileArrays };
  while (save.header.version < current) {
    const from = save.header.version;
    const step = migrations[from];
    if (!step) throw new SaveFormatError(`No migration from save version ${from}`);
    save = step(save);
    save.header.version = from + 1;
  }

  const rest = save.header;
  const arrays: Partial<Record<ArrayName, TypedArray>> = {};
  for (const name of ARRAY_NAMES) {
    const a = save.arrays[name];
    if (!a) throw new SaveFormatError(`Save is missing array ${name}`);
    if (TYPE_SIZE[ARRAY_TYPES[name]] !== a.BYTES_PER_ELEMENT) {
      throw new SaveFormatError(`Array ${name} has the wrong element type`);
    }
    arrays[name] = a;
  }
  const meta = rest.meta as { width?: number; height?: number } | undefined;
  if (!meta || typeof meta.width !== 'number' || typeof meta.height !== 'number') {
    throw new SaveFormatError('Save header has no world meta');
  }
  const tiles = meta.width * meta.height;
  for (const name of ARRAY_NAMES) {
    const a = arrays[name];
    if (!a) throw new SaveFormatError(`Save is missing array ${name}`);
    if (name === 'layerTops') continue;
    const expected = name === 'surfaceBiome' ? meta.width : tiles;
    if (a.length !== expected) {
      throw new SaveFormatError(`Array ${name} has length ${a.length}, expected ${expected}`);
    }
  }
  return {
    ...(rest as unknown as Omit<SaveState, 'arrays'>),
    arrays: arrays as unknown as WorldArrays,
  };
}
