import { describe, expect, it } from 'vitest';
import { HEALTH, ITEM_DROP } from '../../src/config';
import { gunzip, gzip } from '../../src/persistence/compression';
import {
  SAVE_VERSION,
  SaveFormatError,
  decodeSave,
  decodeWith,
  encodeSave,
  type MigrationTable,
} from '../../src/persistence/saveFormat';
import type { SaveState, WorldArrays } from '../../src/sim/world/worldData';

export function makeState(width: number, height: number, fill?: (i: number) => number): SaveState {
  const n = width * height;
  const arrays: WorldArrays = {
    fg: new Uint16Array(n),
    bg: new Uint16Array(n),
    liquid: new Uint8Array(n),
    liquidType: new Uint8Array(n),
    gloam: new Uint8Array(n),
    surfaceBiome: new Uint8Array(width),
    layerTops: new Int32Array([0, 100, 400, -5]),
  };
  if (fill) {
    for (let i = 0; i < n; i++) {
      const v = fill(i);
      arrays.fg[i] = v & 0xffff;
      arrays.bg[i] = (v >> 3) & 0xffff;
      arrays.liquid[i] = v & 0xff;
      arrays.liquidType[i] = (v >> 2) & 3;
      arrays.gloam[i] = (v >> 5) & 0xff;
    }
    for (let x = 0; x < width; x++) arrays.surfaceBiome[x] = x % 7;
  }
  return {
    version: SAVE_VERSION,
    meta: {
      id: 'w1',
      name: 'Test "world" é',
      seed: 42,
      sizeKey: 'small',
      width,
      height,
      createdAt: 1000,
      lastPlayed: 2000,
      playTime: 33.5,
    },
    arrays,
    player: {
      x: 1.5,
      y: -2,
      vx: 0.25,
      vy: 3,
      facing: -1,
      lumen: 77,
      lanternOn: true,
      onGround: true,
      coyoteTimer: 0,
      jumpBufferTimer: 0,
      jumping: false,
      lens: 'amber',
      health: 64.5,
    },
    inventory: {
      slots: [{ itemId: 3, count: 12 }, null, { itemId: 9, count: 1 }],
      selected: 2,
      cursor: { itemId: 5, count: 7 },
    },
    dayFraction: 0.375,
    elapsed: 123.456,
    drops: [
      {
        itemId: 4,
        count: 2,
        x: 10,
        y: 20,
        vx: -3,
        vy: 40,
        age: 12.5,
        magnetized: true,
        pickupAfter: 2,
      },
    ],
    randomState: 0xdeadbeef,
    spawnX: 100,
    spawnY: 200,
  };
}

const noise = (i: number): number => (Math.imul(i, 2654435761) ^ (i >>> 3)) >>> 0;

