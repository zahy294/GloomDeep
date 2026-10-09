import * as Phaser from 'phaser';
import {
  CHUNK_RENDER,
  DEBUG,
  FEEDBACK,
  LUMEN,
  PLAYER,
  SAVE,
  TILE_SIZE,
  WORLD_SIZES,
  CAMERA,
  HEALTH,
  GLOAM,
  COMBAT_VIEW,
  MATERIALS_VIEW,
} from '../../config';
import { ENEMIES } from '../../data/enemies';
import { createEnemy } from '../../sim/entities/Enemy';
import { NAMED_TIMES } from '../../data/dayCycle';
import { DEBUG_KITS, itemById } from '../../data/items';
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
import { Simulation, type SimulationRuntimeOptions } from '../../sim/Simulation';
import { findOpenFeetRow } from '../../sim/world/queries';
import type { GameProbe } from '../../types/window';
import type { IconRect, InventoryView, UiBridge } from '../../ui/bridge';
import { pickaxeForTier, withArticle } from '../../ui/craftingHelpers';
import { generateWorld } from '../../workers/worldgen/generateWorld';
import type { GameStart } from '../../flow/WorldFlow';
import { SAVE_VERSION } from '../../persistence/saveFormat';
import { biomeAt } from '../../sim/world/biomeAt';
import { findDebugSpawn } from '../../sim/world/debugSpawn';
import type { SaveState, WorldMeta } from '../../sim/world/worldData';
import { CameraDirector } from '../CameraDirector';
import { ChunkRenderer, type PreloadBudget } from '../ChunkRenderer';
import { liquidFrame } from '../liquidFrames';
import { VisualState } from '../VisualState';
import { CameraGrade } from '../CameraGrade';
import { AudioDirector } from '../../audio/AudioDirector';
import { VISUALS } from '../biomeBlend';
import { GlowRenderer } from '../GlowRenderer';
import { LightMapRenderer } from '../LightMapRenderer';
import { Depth } from '../depth';
import { DrawCallCounter } from '../drawCallCounter';
import { DropRenderer } from '../DropRenderer';
import { FoliageRenderer } from '../FoliageRenderer';
import { WeatherParticles } from '../WeatherParticles';
import { PoolReflections } from '../PoolReflections';
import { Waterfalls } from '../Waterfalls';
import { InputMapper } from '../InputMapper';
import { ParticleFX } from '../ParticleFX';
import { PlayerRenderer, type PlayerActivity } from '../PlayerRenderer';
import { TileCursor } from '../TileCursor';
import type { FrontScene } from './FrontScene';
import type { GlowScene } from './GlowScene';
import { ATLAS_PIXEL_SIZE, framePixelOffset, itemIcon } from '../itemIcons';
import { gloamCoverage, gloamFrame } from '../gloamFrames';
import { LightEffects } from '../LightEffects';
import { MaterialsRenderer } from '../MaterialsRenderer';
import { CombatRenderer } from '../CombatRenderer';
import { selectedWeapon } from '../../sim/systems/CombatSystem';
import { ownedLenses } from '../../sim/systems/LensSystem';
import { PackFile, SceneKey, TextureKey } from './keys';
import { ITEMS } from '../../data/items';

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

/** What the game scene needs from the world flow (src/flow/WorldFlow.ts). */
export interface GameHost {
  save(state: SaveState): Promise<void>;
  /** Leaves the game for the world list. */
  quitToWorlds(): Promise<void>;
}

