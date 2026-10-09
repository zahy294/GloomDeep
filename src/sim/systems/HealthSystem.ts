import { HEALTH } from '../../config';
import type { Player } from '../entities/Player';

/** Slow regeneration after a while without damage (plan 5 HUD; damage sources arrive in M8). */
export function updateHealth(player: Player, dt: number): void {
  player.sinceDamage += dt;
  if (player.sinceDamage < HEALTH.regenDelay || player.health >= HEALTH.max) return;
  player.health = Math.min(HEALTH.max, player.health + HEALTH.regenPerSecond * dt);
}

/** Takes health away (never below 0) and restarts the regeneration delay. Returns the damage dealt. */
export function damagePlayer(player: Player, amount: number): number {
  if (!(amount > 0)) return 0;
  const dealt = Math.min(player.health, amount);
  player.health -= dealt;
  player.sinceDamage = 0;
  return dealt;
}
