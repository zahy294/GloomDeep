import type * as Phaser from 'phaser';
import type { UiBridge } from '../ui/bridge';

/** Hooks main.ts exposes for Playwright screenshots (tools/shot.ts) and console debugging. */
declare global {
  interface Window {
    gloamdeep?: {
      game: Phaser.Game;
      bridge: UiBridge;
      simSteps: () => number;
    };
  }
}
