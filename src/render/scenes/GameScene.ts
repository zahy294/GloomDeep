import * as Phaser from 'phaser';
import {
  CHUNK_RENDER,
  DEBUG,
  FEEDBACK,
  LUMEN,
  PLAYER,
  TEST_WORLD,
  TILE_SIZE,
  WORLD,
} from '../../config';
import { NAMED_TIMES } from '../../data/dayCycle';
import { itemById } from '../../data/items';
import { lensByKey } from '../../data/lenses';
import { loadSettings, qualityFeatures } from '../../settings';
import { LANTERN_HAND } from '../../sim/systems/LightSystem';
import {
  createLightWorker,
  InlineLightBackend,
  WorkerLightBackend,
} from '../../workers/lighting/backends';
import type { LightBackend } from '../../workers/lighting/lightJob';
import { DEBUG_KEYS, UI_KEYS } from '../../data/keybindings';
import { PALETTE } from '../../data/palette';
import type { DebugParams } from '../../debugParams';
import { Simulation } from '../../sim/Simulation';
import { findOpenFeetRow } from '../../sim/world/queries';
import type { GameProbe } from '../../types/window';
import type { InventoryView, UiBridge } from '../../ui/bridge';
import { generateTestWorld } from '../../workers/worldgen/testWorld';
import { CameraDirector } from '../CameraDirector';
import { ChunkRenderer, type PreloadBudget } from '../ChunkRenderer';
import { GlowRenderer } from '../GlowRenderer';
import { LightMapRenderer } from '../LightMapRenderer';
import { Depth } from '../depth';
import { DrawCallCounter } from '../drawCallCounter';
import { DropRenderer } from '../DropRenderer';
import { InputMapper } from '../InputMapper';
import { ParticleFX } from '../ParticleFX';
import { PlayerRenderer, type PlayerActivity } from '../PlayerRenderer';
import { TileCursor } from '../TileCursor';
import type { GlowScene } from './GlowScene';
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
  private walls!: ChunkRenderer;
  private cursor!: TileCursor;
  private dropView!: DropRenderer;
  private fx!: ParticleFX;
  private inventoryOpen = false;
  private cameraDirector!: CameraDirector;
  private playerView!: PlayerRenderer;
  private chunkBorders!: Phaser.GameObjects.Graphics;
  private lightMap!: LightMapRenderer;
  private glow!: GlowRenderer;
  private glowScene!: GlowScene;
  private lightBackend: LightBackend | null = null;
  private drawCalls: DrawCallCounter | null = null;
  private debugOpen = false;
  private debugAccumulator = 0;
  private readonly timer = new FrameTimer();
  private readonly view = { x: 0, y: 0, width: 0, height: 0 };
  private readonly preloadBudget: PreloadBudget = { remaining: 0 };
  private readonly activity: PlayerActivity = { use: 'none', aimX: 0, aimY: 0 };

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
      seed,
      lightBackend: this.createLightBackend(),
      startDayFraction: this.params.time ? NAMED_TIMES[this.params.time] : undefined,
    });
    this.inventoryOpen = false;
    this.debugOpen = this.params.debugOverlay;
    this.debugAccumulator = 0;
  }

  create(): void {
    const { world, player } = this.sim;
    // The sky is its own scene, drawn first. This camera composites into its own framebuffer with
    // a transparent background, so the multiply light map only darkens what the world draws.
    this.cameras.main.setForceComposite(true);
    // Sky is registered before Game in main.ts, so it renders first (underneath).
    this.scene.launch(SceneKey.Sky, { source: this.sim });
    this.scene.launch(SceneKey.Glow);
    this.glowScene = this.scene.get(SceneKey.Glow) as GlowScene;
    const quality = loadSettings(
      this.params.quality ? { quality: this.params.quality } : {},
    ).quality;

    const sim = this.sim;
    this.inputMapper = new InputMapper(this, sim.input, (command) => sim.enqueue(command));
    this.walls = new ChunkRenderer(this, world, sim.events, {
      layer: 'bg',
      textureKey: TextureKey.walls,
      depth: Depth.backgroundWalls,
    });
    this.chunks = new ChunkRenderer(this, world, sim.events, {
      layer: 'fg',
      textureKey: TextureKey.tiles,
      depth: Depth.foregroundTiles,
    });
    this.playerView = new PlayerRenderer(this, player, TextureKey.sprites);
    this.cursor = new TileCursor(this, sim.events, sim.input, player, TextureKey.cracks);
    this.dropView = new DropRenderer(this, sim.drops, TextureKey.tiles);
    this.fx = new ParticleFX(
      this,
      sim.events,
      sim.mining,
      (layer, x, y) => world.getLayer(layer, x, y),
      TextureKey.particle,
      () => this.cameraDirector.shake(FEEDBACK.breakShakeAmplitude, FEEDBACK.breakShakeDuration),
    );
    this.cameraDirector = new CameraDirector(
      this.cameras.main,
      world.width * TILE_SIZE,
      world.height * TILE_SIZE,
    );
    this.cameraDirector.snapTo(
      this.playerView.feetX(1),
      this.playerView.feetY(1) - player.body.height / 2,
    );
    this.lightMap = new LightMapRenderer(this, world, sim.events);
    this.glow = new GlowRenderer(
      this.glowScene,
      world,
      player,
      TextureKey.glow,
      qualityFeatures(quality).glow,
    );
    this.chunkBorders = this.add.graphics().setDepth(Depth.debug);

    this.input.keyboard?.on(`keydown-${DEBUG_KEYS.toggleOverlay}`, (e: KeyboardEvent) => {
      e.preventDefault(); // F3 is "find" in some browsers.
      this.debugOpen = !this.debugOpen;
      if (!this.debugOpen) this.bridge.set({ debug: null });
    });
    this.input.keyboard?.on(`keydown-${DEBUG_KEYS.cycleTime}`, () => {
      const times = Object.values(NAMED_TIMES);
      const next = times.find((t) => t > sim.dayFraction + 1e-3) ?? times[0] ?? 0;
      sim.enqueue({ type: 'setDayFraction', value: next });
    });
    this.input.keyboard?.on(`keydown-${UI_KEYS.toggleInventory}`, () => {
      this.inventoryOpen = !this.inventoryOpen;
      if (!this.inventoryOpen) this.setPointerOverUi(false); // the panel may close under the cursor
      this.bridge.set({ inventoryOpen: this.inventoryOpen });
    });

    // UI → simulation commands (the UI never touches game state itself).
    const offCommands = [
      this.bridge.commands.on('selectSlot', ({ slot }) =>
        sim.enqueue({ type: 'selectSlot', slot }),
      ),
      this.bridge.commands.on('swapSlots', ({ a, b }) => sim.enqueue({ type: 'swapSlots', a, b })),
      this.bridge.commands.on('pointerOverUi', ({ over }) => this.setPointerOverUi(over)),
    ];
    sim.events.on('inventoryChanged', () => this.publishInventory());

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      for (const off of offCommands) off();
      this.chunks.destroy();
      this.walls.destroy();
      this.cursor.destroy();
      this.fx.destroy();
      this.lightMap.destroy();
      this.lightBackend?.destroy?.();
      this.scene.stop(SceneKey.Sky);
      this.scene.stop(SceneKey.Glow);
      sim.events.clear();
      this.bridge.set({ debug: null, inventory: null, inventoryOpen: false, hud: null });
    });
    this.bridge.set({ screen: 'game', inventoryOpen: false });
    this.publishInventory();
  }

  override update(_time: number, delta: number): void {
    const start = performance.now();

    this.inputMapper.update();
    this.sim.update(delta);

    const alpha = this.sim.alpha;
    const body = this.sim.player.body;
    const input = this.sim.input;
    this.activity.use = this.sim.mining.active
      ? 'mine'
      : input.isHeld('useAlt') && this.inputMapper.pointerEnabled
        ? 'place'
        : 'none';
    this.activity.aimX = input.aimX;
    this.activity.aimY = input.aimY;
    this.playerView.update(alpha, delta / 1000, this.activity);
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
    this.preloadBudget.remaining = CHUNK_RENDER.maxPreloadsPerFrame;
    this.chunks.update(this.view, this.preloadBudget);
    this.walls.update(this.view, this.preloadBudget);
    this.cursor.update();
    this.dropView.update(alpha);
    this.fx.update(delta / 1000);
    // The light grid is computed around what the camera shows.
    input.setFocus(cam.scrollX + cam.width / 2, cam.scrollY + cam.height / 2);
    this.lightMap.update();
    const facing = this.sim.player.facing;
    if (this.glowScene.sys.isActive()) this.glowScene.follow(cam);
    this.glow.update(
      this.view,
      this.sim.time,
      this.playerView.feetX(alpha) + LANTERN_HAND.x * facing,
      this.playerView.feetY(alpha) + LANTERN_HAND.y,
    );

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
      selectedSlot: this.sim.inventory.selected,
      inventory: this.sim.inventory.slots.map((s) =>
        s ? { itemId: s.itemId, count: s.count } : null,
      ),
      drops: this.sim.drops.length,
      cameraX: this.cameras.main.scrollX,
      cameraY: this.cameras.main.scrollY,
      dayFraction: this.sim.dayFraction,
      lightAvgMs: this.sim.light.stats.avgMs,
      lightUpdates: this.sim.light.stats.updates,
      lumen: player.lumen,
    };
  }

  /** Pushes an inventory snapshot to the UI. Runs on change only, never per frame. */
  private publishInventory(): void {
    const inv = this.sim.inventory;
    const view: InventoryView = {
      slots: inv.slots.map((s) =>
        s ? { itemId: s.itemId, count: s.count, name: itemById(s.itemId)?.name ?? '?' } : null,
      ),
      selected: inv.selected,
      hotbarSize: inv.hotbarSize,
    };
    this.bridge.set({ inventory: view });
  }

  private setPointerOverUi(over: boolean): void {
    this.inputMapper.pointerEnabled = !over;
    this.cursor.visible = !over;
  }

  /** Starts a fresh CPU-time measurement window (e.g. after the initial world load). */
  resetFrameStats(): void {
    this.timer.resetMax();
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
      this.publishHud();
    }

    this.chunkBorders.clear();
    if (!this.debugOpen) return;
    this.chunkBorders.lineStyle(1, PALETTE.rose[3], 0.9);
    this.chunks.forEachLoaded((x, y, size) => this.chunkBorders.strokeRect(x, y, size, size));
  }

  private publishHud(): void {
    const { player, dayFraction } = this.sim;
    const minutes = Math.floor(dayFraction * 24 * 60);
    const clock = `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
    const hud = this.bridge.state.hud;
    const lumen = Math.round(player.lumen);
    if (hud && hud.lumen === lumen && hud.lanternOn === player.lanternOn && hud.clock === clock) {
      return;
    }
    this.bridge.set({
      hud: {
        lumen,
        lumenMax: LUMEN.max,
        lanternOn: player.lanternOn,
        lensName: lensByKey(player.lens).name,
        clock,
      },
    });
  }

  /** Light at the tile the player's body is in, plus the average light-job time. */
  private lightText(tileX: number, tileY: number): string {
    const { world, light } = this.sim;
    const i = Math.max(0, tileY - 1) * world.width + tileX;
    const rgb = `${world.lightR[i] ?? 0},${world.lightG[i] ?? 0},${world.lightB[i] ?? 0}`;
    return `${rgb} · ${light.stats.avgMs.toFixed(2)} ms avg`;
  }

  /** Light jobs run in a Web Worker; fall back to the main thread if workers are unavailable. */
  private createLightBackend(): LightBackend {
    try {
      this.lightBackend = new WorkerLightBackend(createLightWorker());
    } catch (error) {
      console.warn('Light worker unavailable; lighting runs on the main thread', error);
      this.lightBackend = new InlineLightBackend();
    }
    return this.lightBackend;
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
        light: this.lightText(tileX, tileY),
        biome: '— (M4)',
        gloam: '— (M7)',
      },
    });
    this.timer.resetMax();
  }
}
