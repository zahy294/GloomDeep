/**
 * The player's part rig (plan 2.9.8): which frame of the `player-parts` sheet each part uses,
 * where its pivot is inside the 16×16 frame, and where that pivot sits relative to the player's
 * feet-centre (facing right; the renderer mirrors for facing left). Replacing the art only needs
 * this table to match the new sheet.
 */

export const PART_FRAME = {
  backArm: 0,
  frontArm: 1,
  body: 2,
  head: 3,
  hood: 4,
  /** Four walk frames: contact, passing, contact (other leg), passing. */
  legsWalk: [5, 6, 7, 8],
  legsIdle: 9,
  legsJump: 10,
  lantern: 11,
} as const;

export interface PartPlacement {
  /** Pivot inside the frame, in frame pixels. */
  pivotX: number;
  pivotY: number;
  /** Pivot position relative to the feet-centre, in pixels (y up is negative). */
  x: number;
  y: number;
}

export const PART_RIG = {
  legs: { pivotX: 8, pivotY: 16, x: 0, y: 0 },
  body: { pivotX: 8, pivotY: 16, x: 0, y: -11 },
  head: { pivotX: 8, pivotY: 16, x: 1, y: -23 },
  hood: { pivotX: 8, pivotY: 16, x: 1, y: -23 },
  /** Shoulders; arms hang down from their pivot at the top of the frame. */
  backArm: { pivotX: 8, pivotY: 2, x: -2, y: -21 },
  frontArm: { pivotX: 8, pivotY: 2, x: 2, y: -21 },
  /** The lantern hangs from its handle at the top of the frame. */
  lantern: { pivotX: 8, pivotY: 2, x: 0, y: 0 },
} as const satisfies Record<string, PartPlacement>;

/** Distance from shoulder pivot to hand along the arm, in pixels. */
export const ARM_LENGTH = 9;
