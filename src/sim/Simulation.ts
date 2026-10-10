import {
  COMBAT,
  FIRE,
  LIGHT,
  HEALTH,
  ITEM_DROP,
  LIQUID,
  SETTLEMENT,
  SIM,
  SPAWN,
  SWIM,
  TILE_SIZE,
  TIME,
  TOWN,
  TRADE,
  WORLD,
} from '../config';
import { npcDef } from '../data/npcs';
import { shopFor } from '../data/shops';
import { VILLAGE } from '../data/roads';
import { nextLine } from './systems/DialogueSystem';
import { ProgressionSystem } from './systems/ProgressionSystem';
import { TownSystem } from './systems/TownSystem';
import { RoadSystem } from './systems/RoadSystem';
import { QuestSystem } from './systems/QuestSystem';
import { buy, priceFactor, sell } from './systems/TradeSystem';
import type { LightPoint } from './systems/LightSystem';
import type { Npc } from './entities/Npc';
import type { TownPlace } from './world/worldData';
import { ENEMIES } from '../data/enemies';
import type { Enemy } from './entities/Enemy';
import type { Projectile } from './entities/Projectile';
import { updateEnemyAI } from './systems/EnemyAI';
import {
  createCombatState,
  selectedWeapon,
  updateCombat,
  type CombatContext,
  type CombatState,
} from './systems/CombatSystem';
import { SpawnSystem } from './systems/SpawnSystem';
import { CritterSystem, type CritterContext } from './systems/CritterSystem';
import { FloraSystem } from './systems/FloraSystem';
import { WispSystem } from './systems/WispSystem';
import { CRITTERS } from '../data/critters';
import { SettlementSystem } from './systems/SettlementSystem';
import { BeaconSystem } from './systems/BeaconSystem';
import {
  createInteractState,
  updateInteract,
  type InteractContext,
  type InteractState,
} from './systems/InteractSystem';
import { SPAWN_TREE } from '../data/trees';
import { LiquidSystem } from './systems/LiquidSystem';
import { FireSystem } from './systems/FireSystem';
import { FallingSystem } from './systems/FallingSystem';
import { createBucketState, updateBuckets, type BucketState } from './systems/BucketSystem';
import { hitEnemy, hurtPlayer } from './systems/CombatSystem';
import { LIQUID as LIQUID_KIND } from '../data/biomes';
import type { Body } from './physics/tileCollision';
import { ITEMS, itemId, STARTING_INVENTORY, type ItemCount } from '../data/items';
import { QUESTS } from '../data/quests';
import { LAMP_FUEL_ITEMS } from '../data/towns';
import { InlineLightBackend } from '../workers/lighting/backends';
import type { LightBackend } from '../workers/lighting/lightJob';
import type { SimCommand } from './commands';
import { sampleDayCycle, type DaySample } from './dayCycle';
import { createItemDrop, type ItemDrop } from './entities/ItemDrop';
import { createPlayer, type Player } from './entities/Player';
import { EventBus, type SimEvents } from './events';
import { FixedStepLoop } from './FixedStepLoop';
import { ActionState } from './input';
import { Inventory } from './inventory/Inventory';
import { Mulberry32 } from './random';
import { Weather } from './weather';
import { DecorSupport } from './world/decor';
import { craft, nearbyStations, recipeByKey } from './systems/CraftingSystem';
import { updateHealth } from './systems/HealthSystem';
import { GloamSystem } from './systems/GloamSystem';
import { createLensState, updateLens, type LensState } from './systems/LensSystem';
import { createFlareState, updateFlares, type FlareState } from './systems/FlareSystem';
import { createCone, lanternCone, type Cone } from './systems/lanternCone';
import type { TileRect } from './systems/GloamSystem';
import { lanternLit } from './systems/LanternSystem';
import { lensByKey } from '../data/lenses';
import type { Flare } from './entities/Flare';
import { createBuildingState, updateBuilding, type BuildingState } from './systems/BuildingSystem';
import { updateItemDrops } from './systems/ItemDropSystem';
import { updateLantern } from './systems/LanternSystem';
import { LightSystem } from './systems/LightSystem';
import { createMiningState, updateMining, type MiningState } from './systems/MiningSystem';
import { updatePlayer } from './systems/PlayerSystem';
import { World, type WorldSize } from './world/World';
import type { GeneratedWorld, SaveState, WorldMeta } from './world/worldData';

/** Options for building a Simulation from a generated or saved world (size comes from the data). */
export type SimulationRuntimeOptions = Omit<SimulationOptions, 'size' | 'generate'>;

export interface SimulationOptions {
  size: WorldSize;
  /**
   * Fills the freshly created world and returns the player spawn (feet-centre, pixels). Used by
   * tests and debug starts; real worlds come from `Simulation.fromGenerated` / `fromSave`.
   */
  generate: (world: World) => { spawnX: number; spawnY: number };
  /** New worlds get the starting inventory; restored ones get their saved inventory instead. */
  startingInventory?: boolean;
  /** Seeds gameplay randomness (drop pops, ...). */
  seed?: number;
  stepsPerSecond?: number;
  maxStepsPerFrame?: number;
  /** Where light jobs run (a Web Worker in the game); inline by default (tests, fallback). */
  lightBackend?: LightBackend;
  /** Day fraction to start at (0 = midnight, 0.5 = noon). */
  startDayFraction?: number;
  /** Creatures spawn. Off by default (tests); the game turns it on unless `?spawns=0`. */
  spawns?: boolean;
  /** Where world generation placed the towns (M11); none by default. */
  towns?: readonly TownPlace[];
}

