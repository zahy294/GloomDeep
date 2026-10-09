import * as Phaser from 'phaser';
import { h, render } from 'preact';
import './ui/style.css';
import { DISPLAY } from './config';
import { parseDebugParams } from './debugParams';
import { keepIntegerScale } from './render/integerScale';
import { ArtTestScene } from './render/scenes/ArtTestScene';
import { BootScene } from './render/scenes/BootScene';
import { GameScene } from './render/scenes/GameScene';
import { DEFAULT_PACK_DIR, SceneKey } from './render/scenes/keys';
import { FrontScene } from './render/scenes/FrontScene';
import { GlowScene } from './render/scenes/GlowScene';
import { SkyScene } from './render/scenes/SkyScene';
import { TitleScene } from './render/scenes/TitleScene';
import { WorldFlow, type SceneControl } from './flow/WorldFlow';
import { SaveStore } from './persistence/SaveStore';
import { App } from './ui/App';
import { generateWorldAsync } from './workers/worldgen/worldgenClient';
import { UiBridge } from './ui/bridge';

const debug = parseDebugParams(window.location.search);
const bridge = new UiBridge({
  screen: 'boot',
  showUi: debug.showUi,
  debug: null,
  inventory: null,
  inventoryOpen: false,
  hud: null,
  icons: [],
  notice: null,
  respawnIn: null,
  packDir: debug.pack ?? DEFAULT_PACK_DIR,
  worlds: [],
  generation: null,
  paused: false,
  error: null,
});

// Scene switching for the world flow; set once the game exists (below).
let scenes: Phaser.Scenes.SceneManager | null = null;
const sceneControl: SceneControl = {
  startGame: (start) => {
    scenes?.stop(SceneKey.Title);
    scenes?.start(SceneKey.Game, start);
  },
  showMenu: (screen) => {
    if (scenes?.isActive(SceneKey.Title)) {
      bridge.set({ screen });
      return;
    }
    scenes?.stop(SceneKey.Game);
    scenes?.start(SceneKey.Title, { screen });
  },
};
const flow = new WorldFlow({
  bridge,
  store: new SaveStore(),
  scenes: sceneControl,
  generate: generateWorldAsync,
});

const gameParent = document.getElementById('game');
const uiRoot = document.getElementById('ui');
if (!gameParent || !uiRoot) throw new Error('index.html is missing #game or #ui');

const game = new Phaser.Game({
  // WebGL only: TilemapGPULayer (and later filters/lighting) have no Canvas fallback.
  type: Phaser.WEBGL,
  parent: gameParent,
  width: DISPLAY.width,
  height: DISPLAY.height,
  backgroundColor: DISPLAY.letterboxColor,
  pixelArt: true,
  roundPixels: true,
  disableContextMenu: true,
  banner: false,
  scale: {
    // Zoom is driven by keepIntegerScale so we only ever scale by whole numbers.
    mode: Phaser.Scale.NONE,
    autoCenter: Phaser.Scale.NO_CENTER,
  },
  scene: [
    new BootScene(debug),
    new TitleScene(bridge),
    new SkyScene(),
    new GameScene(bridge, debug, flow),
    new GlowScene(),
    new FrontScene(),
    new ArtTestScene(bridge, debug),
  ],
});

scenes = game.scene;
keepIntegerScale(game, uiRoot);
render(h(App, { bridge }), uiRoot);

// Type declared in src/types/window.d.ts.
window.gloamdeep = {
  game,
  bridge,
  probe: () => {
    const scene = game.scene.getScene(SceneKey.Game) as GameScene | null;
    return scene?.sys.isActive() ? scene.probe() : null;
  },
  resetFrameStats: () => {
    const scene = game.scene.getScene(SceneKey.Game) as GameScene | null;
    if (scene?.sys.isActive()) scene.resetFrameStats();
  },
  light: (x, y) => {
    const scene = game.scene.getScene(SceneKey.Game) as GameScene | null;
    if (!scene?.sys.isActive()) return null;
    const w = scene.simulation.world;
    const i = y * w.width + x;
    return [w.lightR[i] ?? 0, w.lightG[i] ?? 0, w.lightB[i] ?? 0];
  },
  liquid: (x, y) => {
    const scene = game.scene.getScene(SceneKey.Game) as GameScene | null;
    if (!scene?.sys.isActive()) return null;
    const w = scene.simulation.world;
    if (!w.inBounds(x, y)) return null;
    const i = y * w.width + x;
    return [w.liquidType[i] ?? 0, w.liquid[i] ?? 0];
  },
  gloam: (x, y) => {
    const scene = game.scene.getScene(SceneKey.Game) as GameScene | null;
    if (!scene?.sys.isActive()) return -1;
    const w = scene.simulation.world;
    return w.inBounds(x, y) ? (w.gloam[y * w.width + x] ?? 0) : -1;
  },
  tile: (x, y, layer = 'fg') => {
    const scene = game.scene.getScene(SceneKey.Game) as GameScene | null;
    return scene?.sys.isActive() ? scene.simulation.world.getLayer(layer, x, y) : -1;
  },
};
