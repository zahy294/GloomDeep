import {
  COMBAT,
  FIRE,
  HEALTH,
  ITEM_DROP,
  LIQUID,
  SIM,
  SPAWN,
  SWIM,
  TILE_SIZE,
  TIME,
  WORLD,
} from '../config';
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
import { LiquidSystem } from './systems/LiquidSystem';
import { FireSystem } from './systems/FireSystem';
import { FallingSystem } from './systems/FallingSystem';
import { createBucketState, updateBuckets, type BucketState } from './systems/BucketSystem';
import { hitEnemy, hurtPlayer } from './systems/CombatSystem';
import { LIQUID as LIQUID_KIND } from '../data/biomes';
import type { Body } from './physics/tileCollision';
import { itemId, STARTING_INVENTORY, type ItemCount } from '../data/items';
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
}

const NO_PAYLOAD: Record<string, never> = {};

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
  readonly liquids: LiquidSystem;
  readonly fire: FireSystem;
  readonly falling: FallingSystem;
  private readonly bucketState: BucketState = createBucketState();
  /** The region where liquids flow (around the view). Reused every step. */
  private readonly liquidRegion: TileRect = { x0: 0, y0: 0, width: 0, height: 0 };
  /** Burning cells sent to the light job, nearest first (reused). */
  private readonly fireLights: number[] = [];
  private readonly splashPayload = { x: 0, y: 0, lava: false };
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
      this.falling.blocks.length
    );
  }

  private step(): void {
    const dt = this.stepSeconds;
    this.stepCount++;
    this.applyCommands();
    this.updateRespawn(dt);
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
    if (!this.player.dead) {
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
    if (!this.player.dead) {
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
    this.light.update(
      dt,
      this.elapsed,
      this.sunNow,
      this.player,
      this.input,
      this.flares,
      this.fireLights,
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
    this.falling.update(dt, this.spawnDrop, (body, damage) => this.crush(body, damage));

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

    // The burning cells nearest the player light the area.
    const lights = this.fireLights;
    lights.length = 0;
    if (this.fire.burning.size > 0) {
      const px = b.x / TILE_SIZE;
      const py = b.y / TILE_SIZE;
      for (const key of this.fire.burning.keys()) lights.push(key >= 0 ? key : -key - 1);
      const W = world.width;
      lights.sort((a, c) => {
        const ax = (a % W) - px;
        const ay = Math.floor(a / W) - py;
        const cx = (c % W) - px;
        const cy = Math.floor(c / W) - py;
        return ax * ax + ay * ay - (cx * cx + cy * cy);
      });
      if (lights.length > FIRE.maxLights) lights.length = FIRE.maxLights;
    }
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
    const { crafted, overflow } = craft(recipe, times, this.inventory, this.stationsNearby());
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
      }
    }
    this.commands.length = 0;
    this.events.emit('inventoryChanged', NO_PAYLOAD);
  }
}
