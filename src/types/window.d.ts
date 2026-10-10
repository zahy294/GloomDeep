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
  health: number;
  dead: boolean;
  /** Burning cells and blocks in mid-fall. */
  burning: number;
  falling: number;
  /** Live creatures: key, feet-centre (pixels), health. */
  enemies: { key: string; x: number; y: number; health: number }[];
  /** M10: villagers and the Dryad (feet-centre px, home id or -1), critter keys, the wisp. */
  npcs: { key: string; x: number; y: number; home: number }[];
  critters: string[];
  wisp: boolean;
  fae: number;
  /** Name of whoever is talking, or null. */
  dialogue: string | null;
  /** M11: quests taken (`key:state`), towns (place, light, festival) and caravans (feet, px). */
  quests: string[];
  towns: { key: string; x0: number; y0: number; light: number; festival: string }[];
  caravans: { x: number; y: number }[];
  /** M12: the fight in progress (key, state, phase, health share, script status), or null. */
  boss: { key: string; state: string; phase: number; health: number; status: string } | null;
  /** Arenas placed in this world (key, state) and the Dimming's strength 0..1. */
  arenas: { key: string; state: string }[];
  dimming: number;
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
      /** Liquid [type, amount] at a world tile (type 0 none, 1 water, 2 lava), null outside. */
      liquid: (x: number, y: number) => [number, number] | null;
      /** Gloam level 0–255 at a world tile, -1 outside the game or the world. */
      gloam: (x: number, y: number) => number;
      /** Light [r, g, b] at a world tile, null outside the game. */
      light: (x: number, y: number) => [number, number, number] | null;
    };
  }
}
