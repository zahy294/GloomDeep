import type * as Phaser from 'phaser';
import type { UiBridge } from '../ui/bridge';

/** Snapshot of the running Game scene, for Playwright checks. */
export interface GameProbe {
  steps: number;
  /** Player feet-centre in pixels. */
  playerX: number;
  playerY: number;
  onGround: boolean;
  chunksLoaded: number;
  /** Chunks built synchronously because they entered the view before being preloaded. */
  lateChunkLoads: number;
  chunkUnloads: number;
  frameCpuAvgMs: number;
  frameCpuMaxMs: number;
  selectedSlot: number;
  inventory: ({ itemId: number; count: number } | null)[];
  drops: number;
  /** Camera scroll (world px at the view's top-left). */
  cameraX: number;
  cameraY: number;
  dayFraction: number;
  /** Average light-job compute time (ms) and number of light updates so far. */
  lightAvgMs: number;
  lightUpdates: number;
  lumen: number;
}

/** Hooks main.ts exposes for Playwright screenshots (tools/shot.ts) and console debugging. */
declare global {
  interface Window {
    gloamdeep?: {
      game: Phaser.Game;
      bridge: UiBridge;
      /** Null unless the Game scene is running. */
      probe: () => GameProbe | null;
      /** Clears the worst-frame CPU measurement. */
      resetFrameStats: () => void;
      /** Tile id at a world tile coordinate (foreground or background), -1 outside the game. */
      tile: (x: number, y: number, layer?: 'fg' | 'bg') => number;
      /** Light [r, g, b] at a world tile, null outside the game. */
      light: (x: number, y: number) => [number, number, number] | null;
    };
  }
}