const NO_PAYLOAD: Record<string, never> = {};
const GLIMMER = itemId('glimmer');
const LAMP_FUEL = LAMP_FUEL_ITEMS.map(itemId);
const QUEST_TITLES = new Map(QUESTS.map((q) => [q.key, q.title]));

/** Owns the game state and advances it at a fixed rate. Contains no rendering code. */
export class Simulation {
  readonly events = new EventBus<SimEvents>();
  readonly input = new ActionState();
  readonly world: World;
  readonly player: Player;
  readonly inventory = new Inventory();
  readonly drops: ItemDrop[] = [];
  /** Burning flares (not saved: they burn out). */
  readonly flares: Flare[] = [];
  /** Creatures and shots (not saved: creatures respawn by the spawn rules). */
  readonly enemies: Enemy[] = [];
  readonly projectiles: Projectile[] = [];
  readonly combat: CombatState = createCombatState();
  private readonly spawner = new SpawnSystem();
  private readonly spawnsEnabled: boolean;
  private nextEnemyId = 1;
  /** Seconds the game stays frozen after a hit landed (hit-stop, plan 2.8). */
  private hitStop = 0;
  private readonly combatContext: CombatContext;
  private readonly spawnContext;
  readonly gloam: GloamSystem;
  private readonly lensState: LensState = createLensState();
  private readonly flareState: FlareState = createFlareState();
  readonly settlement: SettlementSystem;
  readonly critters = new CritterSystem();
  private readonly flora: FloraSystem;
  readonly wisps: WispSystem;
  /** Moving lights for the light grid: the wisp, caravan lanterns (rebuilt every step). */
  private readonly wispLights: LightPoint[] = [];
  readonly progression: ProgressionSystem;
  readonly towns: TownSystem;
  readonly roads: RoadSystem;
  readonly quests: QuestSystem;
  private readonly talkPayload = {
    npcId: 0,
    key: '',
    name: '',
    role: '',
    text: '',
    offer: '',
    offerTitle: '',
    shop: false,
  };
  private readonly liftPayload = { x: 0, y: 0 };
  private readonly blockedPayload = { need: '' };
  private readonly tradedPayload = { npc: '', glimmer: 0 };
  private readonly bouncedPayload = { x: 0, y: 0 };
  private readonly critterContext: CritterContext;
  private readonly caughtPayload = { type: 0, x: 0, y: 0 };
  readonly beacons: BeaconSystem;
  private readonly interactState: InteractState = createInteractState();
  private readonly interactContext: InteractContext;
  readonly liquids: LiquidSystem;
  readonly fire: FireSystem;
  readonly falling: FallingSystem;
  private readonly bucketState: BucketState = createBucketState();
  /** The region where liquids flow (around the view). Reused every step. */
  private readonly liquidRegion: TileRect = { x0: 0, y0: 0, width: 0, height: 0 };
  /** Burning cells sent to the light job, nearest first (reused). */
  private readonly fireLights: number[] = [];
  private readonly splashPayload = { x: 0, y: 0, lava: false };
  private readonly travelledPayload = { x: 0, y: 0 };
  private readonly crimsonCone: Cone = createCone();
  readonly mining: MiningState = createMiningState();
  private readonly building: BuildingState = createBuildingState();
  /** Player spawn, feet-centre, pixels (respawning arrives in M8). */
  readonly spawnX: number;
  readonly spawnY: number;
  readonly light: LightSystem;
  private readonly decorSupport: DecorSupport;
  /** Wind, rain, morning mist and lightning (deterministic from seed + time; nothing saved). */
  readonly weather: Weather;
  /** Sunlight after weather, fed to the light grid. Reused every step. */
  private readonly sunNow = { sunR: 0, sunG: 0, sunB: 0 };
  /** Time of day, 0..1 (0 = midnight, 0.5 = noon), and the cycle sampled at it. */
  dayFraction: number;
  readonly day: DaySample = sampleDayCycle(0);
  /** Simulated seconds since start (drives flicker). */
  private elapsed = 0;
  private readonly commands: SimCommand[] = [];
  private readonly rng: Mulberry32;
  private readonly random = (): number => this.rng.next();
  private readonly loop: FixedStepLoop;
  private stepCount = 0;
  /** Reused every step so the fixed loop doesn't allocate. Listeners must not keep a reference. */
  private readonly steppedPayload = { step: 0 };
  /** Pops an item drop out at a point (mining uses it; tests call it directly). */
  readonly spawnDrop = (item: number, count: number, x: number, y: number) => {
    this.drops.push(createItemDrop(item, count, x, y, this.random));
  };
  /** Crafting stations in reach, refreshed when a craft is requested (and by `stationsNearby`). */
  private readonly stations = new Set<string>();
  private readonly craftedPayload = { itemId: 0, count: 0 };

