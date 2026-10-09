import type { GeneratedWorld, WorldArrays } from '../../sim/world/worldData';

export interface WorldgenRequest {
  width: number;
  height: number;
  seed: number;
}

export type WorldgenMessage =
  | { type: 'progress'; fraction: number; label: string }
  | { type: 'done'; world: GeneratedWorld }
  | { type: 'error'; message: string };

/** The array buffers to transfer (not copy) back to the main thread. */
export function transferList(arrays: WorldArrays): Transferable[] {
  return Object.values(arrays).map((a: WorldArrays[keyof WorldArrays]) => a.buffer);
}