/** The in-game scene: runs the simulation and draws the world around the camera. */
export class GameScene extends Phaser.Scene {
  private sim!: Simulation;
  private inputMapper!: InputMapper;
  private chunks!: ChunkRenderer;
  private walls!: ChunkRenderer;
  private foliage!: FoliageRenderer;
  private weatherFx!: WeatherParticles;
  private liquids!: ChunkRenderer;
  private gloamOverlay!: ChunkRenderer;
  private lightEffects!: LightEffects;
  private materials!: MaterialsRenderer;
  /** Liquid surface ripple phase, advanced every MATERIALS_VIEW.waveSeconds. */
  private waveTick = 0;
  private waveTimer = 0;
  private reflections!: PoolReflections;
  private waterfalls!: Waterfalls;
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
  private frontScene!: FrontScene;
  /** Atmosphere state shared with the sky, glow and front scenes (biome blend, weather, time). */
  private visual!: VisualState;
  private audio: AudioDirector | null = null;
  private grade!: CameraGrade;
  private lightBackend: LightBackend | null = null;
  private drawCalls: DrawCallCounter | null = null;
  private debugOpen = false;
  private debugAccumulator = 0;
  private readonly timer = new FrameTimer();
  private readonly view = { x: 0, y: 0, width: 0, height: 0 };
  private readonly preloadBudget: PreloadBudget = { remaining: 0 };
  private readonly foliageBudget: PreloadBudget = { remaining: 0 };
  private readonly activity: PlayerActivity = {
    use: 'none',
    swing: 0,
    invulnerable: false,
    dead: false,
    aimX: 0,
    aimY: 0,
    tool: null,
  };
  private combatView!: CombatRenderer;
  /** Null for debug starts, which are never saved. */
  private meta: WorldMeta | null = null;
  private paused = false;
  private quitting = false;
  /** Seconds played this session (unpaused), added to meta.playTime on save. */
  private sessionSeconds = 0;
  private autosaveTimer = 0;
  private saving: Promise<void> | null = null;
  /** A newly generated world is saved as soon as the scene is up. */
  private saveOnStart = false;
  /** Station keys last published to the UI, joined (re-published when they change). */
  private stationsKey = '';
  private noticeId = 0;
  /** Active lens and owned lenses last sent to the HUD. */
  private hudLensKey = '';
  /** The current mouse press threw a held stack (see POINTER_DOWN in create). */
  private throwPress = false;

  constructor(
    private readonly bridge: UiBridge,
    private readonly params: DebugParams,
    private readonly host: GameHost | null,
  ) {
    super(SceneKey.Game);
  }

  init(data: Partial<GameStart>): void {
    // Fresh state on every (re)start; the constructor only runs once. Boot starts this scene
    // without data for `?scene=game`: that is a debug world that is never saved.
    const start: GameStart = data.kind ? (data as GameStart) : { kind: 'debug' };
    const startDayFraction = this.params.time ? NAMED_TIMES[this.params.time] : undefined;
    const runtime = {
      lightBackend: this.createLightBackend(),
      startDayFraction,
      spawns: this.params.spawns,
    };
    if (start.kind === 'new') {
      this.meta = start.meta;
      this.sim = Simulation.fromGenerated(start.world, { ...runtime, seed: start.meta.seed });
    } else if (start.kind === 'saved') {
      this.meta = start.save.meta;
      // A saved world keeps its own time of day unless `?time=` overrides it.
      this.sim = Simulation.fromSave(start.save, { ...runtime, seed: start.save.meta.seed });
      if (startDayFraction !== undefined) this.sim.setDayFraction(startDayFraction);
    } else {
      this.meta = null;
      this.sim = this.createDebugSimulation(runtime);
    }
    // `?kit=` adds a debug kit to new and debug worlds (never to a saved world).
    const kit = this.params.kit ? DEBUG_KITS[this.params.kit] : undefined;
    if (kit && start.kind !== 'saved') this.sim.giveItems(kit);
    // The world now lives in the simulation (loadArrays copies). Drop the scene manager's reference
    // to the start data, or the generated/saved arrays (tens of MB) stay alive for the session.
    this.sys.settings.data = {};
    this.paused = false;
    this.quitting = false;
    this.sessionSeconds = 0;
    this.autosaveTimer = 0;
    this.saving = null;
    this.saveOnStart = start.kind === 'new';
    this.inventoryOpen = false;
    this.stationsKey = '';
    this.throwPress = false;
    this.debugOpen = this.params.debugOverlay;
    this.debugAccumulator = 0;
  }