  constructor(options: SimulationOptions) {
    this.world = new World(options.size, this.events);
    const spawn = options.generate(this.world);
    this.spawnX = spawn.spawnX;
    this.spawnY = spawn.spawnY;
    this.player = createPlayer(spawn.spawnX, spawn.spawnY);
    this.rng = new Mulberry32(options.seed ?? 0);
    this.dayFraction = options.startDayFraction ?? TIME.startDayFraction;
    sampleDayCycle(this.dayFraction, this.day);
    this.decorSupport = new DecorSupport(this.world, this.events);
    this.gloam = new GloamSystem(this.world, this.events);
    this.fire = new FireSystem(this.world, this.events, this.random);
    this.liquids = new LiquidSystem(this.world, this.events, this.random, (x, y) =>
      this.fire.ignite(x, y),
    );
    this.falling = new FallingSystem(this.world, this.events);
    this.progression = new ProgressionSystem(this.events);
    this.settlement = new SettlementSystem(this.world, this.events, this.random, (flag) =>
      this.progression.has(flag),
    );
    this.towns = new TownSystem(
      this.world,
      this.events,
      this.settlement.npcs,
      this.progression,
      () => this.settlement.nextNpcId(),
      this.random,
      options.towns ?? [],
    );
    this.roads = new RoadSystem(
      this.world,
      this.events,
      this.towns,
      this.progression,
      Math.floor(spawn.spawnX / TILE_SIZE),
    );
    this.beacons = new BeaconSystem(this.world, this.events);
    this.flora = new FloraSystem(this.world, this.events, this.random);
    this.wisps = new WispSystem(this.world, this.events, this.random);
    this.critterContext = {
      world: this.world,
      player: this.player,
      region: null,
      focusX: 0,
      focusY: 0,
      day: true,
      random: this.random,
      events: this.events,
    };
    this.interactContext = {
      player: this.player,
      input: this.input,
      world: this.world,
      npcs: this.settlement.npcs,
      beacons: this.beacons,
      events: this.events,
      bodies: () => [this.player.body, ...this.settlement.npcs.map((n) => n.body)],
      talk: (npc) => this.talkTo(npc),
      useTile: (x, y) => this.useTile(x, y),
      tryCatch: (x, y) => this.tryCatch(x, y),
    };
    this.quests = new QuestSystem({
      world: this.world,
      player: this.player,
      inventory: this.inventory,
      npcs: this.settlement.npcs,
      towns: this.towns,
      roads: this.roads,
      progression: this.progression,
      events: this.events,
      random: this.random,
      villageX: spawn.spawnX,
      villageY: spawn.spawnY,
      drop: (item, count) => this.dropAtPlayer(item, count, false),
    });
    // Beacons and bright towns keep the Gloam and creatures out (plan 1.4, 1.7).
    this.gloam.covered = (x, y) => this.beacons.covers(x, y) || this.towns.protects(x, y);
    // The Old Dryad waits by the spawn tree (a loaded world replaces it with the saved folk).
    this.settlement.ensureDryad(this.dryadColumn());
    this.spawnsEnabled = options.spawns ?? false;
    this.combatContext = {
      player: this.player,
      input: this.input,
      inventory: this.inventory,
      world: this.world,
      enemies: this.enemies,
      projectiles: this.projectiles,
      events: this.events,
      spawnDrop: (item, count, x, y) => this.spawnDrop(item, count, x, y),
      random: this.random,
    };
    this.spawnContext = {
      enemies: this.enemies,
      world: this.world,
      player: this.player,
      region: null as TileRect | null,
      focusX: 0,
      focusY: 0,
      day: true,
      random: this.random,
      nextId: () => this.nextEnemyId++,
      events: this.events,
      safe: (x: number, y: number) => this.beacons.covers(x, y) || this.towns.protects(x, y),
    };
    this.weather = new Weather(options.seed ?? 0);
    this.light = new LightSystem(
      this.world,
      this.events,
      options.lightBackend ?? new InlineLightBackend(),
    );
    if (options.startingInventory !== false) this.giveItems(STARTING_INVENTORY);
    this.loop = new FixedStepLoop(
      options.stepsPerSecond ?? SIM.stepsPerSecond,
      options.maxStepsPerFrame ?? SIM.maxStepsPerFrame,
      () => this.step(),
    );
  }

  /** A new world from world generation (plan 3.2). */
  static fromGenerated(
    generated: GeneratedWorld,
    options: SimulationRuntimeOptions = {},
  ): Simulation {
    return new Simulation({
      ...options,
      size: { width: generated.width, height: generated.height, chunkSize: WORLD.chunkSize },
      towns: generated.towns,
      generate: (world) => {
        world.loadArrays(generated.arrays);
        return { spawnX: generated.spawnX, spawnY: generated.spawnY };
      },
    });
  }

  /** Restores a saved world exactly (plan 3.5). */
  static fromSave(save: SaveState, options: SimulationRuntimeOptions = {}): Simulation {
    const sim = new Simulation({
      ...options,
      startingInventory: false,
      startDayFraction: save.dayFraction,
      size: { width: save.meta.width, height: save.meta.height, chunkSize: WORLD.chunkSize },
      towns: save.towns.map(({ key, x0, y0, x1, y1 }) => ({ key, x0, y0, x1, y1 })),
      generate: (world) => {
        world.loadArrays(save.arrays);
        return { spawnX: save.spawnX, spawnY: save.spawnY };
      },
    });
    const p = sim.player;
    Object.assign(p.body, {
      x: save.player.x,
      y: save.player.y,
      vx: save.player.vx,
      vy: save.player.vy,
    });
    p.prevX = save.player.x;
    p.prevY = save.player.y;
    p.facing = save.player.facing;
    p.onGround = save.player.onGround;
    p.coyoteTimer = save.player.coyoteTimer;
    p.jumpBufferTimer = save.player.jumpBufferTimer;
    p.jumping = save.player.jumping;
    p.lumen = save.player.lumen;
    p.lanternOn = save.player.lanternOn;
    p.lens = save.player.lens;
    save.inventory.slots.forEach((slot, i) => {
      sim.inventory.slots[i] = slot ? { itemId: slot.itemId, count: slot.count } : null;
    });
    sim.inventory.select(save.inventory.selected);
    // A stack held on the cursor at save time goes back into the bag (the inventory screen starts
    // closed, and a hidden cursor stack would not count for crafting or mining).
    const cursor = save.inventory.cursor;
    sim.inventory.cursor = cursor ? { itemId: cursor.itemId, count: cursor.count } : null;
    const left = sim.inventory.stowCursor();
    if (left) sim.dropAtPlayer(left.itemId, left.count, false);
    // Saved while dead: come back alive, at the spawn (as respawning would have).
    p.health = save.player.health > 0 ? save.player.health : HEALTH.max;
    if (save.player.health <= 0) {
      p.body.x = save.spawnX - p.body.width / 2;
      p.body.y = save.spawnY - p.body.height;
      p.body.vx = 0;
      p.body.vy = 0;
      p.prevX = p.body.x;
      p.prevY = p.body.y;
    }
    sim.elapsed = save.elapsed;
    for (const d of save.drops) {
      const drop = createItemDrop(d.itemId, d.count, d.x, d.y, () => 0.5);
      drop.body.vx = d.vx;
      drop.body.vy = d.vy;
      drop.age = d.age;
      drop.magnetized = d.magnetized;
      drop.pickupAfter = d.pickupAfter;
      sim.drops.push(drop);
    }
    sim.rng.state = save.randomState >>> 0;
    if (save.npcs.length > 0) sim.settlement.npcs.length = 0;
    for (const n of save.npcs) sim.settlement.restore(n.key, n.x, n.y, n.homeId);
    sim.settlement.ensureDryad(sim.dryadColumn());
    // An older save doesn't know the starting Gloam: count from now.
    if (save.gloamInitial >= 0) sim.gloam.initial = save.gloamInitial;
    sim.progression.restore(save.flags);
    sim.towns.restore(save.towns);
    sim.quests.restore(save.quests);
    return sim;
  }