describe('saveFormat', () => {
  it('round-trips exactly', () => {
    const state = makeState(37, 23, noise);
    const out = decodeSave(encodeSave(state));
    expect(out.meta).toEqual(state.meta);
    expect(out.player).toEqual(state.player);
    expect(out.inventory).toEqual(state.inventory);
    expect(out.drops).toEqual(state.drops);
    expect(out.dayFraction).toBe(state.dayFraction);
    expect(out.elapsed).toBe(state.elapsed);
    expect([out.spawnX, out.spawnY]).toEqual([100, 200]);
    for (const k of Object.keys(state.arrays) as (keyof WorldArrays)[]) {
      expect(out.arrays[k]).toBeInstanceOf(state.arrays[k].constructor);
      expect(Array.from(out.arrays[k])).toEqual(Array.from(state.arrays[k]));
    }
  });

  it('starts with the GLDP magic and 4-byte aligned arrays', () => {
    const bytes = encodeSave(makeState(5, 5));
    expect(String.fromCharCode(...bytes.subarray(0, 4))).toBe('GLDP');
    expect(bytes.length % 4).toBe(0);
  });

  it('rejects bad magic', () => {
    const bytes = encodeSave(makeState(5, 5));
    bytes[0] = 0;
    expect(() => decodeSave(bytes)).toThrow(SaveFormatError);
    expect(() => decodeSave(bytes)).toThrow(/magic/i);
  });

  it('rejects truncated data', () => {
    const bytes = encodeSave(makeState(20, 20, noise));
    expect(() => decodeSave(bytes.subarray(0, 4))).toThrow(/truncated/);
    expect(() => decodeSave(bytes.subarray(0, 30))).toThrow(/truncated/);
    expect(() => decodeSave(bytes.subarray(0, bytes.length - 8))).toThrow(/truncated/);
  });

  it('rejects arrays whose length does not match the world size', () => {
    const state = makeState(10, 10);
    state.arrays.fg = new Uint16Array(99);
    expect(() => decodeSave(encodeSave(state))).toThrow(/fg/);
    const state2 = makeState(10, 10);
    state2.arrays.surfaceBiome = new Uint8Array(100);
    expect(() => decodeSave(encodeSave(state2))).toThrow(/surfaceBiome/);
  });

  it('rejects a future version', () => {
    const state = makeState(4, 4);
    state.version = SAVE_VERSION + 1;
    expect(() => decodeSave(encodeSave(state))).toThrow(/newer/);
  });

  it('runs migrations in order from the file version', () => {
    const state = makeState(4, 4);
    state.version = 0;
    const calls: number[] = [];
    const migrations: MigrationTable = {
      0: ({ header, arrays }) => {
        calls.push(0);
        return {
          header: { ...header, player: { ...(header.player as object), lumen: 5 } },
          arrays,
        };
      },
      1: (save) => {
        calls.push(1);
        return save;
      },
    };
    const out = decodeWith(encodeSave(state), migrations, 2);
    expect(calls).toEqual([0, 1]);
    expect(out.version).toBe(2);
    expect(out.player.lumen).toBe(5);
    expect(() => decodeWith(encodeSave(state), {}, 1)).toThrow(/No migration/);
  });

  it('lets a migration add an array an older version did not have', () => {
    const state = makeState(4, 4);
    state.version = 0;
    // Simulate an old file without the gloam array: encode, then drop it before the migration.
    const migrations: MigrationTable = {
      0: ({ header, arrays }) => {
        const { gloam, ...older } = arrays;
        expect(gloam).toBeDefined();
        return { header, arrays: { ...older, gloam: new Uint8Array(16).fill(9) } };
      },
    };
    const out = decodeWith(encodeSave(state), migrations, 1);
    expect(Array.from(out.arrays.gloam)).toEqual(new Array(16).fill(9));
    expect(() =>
      decodeWith(encodeSave(state), { 0: ({ header }) => ({ header, arrays: {} }) }, 1),
    ).toThrow(/missing array/);
  });
});

describe('MIGRATIONS', () => {
  it('upgrades a v1 save: full health, empty cursor, default pickup delay', () => {
    const state = makeState(4, 4);
    state.version = 1;
    // A v1 header lacks the v2 fields.
    const v1Player: Partial<SaveState['player']> = { ...state.player };
    delete v1Player.health;
    const v1Inventory: Partial<SaveState['inventory']> = { ...state.inventory };
    delete v1Inventory.cursor;
    const v1Drops = state.drops.map((d) => {
      const old: Partial<SaveState['drops'][number]> = { ...d };
      delete old.pickupAfter;
      return old;
    });
    const v1 = {
      ...state,
      player: v1Player,
      inventory: v1Inventory,
      drops: v1Drops,
    } as SaveState; // the missing fields are the point of the test
    const out = decodeSave(encodeSave(v1));
    expect(out.version).toBe(SAVE_VERSION);
    expect(out.player.health).toBe(HEALTH.max);
    expect(out.inventory.cursor).toBeNull();
    expect(out.drops[0]?.pickupAfter).toBe(ITEM_DROP.pickupDelay);
  });
});

describe('compression', () => {
  it('round-trips and compresses a mostly-uniform world', async () => {
    const bytes = encodeSave(makeState(300, 100, (i) => (i % 1000 === 0 ? 1 : 0)));
    const zipped = await gzip(bytes);
    expect(zipped.length).toBeLessThan(bytes.length / 20);
    expect(Array.from(await gunzip(zipped))).toEqual(Array.from(bytes));
  });
});

describe('performance', () => {
  it('encodes, gzips, gunzips and decodes a 4200x1200 world quickly', async () => {
    const state = makeState(4200, 1200, noise);
    const t0 = performance.now();
    const zipped = await gzip(encodeSave(state));
    const out = decodeSave(await gunzip(zipped));
    const ms = performance.now() - t0;
    console.log(
      `4200x1200 save round trip: ${ms.toFixed(0)} ms, ${(zipped.length / 1e6).toFixed(1)} MB gzipped`,
    );
    expect(out.arrays.fg.length).toBe(4200 * 1200);
    expect(ms).toBeLessThan(3000);
  });
});
