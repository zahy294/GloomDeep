import * as Phaser from 'phaser';
import { DEBUG, PLAYER, TEST_WORLD, TILE_SIZE, WORLD } from '../../config';
import { DEBUG_KEYS } from '../../data/keybindings';
import { PALETTE } from '../../data/palette';
import type { DebugParams } from '../../debugParams';
import { Simulation } from '../../sim/Simulation';
import { findOpenFeetRow } from '../../sim/world/queries';
import type { GameProbe } from '../../types/window';
import type { UiBridge } from '../../ui/bridge';
import { generateTestWorld } from '../../workers/worldgen/testWorld';
import { CameraDirector } from '../CameraDirector';
import { ChunkRenderer } from '../ChunkRenderer';
import { Depth } from '../depth';
import { DrawCallCounter } from '../drawCallCounter';
import { InputMapper } from '../InputMapper';
import { PlayerRenderer } from '../PlayerRenderer';
import { SceneKey, TextureKey } from './keys';

/** Rolling CPU timing of the per-frame work this scene owns (simulation + chunk rendering). */
class FrameTimer {
  private total = 0;
  private frames = 0;
  max = 0;
  avg = 0;

  add(ms: number): void {
    this.total += ms;
    this.frames++;
    if (ms > this.max) this.max = ms;
  }

  /** Closes the current window: computes the average and starts a new one. */
  roll(): void {
    this.avg = this.frames ? this.total / this.frames : 0;
    this.total = 0;
    this.frames = 0;
  }

  resetMax(): void {
    this.max = 0;
  }
}

/** The in-game scene: runs the simulation and draws the world around the camera. */
export class GameScene extends Phaser.Scene {
  private sim!: Simulation;
  private inputMapper!: InputMapper;
  private chunks!: ChunkRenderer;
  private cameraDirector!: CameraDirector;
  private playerView!: PlayerRenderer;
  private chunkBorders!: Phaser.GameObjects.Graphics;
  private drawCalls: DrawCallCounter | null = null;
  private debugOpen = false;
  private debugAccumulator = 0;
  private readonly timer = new FrameTimer();
  private readonly view = { x: 0, y: 0, width: 0, height: 0 };

  constructor(
    private readonly bridge: UiBridge,
    private readonly params: DebugParams,
  ) {
    super(SceneKey.Game);
  }

  init(): void {
    // Fresh state on every (re)start; the constructor only runs once.
    const seed = this.params.seed ?? TEST_WORLD.defaultSeed;
    const { x, y } = this.params;
    this.sim = new Simulation({
      size: WORLD,
      generate: (world) => {
        const spawn = generateTestWorld(world, seed);
        if (x === null || y === null) return spawn;
        const feetRow = findOpenFeetRow(world, x, y, Math.ceil(PLAYER.height / TILE_SIZE));
        return { spawnX: (x + 0.5) * TILE_SIZE, spawnY: feetRow * TILE_SIZE };
      },
    });
    this.debugOpen = this.params.debugOverlay;
    this.debugAccumulator = 0;
  }

  create(): void {
    const { world, player } = this.sim;
    this.cameras.main.setBackgroundColor(PALETTE.moonSilver[1]);

    this.inputMapper = new InputMapper(this, this.sim.input);
    this.chunks = new ChunkRenderer(this, world, TextureKey.placeholderTiles);
    this.playerView = new PlayerRenderer(this, player);
    this.cameraDirector = new CameraDirector(
      this.cameras.main,
      world.width * TILE_SIZE,
      world.height * TILE_SIZE,
    );
    this.cameraDirector.snapTo(
      this.playerView.feetX(1),
      this.playerView.feetY(1) - player.body.height / 2,
    );
    this.chunkBorders = this.add.graphics().setDepth(Depth.debug);

    this.input.keyboard?.on(`keydown-${DEBUG_KEYS.toggleOverlay}`, (e: KeyboardEvent) => {
      e.preventDefault(); // F3 is "find" in some browsers.
      this.debugOpen = !this.debugOpen;
      if (!this.debugOpen) this.bridge.set({ debug: null });
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.sim.events.clear();
      this.bridge.set({ debug: null });
    });
    this.bridge.set({ screen: 'game' });
  }

  override update(_time: number, delta: number): void {
    const start = performance.now();

    this.inputMapper.update();
    this.sim.update(delta);

    const alpha = this.sim.alpha;
    const body = this.sim.player.body;
    this.playerView.update(alpha, delta / 1000);
    this.cameraDirector.update(
      this.playerView.feetX(alpha),
      this.playerView.feetY(alpha) - body.height / 2,
      body.vx,
      body.vy,
      delta / 1000,
    );

    const cam = this.cameras.main;
    this.view.x = cam.scrollX;
    this.view.y = cam.scrollY;
    this.view.width = cam.width;
    this.view.height = cam.height;
    this.chunks.update(this.view);

    this.timer.add(performance.now() - start);
    this.updateDebug(delta);
  }

  /** Read by Playwright and the console. */
  probe(): GameProbe {
    const { player } = this.sim;
    return {
      steps: this.sim.steps,
      playerX: player.body.x + player.body.width / 2,
      playerY: player.body.y + player.body.height,
      onGround: player.onGround,
      chunksLoaded: this.chunks.stats.loaded,
      lateChunkLoads: this.chunks.stats.lateLoads,
      chunkUnloads: this.chunks.stats.unloads,
      frameCpuAvgMs: this.timer.avg,
      frameCpuMaxMs: this.timer.max,
    };
  }

  get simulation(): Simulation {
    return this.sim;
  }

  private updateDebug(deltaMs: number): void {
    this.debugAccumulator += deltaMs;
    const refreshMs = 1000 / DEBUG.overlayRefreshHz;
    if (this.debugAccumulator >= refreshMs) {
      this.debugAccumulator = 0;
      this.timer.roll();
      if (this.debugOpen) this.publishDebug();
    }

    this.chunkBorders.clear();
    if (!this.debugOpen) return;
    this.chunkBorders.lineStyle(1, PALETTE.rose[3], 0.9);
    this.chunks.forEachLoaded((x, y, size) => this.chunkBorders.strokeRect(x, y, size, size));
  }

  private publishDebug(): void {
    this.drawCalls ??= new DrawCallCounter(this.game);
    const { player, world } = this.sim;
    const tileX = Math.floor((player.body.x + player.body.width / 2) / TILE_SIZE);
    const tileY = Math.floor((player.body.y + player.body.height - 1) / TILE_SIZE);
    this.bridge.set({
      debug: {
        fps: this.game.loop.actualFps,
        drawCalls: this.drawCalls.lastFrame,
        frameCpuAvgMs: this.timer.avg,
        frameCpuMaxMs: this.timer.max,
        chunksLoaded: this.chunks.stats.loaded,
        lateChunkLoads: this.chunks.stats.lateLoads,
        entities: this.sim.entityCount,
        playerTileX: tileX,
        playerTileY: tileY,
        chunkX: Math.floor(tileX / world.chunkSize),
        chunkY: Math.floor(tileY / world.chunkSize),
        light: '— (M3)',
        biome: '— (M4)',
        gloam: '— (M7)',
      },
    });
    this.timer.resetMax();
  }
}