  /**
   * Everything needed to restore this world (plan 3.5). The arrays are live views: encode the
   * state before the simulation advances again (SaveStore.save does so synchronously).
   */
  toSaveState(meta: WorldMeta, version: number): SaveState {
    const p = this.player;
    return {
      version,
      meta,
      arrays: this.world.arrays(),
      player: {
        x: p.body.x,
        y: p.body.y,
        vx: p.body.vx,
        vy: p.body.vy,
        facing: p.facing,
        onGround: p.onGround,
        coyoteTimer: p.coyoteTimer,
        jumpBufferTimer: p.jumpBufferTimer,
        jumping: p.jumping,
        lumen: p.lumen,
        lanternOn: p.lanternOn,
        lens: p.lens,
        health: p.health,
      },
      inventory: {
        slots: this.inventory.slots.map((s) => (s ? { itemId: s.itemId, count: s.count } : null)),
        selected: this.inventory.selected,
        cursor: this.inventory.cursor
          ? { itemId: this.inventory.cursor.itemId, count: this.inventory.cursor.count }
          : null,
      },
      dayFraction: this.dayFraction,
      elapsed: this.elapsed,
      drops: [
        ...this.drops.map((d) => ({
          itemId: d.itemId,
          count: d.count,
          x: d.body.x + d.body.width / 2,
          y: d.body.y + d.body.height / 2,
          vx: d.body.vx,
          vy: d.body.vy,
          age: d.age,
          magnetized: d.magnetized,
          pickupAfter: d.pickupAfter,
        })),
        // Blocks in mid-fall are saved as their item, so nothing is lost.
        ...this.falling.savedAsDrops(),
      ],
      randomState: this.rng.state,
      // Townsfolk are rebuilt from their towns; only your village and the Dryad are saved.
      npcs: this.settlement.npcs
        .filter((n) => n.town === '')
        .map((n) => ({
          key: n.key,
          x: n.body.x + n.body.width / 2,
          y: n.body.y + n.body.height,
          homeId: n.homeId,
        })),
      gloamInitial: this.gloam.initial,
      flags: [...this.progression.flags],
      towns: this.towns.toSave(),
      quests: this.quests.toSave(),
      spawnX: this.spawnX,
      spawnY: this.spawnY,
    };
  }

  /**
   * Called once per rendered frame with the real elapsed time. Returns the steps run. During
   * hit-stop the game holds still (the frame time is swallowed, not caught up later).
   */
  update(frameMs: number): number {
    if (this.hitStop > 0) {
      this.hitStop -= frameMs / 1000;
      return 0;
    }
    return this.loop.advance(frameMs);
  }

  /** Simulated seconds since the world started (flicker, animations). */
  get time(): number {
    return this.elapsed;
  }

  /** Jumps to a time of day (debug keys and `?time=`). */
  setDayFraction(fraction: number): void {
    this.dayFraction = ((fraction % 1) + 1) % 1;
    sampleDayCycle(this.dayFraction, this.day);
  }

  /** Adds items to the inventory (starting inventory, debug kits); what doesn't fit is dropped. */
  giveItems(items: readonly ItemCount[]): void {
    for (const { item, count } of items) {
      const left = this.inventory.add(itemId(item), count);
      if (left > 0) this.dropAtPlayer(itemId(item), left, false);
    }
    this.events.emit('inventoryChanged', NO_PAYLOAD);
  }

  /** Crafting stations within reach of the player right now (for the crafting screen). */
  stationsNearby(): ReadonlySet<string> {
    return nearbyStations(this.world, this.player.body, this.stations);
  }

  /** Queues a command from the UI/input layer; applied at the start of the next step. */
  enqueue(command: SimCommand): void {
    this.commands.push(command);
  }

  /** Interpolation factor between the previous and the current step, for rendering. */
  get alpha(): number {
    return this.loop.alpha;
  }

  get steps(): number {
    return this.stepCount;
  }

  get stepSeconds(): number {
    return this.loop.stepMs / 1000;
  }

  /** Entities currently simulated: the player, item drops, flares, creatures and shots. */
  get entityCount(): number {
    return (
      1 +
      this.drops.length +
      this.flares.length +
      this.enemies.length +
      this.projectiles.length +
      this.falling.blocks.length +
      this.critters.critters.length +
      this.settlement.npcs.length +
      this.roads.roads.filter((r) => r.caravan).length
    );
  }

