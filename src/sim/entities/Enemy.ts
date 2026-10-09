import { ENEMIES } from '../../data/enemies';
import type { Body } from '../physics/tileCollision';

/** AI states (src/sim/systems/EnemyAI.ts). Not every AI uses every state. */
export type EnemyState = 'idle' | 'chase' | 'flee' | 'tunnel' | 'lunge';

export interface Enemy {
  /** Unique per simulation (hit bookkeeping, rendering). */
  readonly id: number;
  /** Index into ENEMIES. */
  readonly type: number;
  body: Body;
  prevX: number;
  prevY: number;
  health: number;
  facing: 1 | -1;
  onGround: boolean;
  state: EnemyState;
  /** Seconds in the current state (AI timers, hops). */
  stateTime: number;
  /** Seconds it can't be hit again (after a hit). */
  invuln: number;
  /** Seconds its own movement is suspended after being knocked back. */
  stunned: number;
  /** Light burn accumulated but not yet reported as a hit (shades). */
  burn: number;
  /** Seconds since the player was last near (despawning). */
  idleTime: number;
}

/** Spawned with its feet at (feetX, feetY), pixels. */
export function createEnemy(id: number, type: number, feetX: number, feetY: number): Enemy {
  const def = ENEMIES[type];
  if (!def) throw new Error(`Unknown enemy type ${type}`);
  const x = feetX - def.width / 2;
  const y = feetY - def.height;
  return {
    id,
    type,
    body: { x, y, width: def.width, height: def.height, vx: 0, vy: 0 },
    prevX: x,
    prevY: y,
    health: def.maxHealth,
    facing: 1,
    onGround: false,
    state: 'idle',
    stateTime: 0,
    invuln: 0,
    stunned: 0,
    burn: 0,
    idleTime: 0,
  };
}
