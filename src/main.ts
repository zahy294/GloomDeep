import * as Phaser from 'phaser';
import { h, render } from 'preact';
import './ui/style.css';
import { DISPLAY } from './config';
import { parseDebugParams } from './debugParams';
import { keepIntegerScale } from './render/integerScale';
import { BootScene } from './render/scenes/BootScene';
import { GameScene } from './render/scenes/GameScene';
import { SceneKey } from './render/scenes/keys';
import { TitleScene } from './render/scenes/TitleScene';
import { App } from './ui/App';
import { UiBridge } from './ui/bridge';

const debug = parseDebugParams(window.location.search);
const bridge = new UiBridge({ screen: 'boot', showUi: debug.showUi });

const gameParent = document.getElementById('game');
const uiRoot = document.getElementById('ui');
if (!gameParent || !uiRoot) throw new Error('index.html is missing #game or #ui');

const game = new Phaser.Game({
  type: Phaser.AUTO,
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
  scene: [new BootScene(debug.scene), new TitleScene(bridge), new GameScene(bridge)],
});

keepIntegerScale(game, uiRoot);
render(h(App, { bridge }), uiRoot);

// Type declared in src/types/window.d.ts.
window.gloamdeep = {
  game,
  bridge,
  simSteps: () => {
    const scene = game.scene.getScene(SceneKey.Game) as GameScene | null;
    return scene?.sys.isActive() ? scene.simulation.steps : 0;
  },
};