  private step(): void {
    const dt = this.stepSeconds;
    this.stepCount++;
    this.applyCommands();
    this.updateRespawn(dt);
    // Right-click on people, doors and beacons first: it claims the press from placing.
    const interacting =
      !this.player.dead && updateInteract(this.interactState, this.interactContext);
    updatePlayer(this.player, this.input, this.world, dt);
    // With a weapon selected the left button attacks instead of mining; the dead do neither.
    const armed = selectedWeapon(this.inventory) !== null;
    updateMining(
      this.mining,
      this.player,
      this.input,
      this.inventory,
      this.world,
      this.events,
      this.spawnDrop,
      dt,
      armed || this.player.dead,
    );
    if (!this.player.dead && !interacting) {
      updateBuilding(
        this.building,
        this.player,
        this.input,
        this.inventory,
        this.world,
        this.events,
        dt,
      );
    }
    if (!this.player.dead && !interacting) {
      updateBuckets(
        this.bucketState,
        this.player,
        this.input,
        this.inventory,
        this.liquids,
        this.events,
        (item) => this.dropAtPlayer(item, 1, false),
        dt,
      );
    }
    this.decorSupport.update(this.spawnDrop);
    // The dead pick nothing up, throw nothing, and neither burn Lumen nor heal until respawning.
    if (!this.player.dead) {
      updateItemDrops(this.drops, this.player, this.inventory, this.world, this.events, dt);
      updateFlares(
        this.flareState,
        this.flares,
        this.player,
        this.input,
        this.inventory,
        this.world,
        this.events,
        dt,
      );
      updateLantern(this.player, this.input, this.inventory, this.events, dt);
      updateLens(
        this.lensState,
        this.player,
        this.input,
        this.inventory,
        this.world,
        this.events,
        this.random,
        dt,
      );
      updateHealth(this.player, dt);
    }
    this.elapsed += dt;
    this.setDayFraction(this.dayFraction + dt / TIME.dayLengthSeconds);
    this.weather.update(this.elapsed, this.dayFraction, this.events);
    this.weather.applyToSun(this.day, this.sunNow);
    this.updateMaterials(dt);
    this.settlement.update(dt);
    const night = Math.max(this.day.sunR, this.day.sunG, this.day.sunB) < SPAWN.daylightSun;
    this.towns.update(dt, this.dayFraction, night);
    this.roads.update(dt);
    this.quests.update(dt, this.lightAtTile);
    this.wisps.quest = this.quests.lostThing();
    this.flora.update(dt, this.light.current, this.player, night);
    const pb = this.player.body;
    const outside =
      pb.y + pb.height <=
      (this.world.groundRow(Math.floor((pb.x + pb.width / 2) / TILE_SIZE)) + SPAWN.surfaceDepth) *
        TILE_SIZE;
    this.wisps.update(dt, this.player, outside && !night);
    this.wispLights.length = 0;
    if (this.wisps.wisp) this.wispLights.push(this.wisps.wisp);
    this.roads.lights(this.wispLights);
    if (this.player.bounced) {
      this.bouncedPayload.x = pb.x + pb.width / 2;
      this.bouncedPayload.y = pb.y + pb.height;
      this.events.emit('bounced', this.bouncedPayload);
    }
    this.light.update(
      dt,
      this.elapsed,
      this.sunNow,
      this.player,
      this.input,
      this.flares,
      this.fireLights,
      this.wispLights,
    );
    const lens = lensByKey(this.player.lens);
    const crimson =
      lanternLit(this.player) && lens.effect === 'burn'
        ? lanternCone(this.player, this.input, lens, this.crimsonCone)
        : null;
    this.gloam.update(dt, this.light.current, crimson);
    for (const enemy of this.enemies) {
      const def = ENEMIES[enemy.type];
      if (def) updateEnemyAI(enemy, def, this.player, !this.player.dead, this.world, dt);
    }
    updateCombat(this.combat, this.combatContext, dt);
    if (this.combat.hitLanded) this.hitStop = COMBAT.hitStop;
    if (this.spawnsEnabled) {
      const sc = this.spawnContext;
      const b = this.player.body;
      sc.region = this.light.current;
      sc.focusX = (Number.isFinite(this.input.focusX) ? this.input.focusX : b.x) / TILE_SIZE;
      sc.focusY = (Number.isFinite(this.input.focusY) ? this.input.focusY : b.y) / TILE_SIZE;
      sc.day = Math.max(this.day.sunR, this.day.sunG, this.day.sunB) >= SPAWN.daylightSun;
      this.spawner.update(sc, dt);
      const cc = this.critterContext;
      cc.region = sc.region;
      cc.focusX = sc.focusX;
      cc.focusY = sc.focusY;
      cc.day = sc.day;
      this.critters.update(cc, dt);
    }
    this.steppedPayload.step = this.stepCount;
    this.events.emit('stepped', this.steppedPayload);
  }

