import type { BossDef } from '../../../data/bosses';
import type { LensDef } from '../../../data/lenses';
import type { Enemy } from '../../entities/Enemy';
import type { Player } from '../../entities/Player';
import type { EventBus, SimEvents } from '../../events';
import type { ActionState } from '../../input';
import type { Inventory } from '../../inventory/Inventory';
import type { World } from '../../world/World';
import type { TownPlace } from '../../world/worldData';
import type { LightPoint } from '../LightSystem';

/** A rectangle of tiles, inclusive (world coordinates). */
export interface TileBox {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

export type ArenaState = 'idle' | 'intro' | 'fight' | 'won';

/** A boss's arena in the world (from its prefab's objects, placed by world generation). */
export interface Arena<D extends BossDef = BossDef> {
  readonly def: D;
  readonly place: TownPlace;
  /** Leaving this (by more than BOSS.leaveMargin) ends the fight. */
  readonly bounds: TileBox;
  /** Stepping in starts the fight. */
  readonly trigger: TileBox;
  /** Sealed with roots while the fight is on. */
  readonly doors: readonly TileBox[];
  /** Where the boss appears: the feet cell (tiles). */
  readonly bossX: number;
  readonly bossY: number;
  /** The Mire's pool, or null. */
  readonly pool: TileBox | null;
  state: ArenaState;
  /** Seconds in the current state. */
  timer: number;
  boss: Enemy | null;
  /** 0-based; rises as its health falls (BossDef.phases). */
  phase: number;
}

/** A hostile shot (dust, a water bolt, a wave, a shockwave, a crystal shard, a Gloam orb). */
export type ShotKind = 'dust' | 'bolt' | 'wave' | 'slam' | 'shard' | 'orb';

export interface HostileShot {
  kind: ShotKind;
  /** Centre, pixels; velocity px/s; gravity px/s². */
  x: number;
  y: number;
  vx: number;
  vy: number;
  gravity: number;
  radius: number;
  damage: number;
  /** Seconds left. */
  life: number;
  /** Stops at solid tiles (otherwise passes through rock). */
  solid: boolean;
}

/** Everything a boss script may use, gathered by the Simulation. */
export interface BossContext {
  readonly world: World;
  readonly player: Player;
  readonly input: ActionState;
  readonly inventory: Inventory;
  readonly events: EventBus<SimEvents>;
  readonly enemies: Enemy[];
  readonly shots: HostileShot[];
  readonly random: () => number;
  /** The lantern is lit and fuelled, and its lens. */
  lanternLit(): boolean;
  lens(): LensDef;
  /** Brightest light channel at a tile, or null where the light grid isn't current. */
  lightAt(x: number, y: number): number | null;
  /** Puts a creature (src/data/enemies.ts key) with its feet at (x, y) pixels. */
  spawn(key: string, feetX: number, feetY: number): Enemy;
  /** A fresh creature id. */
  nextId(): number;
  /** Takes a creature away without a death (minions when a fight ends; a tendril that arrived). */
  remove(enemy: Enemy): void;
  /** Burns the boss (or a creature) by light: ignores invulnerability and doesn't knock back. */
  burn(enemy: Enemy, amount: number): void;
  /** Says the player lacks something (a Lumen crystal for a root-lamp). */
  blocked(need: string): void;
  /** Reports a fight moment for sounds and shakes. */
  action(kind: SimEvents['bossAction']['kind'], x: number, y: number): void;
}

/** How many creatures of a type a boss has called up and are still about. */
export function summonedCount(enemies: readonly Enemy[], type: number): number {
  let n = 0;
  for (const e of enemies) if (e.summoned && e.type === type) n++;
  return n;
}

/** What the renderer and HUD read about the fight in progress (per script). */
export type BossView =
  | {
      readonly script: 'moth';
      readonly mode: 'circle' | 'dive' | 'recover' | 'stunned';
      /** She can't see the player (lantern out, no lure): she has lost track. */
      readonly lost: boolean;
    }
  | {
      readonly script: 'mire';
      /** Water depth in rows over the pool floor, and the rows it is heading to. */
      readonly level: number;
      readonly target: number;
      readonly submerged: boolean;
      /** Risen but in the dark: it barely feels your blows. */
      readonly murk: boolean;
    }
  | {
      readonly script: 'warden';
      /** The lantern beam as a polyline (pixels: x0, y0, x1, y1, ...) and how often it bounced. */
      readonly beam: readonly number[];
      readonly bounces: number;
      /** A reflected beam is on it right now / its shell is cracked (seconds left). */
      readonly hit: boolean;
      readonly cracked: number;
      readonly hovering: boolean;
    }
  | {
      readonly script: 'heart';
      readonly lit: number;
      readonly lamps: number;
      /** Damage multiplier from the lamps lit. */
      readonly exposure: number;
    };

/** A running fight's behaviour (one per arena, made by its script). */
export interface BossRun {
  /** The fight began (the boss exists, the intro starts). */
  start(): void;
  /** One step of the fight (after the intro). */
  update(dt: number): void;
  /** Its health fell into a new phase. */
  phaseChanged(phase: number): void;
  /** The player struck it (not light burns). */
  hit(): void;
  /** Right-click on an arena fixture at tile (x, y); true if it was one. Works outside fights too. */
  use(x: number, y: number): boolean;
  /** Puts the arena back as it was (a fight lost or left, or a world loaded). */
  reset(): void;
  /** It fell: leave the arena at peace. */
  won(): void;
  /** Moving lights for the light grid (the boss's own glow, a reflected beam). */
  lights(out: LightPoint[]): void;
  readonly view: BossView;
  /** A short hint for the boss bar, e.g. "Stunned!" or "3 of 6 root-lamps lit". */
  status(): string;
}