  create(): void {
    const { world, player } = this.sim;
    // The sky is its own scene, drawn first. This camera composites into its own framebuffer with
    // a transparent background, so the multiply light map only darkens what the world draws.
    this.cameras.main.setForceComposite(true);
    // Sky is registered before Game in main.ts, so it renders first (underneath).
    const quality = loadSettings(
      this.params.quality ? { quality: this.params.quality } : {},
    ).quality;
    this.visual = new VisualState(qualityFeatures(quality));
    this.visual.update(this.sim, this.cameras.main, 0, 0, 0);
    // Before the Sky and Front scenes launch: they attach their cameras through CameraGrade.of.
    this.grade = new CameraGrade(this, this.visual);
    this.scene.launch(SceneKey.Sky, { source: this.sim, visual: this.visual });
    this.scene.launch(SceneKey.Glow, { visual: this.visual });
    this.glowScene = this.scene.get(SceneKey.Glow) as GlowScene;
    this.glowScene.attachWorld(this.sim.world, this.sim.events);
    this.scene.launch(SceneKey.Front, { visual: this.visual });
    this.frontScene = this.scene.get(SceneKey.Front) as FrontScene;
    this.audio = this.createAudio();

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
    // Liquids are static until they flow (M9), so tile edits never need to refresh this layer.
    this.liquids = new ChunkRenderer(this, world, sim.events, {
      layer: null,
      frameAt: (x, y) => liquidFrame(world, x, y, this.waveTick),
      textureKey: TextureKey.liquids,
      depth: Depth.liquids,
    });
    this.gloamOverlay = new ChunkRenderer(this, world, sim.events, {
      layer: null,
      frameAt: (x, y) => gloamFrame(world, x, y),
      textureKey: TextureKey.gloam,
      depth: Depth.gloam,
    });
    sim.events.on('gloamUpdated', ({ x0, y0, width, height }) =>
      this.gloamOverlay.refreshRect(x0, y0, width, height),
    );
    this.reflections = new PoolReflections(this, world, this.visual.features.reflections);
    this.waterfalls = new Waterfalls(
      this,
      world,
      sim.events,
      TextureKey.waterfall,
      TextureKey.particle,
      TextureKey.glow,
    );
    this.foliage = new FoliageRenderer(this, world, sim.events, TextureKey.sprites, Depth.foliage);
    this.weatherFx = new WeatherParticles(this, world, TextureKey.sprites);
    this.playerView = new PlayerRenderer(this, player, TextureKey.sprites);
    this.cursor = new TileCursor(this, sim.events, sim.input, player, TextureKey.cracks);
    this.dropView = new DropRenderer(this, sim.drops);
    // A click in the world while holding a stack from the inventory throws it. That press must
    // not go on to mine or place once the stack is gone: the mouse stays blocked until released.
    this.input.on(Phaser.Input.Events.POINTER_DOWN, () => {
      if (this.inventoryOpen && sim.inventory.cursor && this.inputMapper.pointerEnabled) {
        sim.enqueue({ type: 'dropCursor' });
        this.throwPress = true;
      }
    });
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
    // Sample the blend around the player first, so the snap's surface lift is right underground.
    const cam = this.cameras.main;
    this.visual.update(
      this.sim,
      {
        scrollX: this.playerView.feetX(1) - cam.width / 2,
        scrollY: this.playerView.feetY(1) - cam.height / 2,
        width: cam.width,
        height: cam.height,
      },
      this.playerView.feetX(1),
      this.playerView.feetY(1),
      0,
    );
    this.visual.jumpNext();
    this.cameraDirector.snapTo(
      this.playerView.feetX(1),
      this.playerView.feetY(1) - player.body.height / 2 - CAMERA.surfaceLift * this.visual.outdoors,
    );
    this.visual.jumpNext(); // the camera is now where the game starts
    this.lightMap = new LightMapRenderer(this, world, sim.events);
    this.lightEffects = new LightEffects(this, this.glowScene, sim.events, sim.flares);
    this.materials = new MaterialsRenderer(
      this,
      this.glowScene,
      sim.events,
      world,
      sim.fire,
      sim.falling.blocks,
    );
    sim.events.on('liquidChanged', ({ x0, y0, width, height }) =>
      this.liquids.refreshRect(x0, y0, width, height),
    );
    this.combatView = new CombatRenderer(
      this,
      this.glowScene,
      sim.events,
      sim.enemies,
      sim.projectiles,
    );
    sim.events.on('playerHurt', () =>
      this.cameraDirector.shake(COMBAT_VIEW.hurtShake, COMBAT_VIEW.hurtShakeSeconds),
    );
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
    this.input.keyboard?.on(`keydown-${UI_KEYS.pause}`, () => {
      if (this.inventoryOpen) this.toggleInventory();
      else this.setPaused(!this.paused);
    });
    this.input.keyboard?.on(`keydown-${UI_KEYS.toggleInventory}`, () => {
      if (!this.paused) this.toggleInventory();
    });
    const onVisibility = () => {
      if (document.visibilityState !== 'hidden' || this.quitting) return;
      this.saveNow().catch((error: unknown) => console.error('Save on hide failed', error));
    };
    document.addEventListener('visibilitychange', onVisibility);

    // UI → simulation commands (the UI never touches game state itself).
    const offCommands = [
      this.bridge.commands.on('selectSlot', ({ slot }) =>
        sim.enqueue({ type: 'selectSlot', slot }),
      ),
      this.bridge.commands.on('slotClick', ({ slot, button, quick }) =>
        sim.enqueue({ type: 'slotClick', slot, button, quick }),
      ),
      this.bridge.commands.on('sortInventory', () => sim.enqueue({ type: 'sortInventory' })),
      this.bridge.commands.on('dropCursor', () => sim.enqueue({ type: 'dropCursor' })),
      this.bridge.commands.on('craft', ({ recipe, times }) =>
        sim.enqueue({ type: 'craft', recipe, times }),
      ),
      this.bridge.commands.on('pointerOverUi', ({ over }) => this.setPointerOverUi(over)),
      this.bridge.commands.on('resume', () => this.setPaused(false)),
      this.bridge.commands.on('saveAndQuit', () => void this.saveAndQuit()),
    ];
    sim.events.on('inventoryChanged', () => this.publishInventory());
    sim.events.on('miningBlocked', ({ reason, tier }) => {
      const pick = pickaxeForTier(tier);
      if (reason === 'support') this.notify('Something stands on that block');
      else this.notify(pick ? `Needs ${withArticle(pick)}` : 'Too hard to mine');
    });
    sim.events.on('crafted', ({ itemId, count }) =>
      this.notify(`Crafted ${count > 1 ? `${count} × ` : ''}${itemById(itemId)?.name ?? '?'}`),
    );

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      document.removeEventListener('visibilitychange', onVisibility);
      for (const off of offCommands) off();
      this.chunks.destroy();
      this.walls.destroy();
      this.liquids.destroy();
      this.gloamOverlay.destroy();
      this.lightEffects.destroy();
      this.materials.destroy();
      this.combatView.destroy();
      this.foliage.destroy();
      this.reflections.destroy();
      this.waterfalls.destroy();
      this.weatherFx.destroy();
      this.cursor.destroy();
      this.fx.destroy();
      this.lightMap.destroy();
      this.audio?.destroy();
      this.lightBackend?.destroy?.();
      this.scene.stop(SceneKey.Sky);
      this.scene.stop(SceneKey.Glow);
      this.scene.stop(SceneKey.Front);
      sim.events.clear();
      this.bridge.set({
        debug: null,
        inventory: null,
        inventoryOpen: false,
        hud: null,
        notice: null,
        respawnIn: null,
        paused: false,
      });
    });
    this.bridge.set({
      screen: 'game',
      inventoryOpen: false,
      paused: false,
      error: null,
      notice: null,
      icons: this.iconRects(),
    });
    this.publishInventory();
    // A new world is saved straight away, so it is in the list even if the tab closes now.
    if (this.saveOnStart) {
      this.saveNow().catch((error: unknown) => console.error('First save failed', error));
    }
  }

  private toggleInventory(): void {
    this.inventoryOpen = !this.inventoryOpen;
    if (!this.inventoryOpen) {
      this.setPointerOverUi(false); // the panel may close under the cursor
      this.sim.enqueue({ type: 'stowCursor' }); // a held stack goes back into the bag
    }
    this.bridge.set({ inventoryOpen: this.inventoryOpen });
  }

  /** Shows a short message above the hotbar (it fades by itself). */
  private notify(text: string): void {
    this.bridge.set({ notice: { text, id: ++this.noticeId } });
  }

  /**
   * Where each item's icon sits in the pack images, for the DOM UI: the tile atlas for blocks
   * and stations, the sprite atlas (frames from sprites.json) for dedicated item icons.
   */
  private iconRects(): (IconRect | null)[] {
    const packDir = this.bridge.state.packDir;
    const sprites = this.textures.get(TextureKey.sprites);
    const source = sprites.source[0];
    return ITEMS.map((item) => {
      const icon = itemIcon(item.id);
      if (!icon) return null;
      if (icon.texture === TextureKey.tiles) {
        const { x, y } = framePixelOffset(icon.frame);
        return {
          url: `${packDir}/${PackFile.tiles}`,
          x,
          y,
          sheetWidth: ATLAS_PIXEL_SIZE.width,
          sheetHeight: ATLAS_PIXEL_SIZE.height,
        };
      }
      if (!sprites.has(icon.frame) || !source) return null;
      const frame = sprites.get(icon.frame);
      return {
        url: `${packDir}/${PackFile.sprites}`,
        x: frame.cutX,
        y: frame.cutY,
        sheetWidth: source.width,
        sheetHeight: source.height,
      };
    });
  }

  /**
   * Procedural ambience and music (plan 3.6) through Phaser's Web Audio context, so Phaser's
   * global volume and mute apply. None without Web Audio (the game stays silent).
   */
  private createAudio(): AudioDirector | null {
    const sound = this.sound;
    if (!(sound instanceof Phaser.Sound.WebAudioSoundManager)) return null;
    const audio = new AudioDirector(sound.context, sound.masterVolumeNode, VISUALS);
    const events = this.sim.events;
    events.on('lightning', () => audio.thunder());
    events.on('attackStarted', ({ kind }) =>
      audio.effect(kind === 'melee' ? 'swing' : kind === 'ranged' ? 'shoot' : 'beam'),
    );
    events.on('enemyHit', ({ source }) => {
      if (source !== 'light') audio.effect('hit');
    });
    events.on('enemyDied', ({ type }) =>
      audio.effect(ENEMIES[type]?.ai === 'shade' ? 'dissolve' : 'kill'),
    );
    events.on('playerHurt', () => audio.effect('hurt'));
    events.on('playerRespawned', () => audio.effect('respawn'));
    events.on('splash', () => audio.effect('splash'));
    events.on('liquidReaction', () => audio.effect('hiss'));
    events.on('blockLanded', () => audio.effect('thud'));
    // One crackle per burst of ignitions, not one per burning cell.
    let lastIgnite = -Infinity;
    events.on('fireStarted', () => {
      if (this.sim.time - lastIgnite < MATERIALS_VIEW.igniteSoundGap) return;
      lastIgnite = this.sim.time;
      audio.effect('ignite');
    });
    return audio;
  }

  private setPaused(paused: boolean): void {
    if (this.quitting || paused === this.paused) return;
    this.paused = paused;
    this.audio?.setPaused(paused);
    // Keys held when the menu opened must not stay "held" while paused or after resuming.
    this.sim.input.releaseAll();
    this.bridge.set({ paused, error: null });
  }

  /**
   * Saves the world (plan 3.5). Saves never overlap: a request during a save waits for it and
   * then saves the newer state. Debug worlds are never saved.
   */
  private async saveNow(): Promise<void> {
    if (!this.host || !this.meta) return;
    while (this.saving) await this.saving.catch(() => {});
    this.meta = {
      ...this.meta,
      lastPlayed: Date.now(),
      playTime: this.meta.playTime + this.sessionSeconds,
    };
    this.sessionSeconds = 0;
    this.autosaveTimer = 0;
    // toSaveState returns live views; host.save encodes them before it first yields.
    const saving = this.host.save(this.sim.toSaveState(this.meta, SAVE_VERSION));
    this.saving = saving;
    try {
      await saving;
    } finally {
      if (this.saving === saving) this.saving = null;
    }
  }

  private async saveAndQuit(): Promise<void> {
    if (this.quitting) return;
    this.quitting = true;
    try {
      await this.saveNow();
      await this.host?.quitToWorlds();
      if (!this.host) this.scene.start(SceneKey.Title);
    } catch (error) {
      console.error('Saving failed', error);
      this.quitting = false;
      this.bridge.set({
        error: `Saving failed: ${error instanceof Error ? error.message : error}`,
      });
    }
  }

  override update(_time: number, delta: number): void {
    if (this.paused || this.quitting) return;
    const start = performance.now();
    if (this.meta) {
      this.sessionSeconds += delta / 1000;
      this.autosaveTimer += delta / 1000;
      if (this.autosaveTimer >= SAVE.autosaveSeconds && !this.saving) {
        this.saveNow().catch((error: unknown) => console.error('Autosave failed', error));
      }
    }

    // While the inventory holds a stack on the cursor, world clicks throw it instead of mining.
    if (this.throwPress && !this.input.activePointer.isDown) this.throwPress = false;
    this.inputMapper.mouseBlocked =
      this.throwPress || (this.inventoryOpen && this.sim.inventory.cursor !== null);
    this.inputMapper.update();
    this.sim.update(delta);

    const alpha = this.sim.alpha;
    const body = this.sim.player.body;
    const input = this.sim.input;
    const { combat, player } = this.sim;
    const weapon = selectedWeapon(this.sim.inventory);
    const swinging = combat.swingDuration > 0;
    const aiming = weapon !== null && weapon.kind !== 'melee' && input.isHeld('useItem');
    this.activity.use = swinging
      ? 'attack'
      : aiming
        ? 'aim'
        : this.sim.mining.active
          ? 'mine'
          : input.isHeld('useAlt') && this.inputMapper.pointerEnabled
            ? 'place'
            : 'none';
    this.activity.swing = swinging ? combat.swingTime / combat.swingDuration : 0;
    this.activity.invulnerable = player.invuln > 0;
    this.activity.dead = player.dead;
    const selected = this.sim.inventory.selectedStack;
    const toolItem = weapon && selected ? selected.itemId : this.sim.mining.toolItem;
    this.activity.tool = toolItem >= 0 ? itemIcon(toolItem) : null;
    this.activity.aimX = input.aimX;
    this.activity.aimY = input.aimY;
    this.playerView.update(alpha, delta / 1000, this.activity);
    this.cameraDirector.update(
      this.playerView.feetX(alpha),
      this.playerView.feetY(alpha) - body.height / 2 - CAMERA.surfaceLift * this.visual.outdoors,
      body.vx,
      body.vy,
      delta / 1000,
    );

    const cam = this.cameras.main;
    this.view.x = cam.scrollX;
    this.view.y = cam.scrollY;
    this.view.width = cam.width;
    this.view.height = cam.height;
    this.visual.update(
      this.sim,
      cam,
      this.playerView.feetX(alpha),
      this.playerView.feetY(alpha),
      delta / 1000,
    );
    // `?rain=` forces the rain for screenshots; it changes rendering only, never the simulation.
    if (this.params.rain !== null) this.visual.rain = this.params.rain;
    this.grade.update();
    this.preloadBudget.remaining = CHUNK_RENDER.maxPreloadsPerFrame;
    this.foliageBudget.remaining = CHUNK_RENDER.maxPreloadsPerFrame;
    this.chunks.update(this.view, this.preloadBudget);
    this.walls.update(this.view, this.preloadBudget);
    // Ripple liquid surfaces in view.
    this.waveTimer += delta / 1000;
    if (this.waveTimer >= MATERIALS_VIEW.waveSeconds) {
      this.waveTimer = 0;
      this.waveTick++;
      const vx = Math.floor(this.view.x / TILE_SIZE);
      const vy = Math.floor(this.view.y / TILE_SIZE);
      this.liquids.refreshRect(
        vx,
        vy,
        Math.ceil(this.view.width / TILE_SIZE) + 1,
        Math.ceil(this.view.height / TILE_SIZE) + 1,
      );
    }
    this.liquids.update(this.view, this.preloadBudget);
    this.gloamOverlay.update(this.view, this.preloadBudget);
    const pulse = 0.5 + 0.5 * Math.sin((this.sim.time * Math.PI * 2) / GLOAM.pulseSeconds);
    this.gloamOverlay.setAlpha(GLOAM.pulseMinAlpha + (1 - GLOAM.pulseMinAlpha) * pulse);
    this.foliage.update(
      this.view,
      this.foliageBudget,
      this.visual.wind,
      this.visual.playerX,
      this.visual.playerY,
      delta / 1000,
    );
    this.weatherFx.update(delta / 1000, this.visual);
    this.waterfalls.update(this.view, delta / 1000, this.visual.features.particleDensity);
    this.reflections.update(this.view, this.sim.time);
    this.cursor.update();
    this.dropView.update(alpha);
    this.lightEffects.update(alpha, delta / 1000, this.sim.time);
    this.materials.update(this.view, alpha, delta / 1000, this.sim.time);
    this.combatView.update(alpha, delta / 1000, this.sim.time);
    this.fx.update(delta / 1000);
    // The light grid is computed around what the camera shows.
    input.setFocus(cam.scrollX + cam.width / 2, cam.scrollY + cam.height / 2);
    this.lightMap.update();
    const facing = this.sim.player.facing;
    if (this.glowScene.sys.isActive()) this.glowScene.follow(cam);
    if (this.frontScene.sys.isActive()) this.frontScene.follow(cam);
    this.glow.update(
      this.view,
      this.sim.time,
      this.playerView.feetX(alpha) + LANTERN_HAND.x * facing,
      this.playerView.feetY(alpha) + LANTERN_HAND.y,
    );

    this.audio?.update(this.visual, this.visual.wind);
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
      health: player.health,
      dead: player.dead,
      burning: this.sim.fire.burning.size,
      falling: this.sim.falling.blocks.length,
      enemies: this.sim.enemies.map((e) => ({
        key: ENEMIES[e.type]?.key ?? '?',
        x: e.body.x + e.body.width / 2,
        y: e.body.y + e.body.height,
        health: e.health,
      })),
    };
  }

  /** Pushes an inventory snapshot to the UI. Runs on change only, never per frame. */
  private publishInventory(): void {
    const inv = this.sim.inventory;
    const stations = [...this.sim.stationsNearby()].sort();
    this.stationsKey = stations.join(',');
    const view: InventoryView = {
      slots: inv.slots.map((s) => (s ? { itemId: s.itemId, count: s.count } : null)),
      selected: inv.selected,
      hotbarSize: inv.hotbarSize,
      cursor: inv.cursor ? { itemId: inv.cursor.itemId, count: inv.cursor.count } : null,
      stations,
    };
    this.bridge.set({ inventory: view });
  }

  /** Walking up to (or away from) a station changes the crafting list: re-publish then. */
  private refreshStations(): void {
    const key = [...this.sim.stationsNearby()].sort().join(',');
    if (key !== this.stationsKey) this.publishInventory();
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
      this.refreshStations();
      // How much of the view the Gloam covers drains the colour grade (eased, a few times a second).
      const coverage = gloamCoverage(this.sim.world, this.view, TILE_SIZE);
      const target = Math.min(1, coverage / GLOAM.desaturateAtCoverage);
      this.visual.gloam += (target - this.visual.gloam) * GLOAM.coverageEase;
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
    const health = Math.round(player.health);
    const respawn = player.dead ? Math.ceil(player.respawnTimer) : null;
    if (this.bridge.state.respawnIn !== respawn) this.bridge.set({ respawnIn: respawn });
    const lensKey = ownedLenses(this.sim.inventory)
      .map((l) => l.key)
      .join(',');
    if (
      hud &&
      hud.lumen === lumen &&
      hud.health === health &&
      this.hudLensKey === `${player.lens}|${lensKey}` &&
      hud.lanternOn === player.lanternOn &&
      hud.clock === clock
    ) {
      return;
    }
    this.hudLensKey = `${player.lens}|${lensKey}`;
    const lens = lensByKey(player.lens);
    const lenses = ownedLenses(this.sim.inventory).map((l) => ({
      name: l.name,
      color: `rgb(${l.color.join(' ')})`,
      active: l.key === player.lens,
    }));
    this.bridge.set({
      hud: {
        lenses,
        health,
        healthMax: HEALTH.max,
        lumen,
        lumenMax: LUMEN.max,
        lanternOn: player.lanternOn,
        lensName: lens.name,
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

  /**
   * `?scene=game`: a real generated world (`seed=`, `size=`), never saved. The spawn can be moved
   * with `x=&y=` (tiles), `biome=<key>` or `spot=cave` for repeatable screenshots.
   */
  private createDebugSimulation(runtime: SimulationRuntimeOptions): Simulation {
    const seed = this.params.seed ?? DEBUG.defaultSeed;
    const size = WORLD_SIZES[this.params.size ?? 'medium'];
    const generated = generateWorld(size.width, size.height, seed);
    const sim = Simulation.fromGenerated(generated, { ...runtime, seed });
    const { x, y, biome, spot } = this.params;
    let feet: { x: number; y: number } | null = null;
    if (x !== null && y !== null) {
      feet = { x, y: findOpenFeetRow(sim.world, x, y, Math.ceil(PLAYER.height / TILE_SIZE)) };
    } else if (spot === 'entrance') {
      // Beside the cave mouth nearest the spawn, on the ground before it opens.
      const sx = Math.floor(generated.spawnX / TILE_SIZE);
      const mouths = generated.caveMouths ?? [];
      const mouth = mouths.reduce(
        (a, b) => (Math.abs(b - sx) < Math.abs(a - sx) ? b : a),
        mouths[0] ?? sx,
      );
      const fx = mouth + (mouth > sx ? -DEBUG.entranceStandOff : DEBUG.entranceStandOff);
      feet = { x: fx, y: sim.world.groundRow(fx) };
    } else if (biome !== null || spot !== null) {
      feet = findDebugSpawn(sim.world, { biome, spot });
      if (!feet)
        console.warn(`No debug spawn for biome=${biome} spot=${spot}; using the normal spawn`);
    }
    if (feet) {
      const p = sim.player;
      p.body.x = (feet.x + 0.5) * TILE_SIZE - p.body.width / 2;
      p.body.y = feet.y * TILE_SIZE - p.body.height;
      p.prevX = p.body.x;
      p.prevY = p.body.y;
    }
    const type = ENEMIES.findIndex((e) => e.key === this.params.enemy);
    if (type >= 0) {
      // `?enemy=` for screenshots: one creature standing a few tiles to the player's right.
      const p = sim.player.body;
      const tx = Math.floor((p.x + p.width / 2) / TILE_SIZE) + DEBUG.enemyOffsetTiles;
      const ty = findOpenFeetRow(
        sim.world,
        tx,
        Math.floor((p.y + p.height) / TILE_SIZE),
        Math.ceil((ENEMIES[type]?.height ?? TILE_SIZE) / TILE_SIZE),
      );
      sim.enemies.push(createEnemy(0, type, (tx + 0.5) * TILE_SIZE, ty * TILE_SIZE));
    }
    return sim;
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
        biome: biomeAt(world, tileX, tileY),
        gloam: `${world.gloam[world.index(tileX, Math.max(0, tileY))] ?? 0} here · ${Math.round(
          this.visual.gloam * 100,
        )}% view`,
      },
    });
    this.timer.resetMax();
  }
}
