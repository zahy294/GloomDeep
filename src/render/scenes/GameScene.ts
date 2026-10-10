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
  VILLAGE_UI,
  LIFE_VIEW,
  PHOTO,
  type PhotoPresetKey,
} from '../../config';
import { CRITTERS } from '../../data/critters';
import { prefabByKey } from '../../data/prefabs';
import { stampPrefab } from '../../sim/world/prefabs';
import { ENEMIES } from '../../data/enemies';
import { createEnemy } from '../../sim/entities/Enemy';
import { NAMED_TIMES } from '../../data/dayCycle';
import { DEBUG_KITS, itemById, STARTER_KIT } from '../../data/items';
import { lensByKey } from '../../data/lenses';
import { qualityFeatures } from '../../settings';
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
import { pickaxeForTier, sealedText, withArticle } from '../../ui/craftingHelpers';
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
import { LifeRenderer } from '../LifeRenderer';
import { TownRenderer } from '../TownRenderer';
import { TownPresenter } from '../TownPresenter';
import { BossPresenter } from '../BossPresenter';
import { BossRenderer } from '../BossRenderer';
import { downloadScaledPng, PhotoMode } from '../PhotoMode';
import { keyName, type UiKey } from '../../settings';
import { arenaSpot, beatBosses, startDimming, startFight, wardSpot } from '../../sim/debugBosses';
import type { SfxKind } from '../../data/audio';
import type { SimEvents } from '../../sim/events';