  /**
   * M9 materials: liquids flow around the view, fire burns and spreads, loose blocks fall; resting
   * flares light what they lie on; lava, fire and falling blocks hurt; entering liquid splashes.
   */
  private updateMaterials(dt: number): void {
    const { world, player } = this;
    const b = player.body;
    const fx = (Number.isFinite(this.input.focusX) ? this.input.focusX : b.x) / TILE_SIZE;
    const fy = (Number.isFinite(this.input.focusY) ? this.input.focusY : b.y) / TILE_SIZE;
    const r = this.liquidRegion;
    r.x0 = Math.max(0, Math.floor(fx - LIQUID.activeWidth / 2));
    r.y0 = Math.max(0, Math.floor(fy - LIQUID.activeHeight / 2));
    r.width = Math.min(world.width - r.x0, LIQUID.activeWidth);
    r.height = Math.min(world.height - r.y0, LIQUID.activeHeight);
    const wasIn = player.inLiquid;
    this.liquids.update(dt, r);
    this.fire.update(dt, this.weather.sample.rain);
    this.falling.update(
      dt,
      this.spawnDrop,
      (body, damage) => this.crush(body, damage),
      (x, y) => this.bodyAt(x, y),
    );

    // Flares at rest set alight what they lie on or in.
    for (const flare of this.flares) {
      const fb = flare.body;
      if (fb.vx !== 0 || fb.vy !== 0) continue;
      if (this.random() >= FIRE.flareIgnitePerSecond * dt) continue;
      const tx = Math.floor((fb.x + fb.width / 2) / TILE_SIZE);
      const ty = Math.floor((fb.y + fb.height / 2) / TILE_SIZE);
      if (!this.fire.ignite(tx, ty)) this.fire.ignite(tx, ty + 1);
    }

    // Hazards: lava and fire hurt the player and creatures (rate-limited by invulnerability).
    if (!player.dead) {
      const inFire = this.touchesFire(b);
      if (player.inLiquid === LIQUID_KIND.lava) hurtPlayer(this.combatContext, SWIM.lavaDamage, 0);
      else if (inFire) hurtPlayer(this.combatContext, FIRE.damage, 0);
      if (player.inLiquid !== 0 && wasIn === 0) {
        this.splashPayload.x = b.x + b.width / 2;
        this.splashPayload.y = b.y + b.height / 2;
        this.splashPayload.lava = player.inLiquid === LIQUID_KIND.lava;
        this.events.emit('splash', this.splashPayload);
      }
    }
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const enemy = this.enemies[i];
      if (!enemy) continue;
      const e = enemy.body;
      const cx = Math.floor((e.x + e.width / 2) / TILE_SIZE);
      const cy = Math.floor((e.y + e.height / 2) / TILE_SIZE);
      const inLava =
        world.inBounds(cx, cy) &&
        world.liquidType[world.index(cx, cy)] === LIQUID_KIND.lava &&
        (world.liquid[world.index(cx, cy)] ?? 0) >= LIQUID.wetAmount;
      if (inLava) hitEnemy(this.combat, this.combatContext, enemy, SWIM.lavaDamage, 0, 0, 'hazard');
      else if (this.touchesFire(e)) {
        hitEnemy(this.combat, this.combatContext, enemy, FIRE.damage, 0, 0, 'hazard');
      }
    }

