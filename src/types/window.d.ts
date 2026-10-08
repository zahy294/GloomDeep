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
}

/** Hooks main.ts exposes for Playwright screenshots (tools/shot.ts) and console debugging. */
declare global {
  interface Window {
    gloamdeep?: {
      game: Phaser.Game;
      bridge: UiBridge;
      /** Null unless the Game scene is running. */
      probe: () => GameProbe | null;
    };
  }
}
