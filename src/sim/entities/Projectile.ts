import type { Body } from '../physics/tileCollision';

export type ProjectileKind = 'arrow' | 'beam';

/** Something the player shot: an arrow (falls) or a Lumen beam (straight, pierces). */
export interface Projectile {
  kind: ProjectileKind;
  body: Body;
  prevX: number;
  prevY: number;
  damage: number;
  knockback: number;
  /** Enemies it can still hit before it is used up. */
  pierce: number;
  /** Ids already hit (a piercing beam hits each enemy once). */
  readonly hit: number[];
  /** Seconds left to live. */
  life: number;
  gravity: number;
}