/** The sound for each boss-fight moment (M12). */
const BOSS_ACTION_SOUND: Record<SimEvents['bossAction']['kind'], SfxKind> = {
  stunned: 'stun',
  flood: 'flood',
  drain: 'drain',
  slam: 'slam',
  prism: 'prism',
  nodeLit: 'nodeLit',
  nodeChoked: 'nodeChoked',
  volley: 'bossVolley',
  cracked: 'stun',
};
import {
  besideResident,
  lightRoads,
  relightDistricts,
  startFestival,
  townSpot,
} from '../../sim/debugTowns';
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
  private lifeView!: LifeRenderer;
  private townView!: TownRenderer;
  private townUi!: TownPresenter;
  private bossUi!: BossPresenter;
  private bossView!: BossRenderer;
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
  /** The M11 HUD fields last sent (glimmer, town, escort), as JSON. */
  private hudTownKey = '';
  /** Who is talking (npc id) and the beacon whose travel list is open (tiles), or -1/null. */
  private talkingTo = -1;
  private travelFrom: { x: number; y: number } | null = null;
  private dialogueId = 0;
  /** The current mouse press threw a held stack (see POINTER_DOWN in create). */
  private throwPress = false;
  /** A brand-new world: point the player at the guide once it has loaded. */
  private welcome = false;
  private guideOpen = false;
  private photo!: PhotoMode;
  /** The key bindings the input mapper was last given (M13 settings). */
  private boundKeys: unknown = null;

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
    if (start.kind === 'new' && start.starterKit) this.sim.giveItems(STARTER_KIT);
    this.welcome = start.kind === 'new';
    // The world now lives in the simulation (loadArrays copies). Drop the scene manager's reference
    // to the start data, or the generated/saved arrays (tens of MB) stay alive for the session.
    this.sys.settings.data = {};
    this.paused = false;
    this.guideOpen = false;
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
    // The live settings (storage may be unavailable); `?quality=` wins for this session.
    const quality = this.params.quality ?? this.bridge.state.settings.quality;
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
    this.audio?.setVolumes(this.bridge.state.settings.volume);

    const sim = this.sim;
    this.inputMapper = new InputMapper(
      this,
      sim.input,
      (command) => sim.enqueue(command),
      this.bridge.state.settings.keys,
    );
    this.photo = new PhotoMode(this);
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
    this.lifeView = new LifeRenderer(
      this,
      this.glowScene,
      sim.events,
      sim.settlement.npcs,
      sim.critters.critters,
      sim.wisps,
      player,
      (npc) => sim.quests.marker(npc),
    );
    this.townView = new TownRenderer(this, this.glowScene, sim);
    this.townUi = new TownPresenter(
      sim,
      this.bridge,
      (text) => this.notify(text),
      () => this.bossUi.story(),
    );
    this.bossUi = new BossPresenter(
      sim,
      this.bridge,
      (text) => this.notify(text),
      (title, sub) => this.townUi.banner(title, sub),
    );
    sim.events.on('playerHurt', () =>
      this.cameraDirector.shake(COMBAT_VIEW.hurtShake, COMBAT_VIEW.hurtShakeSeconds),
    );
    this.bossView = new BossRenderer(this, this.glowScene, sim, (amplitude, seconds) =>
      this.cameraDirector.shake(amplitude, seconds),
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
      // A debug key: only while the F3 overlay is open (and never in photo mode).
      if (!this.debugOpen || this.photo.active) return;
      const times = Object.values(NAMED_TIMES);
      const next = times.find((t) => t > sim.dayFraction + 1e-3) ?? times[0] ?? 0;
      sim.enqueue({ type: 'setDayFraction', value: next });
    });
    this.input.keyboard?.on(`keydown-${UI_KEYS.pause}`, () => {
      if (this.photo.active) this.setPhoto(false);
      else if (this.guideOpen) this.setGuide(false);
      else if (this.inventoryOpen) this.toggleInventory();
      else if (this.talkingTo >= 0 || this.travelFrom || this.townUi.panelOpen)
        this.closeVillagePanels();
      else this.setPaused(!this.paused);
    });
    // The rebindable UI keys (M13 settings): matched by the key's name on every key press.
    this.input.keyboard?.on('keydown', (event: KeyboardEvent) => {
      if (event.repeat) return;
      const name = keyName(event.code, event.key);
      if (!name) return;
      const keys = this.bridge.state.settings.keys;
      const is = (what: UiKey) => keys[what].includes(name);
      if (this.photo.active) {
        if (is('togglePhoto')) this.setPhoto(false);
        else if (name === UI_KEYS.photoPanel) {
          event.preventDefault(); // or the browser moves focus
          this.setPhotoPanel(!this.photo.panelHidden);
        }
        return;
      }
      if (is('togglePhoto')) {
        if (!this.paused && !this.guideOpen) this.setPhoto(true);
      } else if (is('toggleInventory')) {
        if (!this.paused && !this.guideOpen) this.toggleInventory();
      } else if (is('toggleJournal')) {
        if (!this.paused && !this.guideOpen) this.townUi.toggleJournal();
      } else if (is('toggleGuide')) {
        this.setGuide(!this.guideOpen);
      }
    });
    const onVisibility = () => {
      if (document.visibilityState !== 'hidden' || this.quitting) return;
      // Photo mode changes the clock: put it back before saving.
      this.setPhoto(false);
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
      this.bridge.commands.on('toggleGuide', () => this.setGuide(!this.guideOpen)),
      this.bridge.commands.on('saveAndQuit', () => void this.saveAndQuit()),
      this.bridge.commands.on('travelTo', ({ x, y }) => {
        sim.enqueue({ type: 'travel', x, y });
        this.closeVillagePanels();
      }),
      this.bridge.commands.on('closePanel', () => this.closeVillagePanels()),
      this.bridge.commands.on('acceptQuest', ({ quest }) => {
        sim.enqueue({ type: 'acceptQuest', quest });
        this.talkingTo = -1;
        this.bridge.set({ dialogue: null });
      }),
      this.bridge.commands.on('openShop', ({ npcId }) => {
        this.talkingTo = -1;
        this.bridge.set({ dialogue: null });
        this.townUi.openShop(npcId);
      }),
      this.bridge.commands.on('buy', ({ npcId, offer }) =>
        sim.enqueue({ type: 'buy', npc: npcId, offer }),
      ),
      this.bridge.commands.on('sell', ({ npcId, item, count }) =>
        sim.enqueue({ type: 'sell', npc: npcId, item, count }),
      ),
      this.bridge.commands.on('toggleJournal', () => this.townUi.toggleJournal()),
      this.bridge.commands.on('closeEnding', () => this.bossUi.closeEnding()),
      // M13: settings apply at once (quality on the next world), and photo mode's controls.
      this.bridge.commands.on('changeSettings', ({ settings }) => {
        // Rebind only when the keys changed (sliders send many changes).
        if (settings.keys !== this.boundKeys) {
          this.boundKeys = settings.keys;
          this.inputMapper.setKeys(settings.keys);
        }
        this.audio?.setVolumes(settings.volume);
      }),
      this.bridge.commands.on('photoExit', () => this.setPhoto(false)),
      this.bridge.commands.on('photoTime', ({ dayFraction }) => {
        if (!this.photo.active) return;
        this.photo.dayFraction = dayFraction;
        sim.setDayFraction(dayFraction);
        this.publishPhoto();
      }),
      this.bridge.commands.on('photoPreset', ({ preset }) => {
        if (!this.photo.active || !Object.hasOwn(PHOTO.presets, preset)) return;
        this.photo.preset = preset;
        this.visual.photoPreset = preset as PhotoPresetKey;
        this.publishPhoto();
      }),
      this.bridge.commands.on('photoPanel', ({ hidden }) => this.setPhotoPanel(hidden)),
      this.bridge.commands.on('photoSave', () => this.savePhoto()),
    ];
    this.listenToVillage();
    sim.events.on('inventoryChanged', () => this.publishInventory());
    sim.events.on('miningBlocked', ({ reason, tier, flag }) => {
      const pick = pickaxeForTier(tier);
      if (reason === 'support') this.notify('Something stands on that block');
      else if (reason === 'sealed') this.notify(sealedText(flag));
      else this.notify(pick ? `Needs ${withArticle(pick)}` : 'Too hard to mine');
    });
    sim.events.on('crafted', ({ itemId, count }) =>
      this.notify(`Crafted ${count > 1 ? `${count} × ` : ''}${itemById(itemId)?.name ?? '?'}`),
    );

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      // Key captures are global: release them, or the menus' text fields lose those letters.
      this.input.keyboard?.clearCaptures();
      document.removeEventListener('visibilitychange', onVisibility);
      for (const off of offCommands) off();
      this.chunks.destroy();
      this.walls.destroy();
      this.liquids.destroy();
      this.gloamOverlay.destroy();
      this.lightEffects.destroy();
      this.materials.destroy();
      this.combatView.destroy();
      this.lifeView.destroy();
      this.townView.destroy();
      this.townUi.destroy();
      this.bossUi.destroy();
      this.bossView.destroy();
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
        dialogue: null,
        travel: null,
        shop: null,
        journal: null,
        banner: null,
        respawnIn: null,
        paused: false,
      });
    });
    this.bridge.set({
      screen: 'game',
      inventoryOpen: false,
      paused: false,
      guide: false,
      error: null,
      notice: null,
      icons: this.iconRects(),
    });
    this.publishInventory();
    if (this.welcome) this.notify('New to the forest? Press H for the Lamplighter’s Guide');
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

  /** Talking, beacon travel and the M10 notices (arrivals, the fae buff, caught fireflies). */
  private listenToVillage(): void {
    const { events } = this.sim;
    events.on('talk', ({ npcId, name, role, text, offer, offerTitle, shop }) => {
      this.talkingTo = npcId;
      this.townUi.close();
      this.bridge.set({
        dialogue: {
          name,
          role,
          text,
          id: ++this.dialogueId,
          npcId,
          offer: offer ? { key: offer, title: offerTitle } : null,
          shop,
        },
      });
    });
    events.on('beaconMenu', ({ x, y, beacons }) => {
      this.travelFrom = { x, y };
      const options = beacons
        .filter((b) => b.x !== x || b.y !== y)
        .map((b) => ({ x: b.x, y: b.y, d: Math.hypot(b.x - x, b.y - y) }))
        .sort((a, b) => a.d - b.d)
        .map((b) => ({ x: b.x, y: b.y, label: beaconLabel(b.x - x, b.y - y) }));
      this.bridge.set({ travel: { options } });
    });
    events.on('npcArrived', ({ name }) => this.notify(`${name} has moved into the village!`));
    events.on('npcHomeless', ({ name }) => this.notify(`${name} has lost their home`));
    events.on('faeBuff', () => this.notify('The fae dance around you'));
    events.on('critterCaught', ({ type }) =>
      this.notify(`Caught a ${CRITTERS[type]?.name.toLowerCase() ?? 'critter'}`),
    );
    events.on('wispAppeared', () => this.notify('A wisp beckons…'));
  }

  private closeVillagePanels(): void {
    if (this.travelFrom) this.setPointerOverUi(false); // the list may close under the cursor
    if (this.townUi.panelOpen) this.setPointerOverUi(false);
    this.talkingTo = -1;
    this.travelFrom = null;
    this.townUi.close();
    this.bridge.set({ dialogue: null, travel: null });
  }

  /** Talking and travel lists close when the player walks away from the speaker or beacon. */
  private checkVillagePanels(): void {
    if (this.talkingTo < 0 && !this.travelFrom) return;
    const b = this.sim.player.body;
    const px = b.x + b.width / 2;
    const py = b.y + b.height / 2;
    const reach = VILLAGE_UI.closeTiles * TILE_SIZE;
    const npc = this.sim.settlement.npcs.find((n) => n.id === this.talkingTo);
    const npcFar =
      this.talkingTo >= 0 &&
      (!npc || Math.hypot(npc.body.x + npc.body.width / 2 - px, npc.body.y - b.y) > reach);
    const from = this.travelFrom;
    const beaconFar =
      from !== null &&
      Math.hypot((from.x + 0.5) * TILE_SIZE - px, (from.y + 0.5) * TILE_SIZE - py) > reach;
    if (npcFar) {
      this.talkingTo = -1;
      this.bridge.set({ dialogue: null });
    }
    if (beaconFar) {
      this.travelFrom = null;
      this.setPointerOverUi(false);
      this.bridge.set({ travel: null });
    }
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
    events.on('talk', () => audio.effect('talk'));
    events.on('npcArrived', () => audio.effect('arrive'));
    events.on('bounced', () => audio.effect('bounce'));
    events.on('critterCaught', () => audio.effect('catch'));
    events.on('wispAppeared', () => audio.effect('wisp'));
    events.on('wispArrived', () => audio.effect('wisp'));
    events.on('travelled', () => audio.effect('travel'));
    events.on('traded', () => audio.effect('coin'));
    events.on('questCompleted', () => audio.effect('quest'));
    events.on('questStarted', () => audio.effect('talk'));
    events.on('lampRefuelled', () => audio.effect('lamp'));
    events.on('liftRode', () => audio.effect('lift'));
    events.on('beaconRelit', () => audio.effect('relight'));
    events.on('districtReclaimed', () => audio.effect('arrive'));
    events.on('roadLit', () => audio.effect('quest'));
    events.on('festivalStarted', () => audio.effect('firework'));
    events.on('bossIntro', () => audio.effect('bossIntro'));
    events.on('bossPhase', () => audio.effect('bossPhase'));
    events.on('bossDefeated', () => audio.effect('bossDefeated'));
    events.on('bossAction', ({ kind }) => {
      const sound = BOSS_ACTION_SOUND[kind];
      if (sound) audio.effect(sound);
    });
    events.on('dimmingStarted', () => audio.effect('dimmingToll'));
    events.on('dimmingEnded', () => audio.effect('quest'));
    events.on('shadeWave', () => audio.effect('shadeWave'));
    // A colony of bats takes off together: one flutter, not one per bat.
    let lastFlutter = -Infinity;
    events.on('critterStartled', ({ type }) => {
      // Wings only: deer and frogs bolt silently.
      if (CRITTERS[type]?.move !== 'perch' && CRITTERS[type]?.move !== 'flutter') return;
      if (this.sim.time - lastFlutter < LIFE_VIEW.flutterSoundGap) return;
      lastFlutter = this.sim.time;
      audio.effect('flutter');
    });
    // One crackle per burst of ignitions, not one per burning cell.
    let lastIgnite = -Infinity;
    events.on('fireStarted', () => {
      if (this.sim.time - lastIgnite < MATERIALS_VIEW.igniteSoundGap) return;
      lastIgnite = this.sim.time;
      audio.effect('ignite');
    });
    return audio;
  }

  /**
   * Photo mode (M13): the world holds still, the UI hides and the camera flies free. Leaving puts
   * the clock and the colour grade back as they were.
   */
  private setPhoto(on: boolean): void {
    if (on === this.photo.active || this.quitting) return;
    const cam = this.cameras.main;
    if (on) {
      if (this.inventoryOpen) this.toggleInventory();
      this.closeVillagePanels();
      this.photo.enter(
        cam.scrollX + cam.width / 2,
        cam.scrollY + cam.height / 2,
        this.sim.dayFraction,
      );
      this.cursor.visible = false;
      this.publishPhoto();
    } else {
      this.photo.exit();
      this.sim.setDayFraction(this.photo.savedFraction);
      this.visual.photoPreset = 'none';
      this.cursor.visible = true;
      this.bridge.set({ photo: null });
    }
    this.inputMapper.commandsBlocked = on;
    this.sim.input.releaseAll();
  }

  private setPhotoPanel(hidden: boolean): void {
    if (!this.photo.active) return;
    this.photo.panelHidden = hidden;
    this.publishPhoto();
  }

  private publishPhoto(): void {
    const p = this.photo;
    this.bridge.set({
      photo: { dayFraction: p.dayFraction, preset: p.preset, panelHidden: p.panelHidden },
    });
  }

  /** Saves what the canvas shows (the DOM panel isn't in it), scaled up crisply. */
  private savePhoto(): void {
    if (!this.photo.active) return;
    this.game.renderer.snapshot((image) => {
      if (!(image instanceof HTMLImageElement)) return;
      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      downloadScaledPng(image, PHOTO.saveScale, `gloamdeep-${stamp}.png`);
      this.notify('Photo saved');
    });
  }

  /** Opens or closes the guide; the world holds still while it is open. */
  private setGuide(open: boolean): void {
    if (this.quitting || open === this.guideOpen) return;
    this.guideOpen = open;
    if (!this.paused) this.audio?.setPaused(open);
    this.sim.input.releaseAll();
    this.bridge.set({ guide: open });
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
    if (this.paused || this.guideOpen || this.quitting) return;
    const start = performance.now();
    if (this.meta) {
      this.sessionSeconds += delta / 1000;
      this.autosaveTimer += delta / 1000;
      // Never while photo mode has the clock (it would save the photo's time of day).
      if (this.autosaveTimer >= SAVE.autosaveSeconds && !this.saving && !this.photo.active) {
        this.saveNow().catch((error: unknown) => console.error('Autosave failed', error));
      }
    }

    // While the inventory holds a stack on the cursor, world clicks throw it instead of mining.
    if (this.throwPress && !this.input.activePointer.isDown) this.throwPress = false;
    this.inputMapper.mouseBlocked =
      this.throwPress || (this.inventoryOpen && this.sim.inventory.cursor !== null);
    if (this.photo.active) {
      // Photo mode: nothing moves but the camera, and the light follows the chosen time.
      const cam = this.cameras.main;
      const world = this.sim.world;
      this.photo.update(
        delta / 1000,
        cam.zoom,
        world.width * TILE_SIZE,
        world.height * TILE_SIZE,
        this.inputMapper.pointerEnabled,
      );
      this.sim.relight(delta / 1000);
    } else {
      this.inputMapper.update();
      this.sim.update(delta);
    }

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
    // A boss's intro: the camera looks at it and zooms in (M12).
    const bossFocus = this.bossView.focus();
    if (this.photo.active) this.cameraDirector.snapTo(this.photo.x, this.photo.y);
    else
      this.cameraDirector.update(
        bossFocus?.x ?? this.playerView.feetX(alpha),
        bossFocus?.y ??
          this.playerView.feetY(alpha) -
            body.height / 2 -
            CAMERA.surfaceLift * this.visual.outdoors,
        bossFocus ? 0 : body.vx,
        bossFocus ? 0 : body.vy,
        delta / 1000,
      );

    const cam = this.cameras.main;
    const zoom = this.bossView.zoom();
    if (cam.zoom !== zoom) cam.setZoom(zoom);
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
    this.bossView.update(alpha, delta / 1000, this.sim.time);
    this.lifeView.update(alpha, delta / 1000, this.sim.time);
    this.townView.update(alpha, delta / 1000, this.sim.time, this.view);
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
      npcs: this.sim.settlement.npcs.map((n) => ({
        key: n.key,
        x: n.body.x + n.body.width / 2,
        y: n.body.y + n.body.height,
        home: n.homeId,
      })),
      critters: this.sim.critters.critters.map((c) => CRITTERS[c.type]?.key ?? '?'),
      wisp: this.sim.wisps.wisp !== null,
      fae: player.fae,
      dialogue: this.bridge.state.dialogue?.name ?? null,
      quests: [...this.sim.quests.quests.values()].map((q) => `${q.key}:${q.state}`),
      towns: this.sim.towns.towns.map((t) => ({
        key: t.def.key,
        x0: t.place.x0,
        y0: t.place.y0,
        light: t.light,
        festival: t.festivalPhase,
      })),
      caravans: this.sim.roads.roads.flatMap((r) =>
        r.caravan ? [{ x: r.caravan.x, y: r.caravan.y }] : [],
      ),
      boss: this.bossProbe(),
      arenas: this.sim.bosses.arenas.map((a) => ({ key: a.def.key, state: a.state })),
      dimming: this.sim.dimming.strength,
    };
  }

  private bossProbe(): GameProbe['boss'] {
    const a = this.sim.bosses.active;
    const boss = a?.boss;
    if (!a || !boss) return null;
    return {
      key: a.def.key,
      state: a.state,
      phase: a.phase,
      health: boss.health / (ENEMIES[boss.type]?.maxHealth ?? 1),
      status: this.sim.bosses.run(a)?.status() ?? '',
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
      lockedRecipes: this.townUi.lockedRecipes(),
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
    this.cursor.visible = !over && !this.photo.active;
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
      this.townUi.update();
      this.bossUi.update();
      this.checkVillagePanels();
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
    const fae = Math.ceil(player.fae);
    const respawn = player.dead ? Math.ceil(player.respawnTimer) : null;
    if (this.bridge.state.respawnIn !== respawn) this.bridge.set({ respawnIn: respawn });
    const lensKey = ownedLenses(this.sim.inventory)
      .map((l) => l.key)
      .join(',');
    const town = { ...this.townUi.hud(), dimming: this.bossUi.dimming() };
    const townKey = JSON.stringify(town);
    if (
      hud &&
      hud.lumen === lumen &&
      hud.health === health &&
      this.hudLensKey === `${player.lens}|${lensKey}` &&
      hud.lanternOn === player.lanternOn &&
      hud.clock === clock &&
      hud.fae === fae &&
      this.hudTownKey === townKey
    ) {
      return;
    }
    this.hudTownKey = townKey;
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
        fae,
        ...town,
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

  /** `?spot=village`: four cottages in a row right of the spawn; stand in the middle gap. */
  private stampVillage(sim: Simulation, spawnX: number): { x: number; y: number } {
    const cottage = prefabByKey('cottage');
    const width = cottage.width;
    const step = width + DEBUG.villageGap;
    const x0 = spawnX + DEBUG.villageOffset;
    for (let k = 0; k < DEBUG.villageHouses; k++) {
      const x = x0 + k * step;
      stampPrefab(sim.world, cottage, x, sim.world.groundRow(x), DEBUG.villageHeadroom);
    }
    const fx = x0 + Math.floor(DEBUG.villageHouses / 2) * step - Math.ceil(DEBUG.villageGap / 2);
    const tall = Math.ceil(PLAYER.height / TILE_SIZE);
    return { x: fx, y: findOpenFeetRow(sim.world, fx, sim.world.groundRow(fx), tall) };
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
    } else if (spot === 'village') {
      feet = this.stampVillage(sim, Math.floor(generated.spawnX / TILE_SIZE));
    } else if (spot === 'ward') {
      feet = wardSpot(sim);
    } else if (this.params.boss || this.params.arena) {
      const key = this.params.boss ?? this.params.arena ?? '';
      feet = arenaSpot(sim, key, this.params.boss !== null);
      if (!feet) console.warn(`No arena for ${key} in this world`);
    } else if (this.params.near) {
      feet = besideResident(sim, this.params.near);
      if (!feet) console.warn(`No townsperson near=${this.params.near}`);
    } else if (spot === 'canopyhold' || spot === 'citadel' || spot === 'road') {
      feet = townSpot(sim, spot);
      if (!feet) console.warn(`No ${spot} in this world; using the normal spawn`);
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
    // M11 town starts.
    if (this.params.roadLit) lightRoads(sim);
    if (this.params.reclaim.length > 0) relightDistricts(sim, this.params.reclaim);
    if (this.params.festival) startFestival(sim);
    // M12 boss and Dimming starts.
    if (this.params.beaten.length > 0) beatBosses(sim, this.params.beaten);
    if (this.params.dimming) startDimming(sim);
    if (this.params.boss && this.params.bossPhase !== null) {
      startFight(sim, this.params.boss, this.params.bossPhase);
    }
    if (this.params.quest && !sim.quests.accept(this.params.quest)) {
      console.warn(`Unknown or unavailable quest=${this.params.quest}`);
    }
    if (this.params.wisp) sim.wisps.summon(sim.player);
    const critter = CRITTERS.findIndex((c) => c.key === this.params.critter);
    if (critter >= 0) {
      const p = sim.player.body;
      const tx = Math.floor((p.x + p.width / 2) / TILE_SIZE) + DEBUG.critterOffsetTiles;
      let ty = Math.floor(p.y / TILE_SIZE);
      // Ceiling perchers: look from the ceiling above that column, however tall the room.
      if (CRITTERS[critter]?.perch === 'ceiling') {
        const top = Math.max(0, ty - DEBUG.critterCeilingTiles);
        while (ty > top && !sim.world.isSolid(tx, ty - 1)) ty--;
      }
      if (
        !sim.critters.placeNear(sim.world, critter, tx, ty, DEBUG.critterSearchTiles, Math.random)
      )
        console.warn(`No spot for critter=${this.params.critter} near the debug start`);
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

/** "42 tiles east, 10 up" (tile offsets from the beacon you stand at). */
function beaconLabel(dx: number, dy: number): string {
  const parts: string[] = [];
  if (dx !== 0) parts.push(`${Math.abs(dx)} tiles ${dx > 0 ? 'east' : 'west'}`);
  if (Math.abs(dy) >= VILLAGE_UI.levelTiles)
    parts.push(`${Math.abs(dy)} ${dy > 0 ? 'down' : 'up'}`);
  return parts.length > 0 ? parts.join(', ') : 'Right here';
}
