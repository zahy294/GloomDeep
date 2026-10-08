import { SIM } from '../config';
import { itemId, STARTING_INVENTORY } from '../data/items';
import type { SimCommand } from './commands';
import { createItemDrop, type ItemDrop } from './entities/ItemDrop';
import { createPlayer, type Player } from './entities/Player';
import { EventBus, type SimEvents } from './events';
import { FixedStepLoop } from './FixedStepLoop';
import { ActionState } from './input';
import { Inventory } from './inventory/Inventory';
import { mulberry32 } from './random';
import { createBuildingState, updateBuilding, type BuildingState } from './systems/BuildingSystem';
import { updateItemDrops } from './systems/ItemDropSystem';
import { createMiningState, updateMining, type MiningState } from './systems/MiningSystem';
import { updatePlayer } from './systems/PlayerSystem';
import { World, type WorldSize } from './world/World';

export interface SimulationOptions {
  size: WorldSize;
  /** Fills the freshly created world and returns the player spawn (feet-centre, pixels). */
  generate: (world: World) => { spawnX: number; spawnY: number };
  /** Seeds gameplay randomness (drop pops, ...). */
  seed?: number;
  stepsPerSecond?: number;
  maxStepsPerFrame?: number;
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
  private readonly commands: SimCommand[] = [];
  private readonly random: () => number;
  private readonly loop: FixedStepLoop;
  private stepCount = 0;
  /** Reused every step so the fixed loop doesn't allocate. Listeners must not keep a reference. */
  private readonly steppedPayload = { step: 0 };
  private readonly spawnDrop = (item: number, count: number, x: number, y: number) => {
    this.drops.push(createItemDrop(item, count, x, y, this.random));
  };

  constructor(options: SimulationOptions) {
    this.world = new World(options.size, this.events);
    const spawn = options.generate(this.world);
    this.player = createPlayer(spawn.spawnX, spawn.spawnY);
    this.random = mulberry32(options.seed ?? 0);
    for (const { item, count } of STARTING_INVENTORY) this.inventory.add(itemId(item), count);
    this.loop = new FixedStepLoop(
      options.stepsPerSecond ?? SIM.stepsPerSecond,
      options.maxStepsPerFrame ?? SIM.maxStepsPerFrame,
      () => this.step(),
    );
  }

  /** Called once per rendered frame with the real elapsed time. Returns the steps run. */
  update(frameMs: number): number {
    return this.loop.advance(frameMs);
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
    updateItemDrops(this.drops, this.player, this.inventory, this.world, this.events, dt);
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
      }
    }
    this.commands.length = 0;
    this.events.emit('inventoryChanged', NO_PAYLOAD);
  }
}
