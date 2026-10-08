import { ITEM_DROP } from '../../config';
import type { Body } from '../physics/tileCollision';

export interface ItemDrop {
  body: Body;
  /** Position at the start of the last step, for render interpolation. */
  prevX: number;
  prevY: number;
  itemId: number;
  count: number;
  age: number;
  magnetized: boolean;
}

/** Spawns centred on the point with a small random upward pop. */
export function createItemDrop(
  itemId: number,
  count: number,
  centreX: number,
  centreY: number,
  random: () => number,
): ItemDrop {
  const size = ITEM_DROP.size;
  const x = centreX - size / 2;
  const y = centreY - size / 2;
  const vx = (random() * 2 - 1) * ITEM_DROP.popSpeedX;
  const vy = -ITEM_DROP.popSpeedY * (0.5 + random() * 0.5);
  return {
    body: { x, y, width: size, height: size, vx, vy },
    prevX: x,
    prevY: y,
    itemId,
    count,
    age: 0,
    magnetized: false,
  };
}
