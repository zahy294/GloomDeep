/**
 * Plain-data shapes for a whole world: what world generation produces, what a save file holds and
 * what the Simulation is built from. Typed arrays only, so they cross worker boundaries cheaply.
 */

export type WorldSizeKey = 'small' | 'medium' | 'large';

export interface WorldMeta {
  /** Stable id (used as the IndexedDB key prefix). */
  id: string;
  name: string;
  seed: number;
  sizeKey: WorldSizeKey;
  width: number;
  height: number;
  /** Epoch milliseconds. */
  createdAt: number;
  lastPlayed: number;
  /** Seconds played in this world. */
  playTime: number;
}

/** The persistent per-tile arrays (light is recomputed, never saved). */
export interface WorldArrays {
  fg: Uint16Array;
  bg: Uint16Array;
  liquid: Uint8Array;
  liquidType: Uint8Array;
  gloam: Uint8Array;
  /** Surface biome index (src/data/biomes.ts SURFACE_BIOMES) per column. */
  surfaceBiome: Uint8Array;
  /** First row of each depth layer (src/data/biomes.ts DEPTH_LAYERS), in order. */
  layerTops: Int32Array;
}

/** Output of world generation. */
export interface GeneratedWorld {
  width: number;
  height: number;
  arrays: WorldArrays;
  /** Player spawn, feet-centre, pixels. */
  spawnX: number;
  spawnY: number;
}

export interface SavedPlayer {
  /** Body top-left, pixels. */
  x: number;
  y: number;
  vx: number;
  vy: number;
  facing: 1 | -1;
  /** Movement state, so a restored world continues exactly where it stopped. */
  onGround: boolean;
  coyoteTimer: number;
  jumpBufferTimer: number;
  jumping: boolean;
  lumen: number;
  lanternOn: boolean;
  lens: string;
}

export interface SavedDrop {
  itemId: number;
  count: number;
  /** Centre, pixels. */
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Seconds since it dropped (despawn timer). */
  age: number;
  magnetized: boolean;
}

/** Everything needed to restore a world exactly (plan 3.5). */
export interface SaveState {
  /** Save format version (src/persistence/saveFormat.ts SAVE_VERSION). */
  version: number;
  meta: WorldMeta;
  arrays: WorldArrays;
  player: SavedPlayer;
  inventory: { slots: ({ itemId: number; count: number } | null)[]; selected: number };
  dayFraction: number;
  /** Simulated seconds (drives flicker etc.). */
  elapsed: number;
  drops: SavedDrop[];
  /** Gameplay random generator state (Mulberry32.state), so drop pops continue the same sequence. */
  randomState: number;
  /** Spawn point, feet-centre, pixels (respawn in M8). */
  spawnX: number;
  spawnY: number;
}
