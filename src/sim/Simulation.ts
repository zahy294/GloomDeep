import { SIM, TIME, WORLD } from '../config';
import { itemId, STARTING_INVENTORY } from '../data/items';
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
import { DecorSupport } from './world/decor';
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
  readonly mining: MiningState = createMiningState();
  private readonly building: BuildingState = createBuildingState();
  /** Player spawn, feet-centre, pixels (respawning arrives in M8). */
  readonly spawnX: number;
  readonly spawnY: number;
  readonly light: LightSystem;
  private readonly decorSupport: DecorSupport;
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
    this.light = new LightSystem(
      this.world,
      this.events,
      options.lightBackend ?? new InlineLightBackend(),
    );
    if (options.startingInventory !== false) {
      for (const { item, count } of STARTING_INVENTORY) this.inventory.add(itemId(item), count);
    }
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
    sim.elapsed = save.elapsed;
    for (const d of save.drops) {
      const drop = createItemDrop(d.itemId, d.count, d.x, d.y, () => 0.5);
      drop.body.vx = d.vx;
      drop.body.vy = d.vy;
      drop.age = d.age;
      drop.magnetized = d.magnetized;
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
      },
      inventory: {
        slots: this.inventory.slots.map((s) => (s ? { itemId: s.itemId, count: s.count } : null)),
        selected: this.inventory.selected,
      },
      dayFraction: this.dayFraction,
      elapsed: this.elapsed,
      drops: this.drops.map((d) => ({
        itemId: d.itemId,
        count: d.count,
        x: d.body.x + d.body.width / 2,
        y: d.body.y + d.body.height / 2,
        vx: d.body.vx,
        vy: d.body.vy,
        age: d.age,
        magnetized: d.magnetized,
      })),
      randomState: this.rng.state,
      spawnX: this.spawnX,
      spawnY: this.spawnY,
    };
  }

  /** Called once per rendered frame with the real elapsed time. Returns the steps run. */
  update(frameMs: number): number {
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

  /** Entities currently simulated: the player plus item drops (enemies arrive in M8). */
  get entityCount(): number {
    return 1 + this.drops.length;
  }

  private step(): void {
    const dt = this.stepSeconds;
    this.stepCount++;
    this.applyCommands();
    updatePlayer(this.player, this.input, this.world, dt);
    updateMining(this.mining, this.player, this.input, this.world, this.events, this.spawnDrop, dt);
    updateBuilding(
      this.building,
      this.player,
      this.input,
      this.inventory,
      this.world,
      this.events,
      dt,
    );
    this.decorSupport.update(this.spawnDrop);
    updateItemDrops(this.drops, this.player, this.inventory, this.world, this.events, dt);
    updateLantern(this.player, this.input, this.inventory, this.events, dt);
    this.elapsed += dt;
    this.setDayFraction(this.dayFraction + dt / TIME.dayLengthSeconds);
    this.light.update(dt, this.elapsed, this.day, this.player, this.input);
    this.steppedPayload.step = this.stepCount;
    this.events.emit('stepped', this.steppedPayload);
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
      }
    }
    this.commands.length = 0;
    this.events.emit('inventoryChanged', NO_PAYLOAD);
  }
}