    this.updateFireLights(dt, fx, fy);
  }

  /**
   * The burning cells nearest the view centre, as light points (each cell once, even if block and
   * wall both burn). Rebuilt only as often as the light grid updates.
   */
  private updateFireLights(dt: number, fx: number, fy: number): void {
    this.fireLightTimer += dt;
    if (this.fireLightTimer < 1 / LIGHT.updateHz) return;
    this.fireLightTimer = 0;
    const lights = this.fireLights;
    lights.length = 0;
    if (this.fire.burning.size === 0) return;
    const seen = this.fireLightCells;
    seen.clear();
    for (const key of this.fire.burning.keys()) {
      const index = key >= 0 ? key : -key - 1;
      if (seen.has(index)) continue;
      seen.add(index);
      lights.push(index);
    }
    this.fireFocusX = fx;
    this.fireFocusY = fy;
    lights.sort(this.byFireDistance);
    if (lights.length > FIRE.maxLights) lights.length = FIRE.maxLights;
  }

  private fireLightTimer = 0;
  private readonly fireLightCells = new Set<number>();
  private fireFocusX = 0;
  private fireFocusY = 0;
  private readonly byFireDistance = (a: number, c: number): number => {
    const W = this.world.width;
    const ax = (a % W) - this.fireFocusX;
    const ay = Math.floor(a / W) - this.fireFocusY;
    const cx = (c % W) - this.fireFocusX;
    const cy = Math.floor(c / W) - this.fireFocusY;
    return ax * ax + ay * ay - (cx * cx + cy * cy);
  };

  /** Does the player's or a creature's body overlap tile (x, y)? */
  private bodyAt(x: number, y: number): boolean {
    const hit = (o: Body) =>
      o.x < (x + 1) * TILE_SIZE &&
      x * TILE_SIZE < o.x + o.width &&
      o.y < (y + 1) * TILE_SIZE &&
      y * TILE_SIZE < o.y + o.height;
    if (!this.player.dead && hit(this.player.body)) return true;
    for (const e of this.enemies) if (hit(e.body)) return true;
    return false;
  }

  /** Does a body overlap a burning cell? */
  private touchesFire(body: Body): boolean {
    if (this.fire.burning.size === 0) return false;
    const x0 = Math.floor(body.x / TILE_SIZE);
    const x1 = Math.floor((body.x + body.width - 1e-4) / TILE_SIZE);
    const y0 = Math.floor(body.y / TILE_SIZE);
    const y1 = Math.floor((body.y + body.height - 1e-4) / TILE_SIZE);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) if (this.fire.isBurning(x, y)) return true;
    }
    return false;
  }

  /** A falling block hits whatever it overlaps. */
  private crush(body: Body, damage: number): void {
    const p = this.player.body;
    const overlap = (o: Body) =>
      body.x < o.x + o.width &&
      o.x < body.x + body.width &&
      body.y < o.y + o.height &&
      o.y < body.y + body.height;
    if (!this.player.dead && overlap(p)) hurtPlayer(this.combatContext, damage, 0);
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const enemy = this.enemies[i];
      if (enemy && overlap(enemy.body)) {
        hitEnemy(this.combat, this.combatContext, enemy, damage, 0, 0, 'hazard');
      }
    }
  }

  /** Where the Old Dryad stands: beside the spawn tree's trunk, on the glade side. */
  private dryadColumn(): number {
    const spawn = Math.floor(this.spawnX / TILE_SIZE);
    const trunk = spawn + SPAWN_TREE.offset;
    return trunk + Math.sign(spawn - trunk || 1) * SETTLEMENT.dryadOffset;
  }

  /** Brightest light channel at a tile where the light grid is current, else null. */
  private readonly lightAtTile = (x: number, y: number): number | null => {
    const r = this.light.current;
    if (!r || x < r.x0 || y < r.y0 || x >= r.x0 + r.width || y >= r.y0 + r.height) return null;
    const w = this.world;
    const i = w.index(x, y);
    return Math.max(w.lightR[i] ?? 0, w.lightG[i] ?? 0, w.lightB[i] ?? 0);
  };

  /** Talking to someone: their quest talk if any, else their lines (src/data/dialogue). */
  private talkTo(npc: Npc): void {
    const def = npcDef(npc.key);
    if (!def) return;
    const town = this.towns.townOf(npc);
    const quest = this.quests.talk(npc);
    const text =
      quest?.text ??
      nextLine(npc, {
        hasFlag: (f) => this.progression.has(f),
        cleansed: this.gloam.cleansed,
        night: Math.max(this.day.sunR, this.day.sunG, this.day.sunB) < SPAWN.daylightSun,
        festival: town?.festivalPhase === 'on',
      });
    if (!text) return;
    const p = this.talkPayload;
    p.npcId = npc.id;
    p.key = npc.key;
    p.name = def.name;
    p.role = def.role;
    p.text = text;
    p.offer = quest?.offer ?? '';
    p.offerTitle = p.offer ? (QUEST_TITLES.get(p.offer) ?? '') : '';
    p.shop = shopFor(npc.key) !== undefined && !npc.scared;
    this.events.emit('talk', p);
  }

  /** Right-click on a town fixture: refuel a lamp, ride a lift, relight a dormant beacon. */
  private useTile(x: number, y: number): boolean {
    const lamp = this.towns.lampAt(x, y);
    if (lamp) {
      if (lamp.fuel >= 1) return true;
      const fuel = LAMP_FUEL.find((id) => this.inventory.count(id) > 0);
      if (fuel === undefined) {
        this.blocked('a Lumen petal or crystal to refuel it');
        return true;
      }
      this.inventory.remove(fuel, 1);
      this.towns.refuel(lamp);
      this.events.emit('inventoryChanged', NO_PAYLOAD);
      return true;
    }
    const lift = this.towns.liftDestination(x, y);
    if (lift) {
      const b = this.player.body;
      const px = (b.x + b.width / 2) / TILE_SIZE;
      const py = (b.y + b.height / 2) / TILE_SIZE;
      if (Math.hypot(x + 0.5 - px, y + 0.5 - py) > TOWN.liftReach) return true;
      this.teleport(lift.x, lift.y);
      this.liftPayload.x = lift.x;
      this.liftPayload.y = lift.y;
      this.events.emit('liftRode', this.liftPayload);
      return true;
    }
    const dormant = this.towns.dormantDistrictAt(x, y);
    if (dormant) {
      const cost = dormant.district.def.relightCost;
      const missing = cost.find((c) => this.inventory.count(itemId(c.item)) < c.count);
      if (missing) {
        this.blocked(
          cost.map((c) => `${c.count} ${ITEMS[itemId(c.item)]?.name ?? c.item}`).join(' and '),
        );
        return true;
      }
      for (const c of cost) this.inventory.remove(itemId(c.item), c.count);
      this.towns.relight(dormant.town, dormant.district);
      this.events.emit('inventoryChanged', NO_PAYLOAD);
      return true;
    }
    return false;
  }

  private blocked(need: string): void {
    this.blockedPayload.need = need;
    this.events.emit('useBlocked', this.blockedPayload);
  }

  /** Puts the player's feet in tile (x, y) (lifts). */
  private teleport(x: number, y: number): void {
    const b = this.player.body;
    b.x = (x + 0.5) * TILE_SIZE - b.width / 2;
    b.y = (y + 1) * TILE_SIZE - b.height;
    b.vx = 0;
    b.vy = 0;
    this.player.prevX = b.x;
    this.player.prevY = b.y;
  }

  /**
   * A trader's prices right now: their town's light and lit roads (your village counts as fully
   * lit), and whether their festival is on. Null if they don't trade, are afraid or out of reach.
   */
  tradeTerms(npcId: number): { npc: Npc; factor: number; festival: boolean } | null {
    const npc = this.settlement.npcs.find((n) => n.id === npcId);
    if (!npc || !shopFor(npc.key) || npc.scared) return null;
    const b = this.player.body;
    const reach = TRADE.reachTiles * TILE_SIZE;
    const dx = npc.body.x - b.x;
    const dy = npc.body.y - b.y;
    if (dx * dx + dy * dy > reach * reach) return null;
    const town = this.towns.townOf(npc);
    const factor = priceFactor(town?.light ?? 1, this.roads.litRoadsTo(npc.town || VILLAGE));
    return { npc, factor, festival: town?.festivalPhase === 'on' };
  }

  private trade(command: Extract<SimCommand, { type: 'buy' } | { type: 'sell' }>): void {
    const terms = this.tradeTerms(command.npc);
    if (!terms) return;
    const drop = (item: number, count: number) => this.dropAtPlayer(item, count, false);
    const before = this.inventory.count(GLIMMER);
    const done =
      command.type === 'buy'
        ? buy(terms.npc.key, command.offer, terms.festival, terms.factor, this.inventory, drop)
        : sell(terms.npc.key, command.item, command.count, terms.factor, this.inventory, drop) > 0;
    if (!done) return;
    this.tradedPayload.npc = terms.npc.key;
    this.tradedPayload.glimmer = this.inventory.count(GLIMMER) - before;
    this.events.emit('traded', this.tradedPayload);
  }

  /** A glass jar (the selected item) catches a firefly at the cursor. */
  private tryCatch(x: number, y: number): boolean {
    const stack = this.inventory.selectedStack;
    const into = stack ? ITEMS[stack.itemId]?.catches : undefined;
    if (!into) return false;
    const caught = this.critters.catchAt(x, y);
    if (!caught || CRITTERS[caught.type]?.caughtAs !== into) {
      if (caught) this.critters.critters.push(caught); // not catchable with this: let it go
      return false;
    }
    this.inventory.removeFromSlot(this.inventory.selected, 1);
    if (this.inventory.add(itemId(into), 1) > 0) this.dropAtPlayer(itemId(into), 1, false);
    this.caughtPayload.type = caught.type;
    this.caughtPayload.x = x;
    this.caughtPayload.y = y;
    this.events.emit('critterCaught', this.caughtPayload);
    this.events.emit('inventoryChanged', NO_PAYLOAD);
    return true;
  }

  /** Fast travel to a beacon: stand on top of it. */
  private travel(x: number, y: number): void {
    if (!this.beacons.at(x, y) || this.player.dead) return;
    const b = this.player.body;
    // Only from a beacon: you must be standing by one to use the network.
    const px = (b.x + b.width / 2) / TILE_SIZE;
    const py = (b.y + b.height / 2) / TILE_SIZE;
    const reach = SETTLEMENT.travelReach;
    if (!this.beacons.beacons.some((k) => Math.hypot(k.x + 0.5 - px, k.y + 0.5 - py) <= reach))
      return;
    b.x = (x + 0.5) * TILE_SIZE - b.width / 2;
    b.y = (y + 1) * TILE_SIZE - b.height;
    b.vx = 0;
    b.vy = 0;
    this.player.prevX = b.x;
    this.player.prevY = b.y;
    this.travelledPayload.x = x;
    this.travelledPayload.y = y;
    this.events.emit('travelled', this.travelledPayload);
  }

  /** Dead: count down, then come back at the spawn with full health (briefly invulnerable). */
  private updateRespawn(dt: number): void {
    const p = this.player;
    if (!p.dead) return;
    p.respawnTimer -= dt;
    if (p.respawnTimer > 0) return;
    p.dead = false;
    p.health = HEALTH.max;
    p.invuln = COMBAT.playerInvuln;
    p.knockbackTimer = 0;
    p.body.x = this.spawnX - p.body.width / 2;
    p.body.y = this.spawnY - p.body.height;
    p.body.vx = 0;
    p.body.vy = 0;
    p.prevX = p.body.x;
    p.prevY = p.body.y;
    this.events.emit('playerRespawned', NO_PAYLOAD);
  }

  private craft(key: string, times: number): void {
    const recipe = recipeByKey(key);
    if (!recipe) return;
    const { crafted, overflow } = craft(
      recipe,
      times,
      this.inventory,
      this.stationsNearby(),
      this.progression.flags,
    );
    if (crafted === 0) return;
    if (overflow > 0) this.dropAtPlayer(recipe.output.itemId, overflow, false);
    this.craftedPayload.itemId = recipe.output.itemId;
    this.craftedPayload.count = recipe.output.count * crafted;
    this.events.emit('crafted', this.craftedPayload);
  }

  /**
   * Drops items at the player's hands. `thrown` items fly off in the facing direction and can't be
   * picked up again straight away (ITEM_DROP.throwPickupDelay).
   */
  private dropAtPlayer(item: number, count: number, thrown: boolean): void {
    const b = this.player.body;
    const drop = createItemDrop(item, count, b.x + b.width / 2, b.y + b.height / 3, this.random);
    if (thrown) {
      drop.body.vx = this.player.facing * ITEM_DROP.throwSpeedX;
      drop.body.vy = -ITEM_DROP.throwSpeedY;
      drop.pickupAfter = ITEM_DROP.throwPickupDelay;
    }
    this.drops.push(drop);
  }

  private applyCommands(): void {
    if (this.commands.length === 0) return;
    for (const command of this.commands) {
      switch (command.type) {
        case 'selectSlot':
          this.inventory.select(command.slot);
          break;
        case 'cycleSlot':
          this.inventory.cycle(command.delta);
          break;
        case 'swapSlots':
          this.inventory.swap(command.a, command.b);
          break;
        case 'setDayFraction':
          this.setDayFraction(command.value);
          break;
        case 'slotClick':
          if (command.quick) this.inventory.quickMove(command.slot);
          else this.inventory.click(command.slot, command.button);
          break;
        case 'sortInventory':
          this.inventory.sortBag();
          break;
        case 'dropCursor': {
          const held = this.inventory.takeCursor();
          if (held) this.dropAtPlayer(held.itemId, held.count, true);
          break;
        }
        case 'stowCursor': {
          const left = this.inventory.stowCursor();
          if (left) this.dropAtPlayer(left.itemId, left.count, true);
          break;
        }
        case 'craft':
          this.craft(command.recipe, command.times);
          break;
        case 'travel':
          this.travel(command.x, command.y);
          break;
        case 'acceptQuest':
          this.quests.accept(command.quest);
          break;
        case 'buy':
        case 'sell':
          this.trade(command);
          break;
        case 'setFlag':
          this.progression.set(command.flag);
          break;
      }
    }
    this.commands.length = 0;
    this.events.emit('inventoryChanged', NO_PAYLOAD);
  }
}
