import { HEALTH, LUMEN, PLAYER } from '../../config';
import type { Body } from '../physics/tileCollision';

export interface Player {
  body: Body;
  /** Position at the start of the last step, for render interpolation. */
  prevX: number;
  prevY: number;
  facing: 1 | -1;
  onGround: boolean;
  coyoteTimer: number;
  jumpBufferTimer: number;
  /** True while rising from a jump that can still be cut short by releasing the button. */
  jumping: boolean;
  /** Running total of pixels climbed by auto step-up; the renderer smooths over increases. */
  steppedUpTotal: number;
  /** Lantern fuel, 0..LUMEN.max (plan 1.4). */
  lumen: number;
  lanternOn: boolean;
  /** Active lens key (src/data/lenses.ts). */
  lens: string;
  /** 0..HEALTH.max. */
  health: number;
  /** Seconds since the player last took damage (regeneration waits for HEALTH.regenDelay). */
  sinceDamage: number;
  /** Seconds of invulnerability left after a hit. */
  invuln: number;
  /** Seconds of lost control left after being knocked back. */
  knockbackTimer: number;
  /** Out of health: no control until respawning (respawnTimer counts down). */
  dead: boolean;
  respawnTimer: number;
}

/** Spawn is the FEET-CENTER in pixels. */
export function createPlayer(spawnX: number, spawnY: number): Player {
  const x = spawnX - PLAYER.width / 2;
  const y = spawnY - PLAYER.height;
  return {
    body: { x, y, width: PLAYER.width, height: PLAYER.height, vx: 0, vy: 0 },
    prevX: x,
    prevY: y,
    facing: 1,
    onGround: false,
    coyoteTimer: 0,
    jumpBufferTimer: 0,
    jumping: false,
    steppedUpTotal: 0,
    lumen: LUMEN.start,
    lanternOn: true,
    lens: 'amber',
    health: HEALTH.max,
    sinceDamage: HEALTH.regenDelay,
    invuln: 0,
    knockbackTimer: 0,
    dead: false,
    respawnTimer: 0,
  };
}
