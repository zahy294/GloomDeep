import type { GeneratedWorld } from '../../sim/world/worldData';
import { generateWorld } from './generateWorld';
import type { WorldgenMessage, WorldgenRequest } from './worldgenMessages';

export type WorldgenProgress = (fraction: number, label: string) => void;

/**
 * Generates a world in a Web Worker so the progress screen keeps animating (plan 3.2). If the
 * worker cannot start or crashes, generation runs on the main thread instead: same seed, same
 * world, only without live progress.
 */
export function generateWorldAsync(
  request: WorldgenRequest,
  onProgress: WorldgenProgress,
): Promise<GeneratedWorld> {
  let worker: Worker;
  try {
    worker = new Worker(new URL('./worldgen.worker.ts', import.meta.url), { type: 'module' });
  } catch (error) {
    console.warn('Worldgen worker unavailable; generating on the main thread', error);
    return generateInline(request, onProgress);
  }
  return new Promise<GeneratedWorld>((resolve, reject) => {
    worker.onmessage = ({ data }: MessageEvent<WorldgenMessage>) => {
      if (data.type === 'progress') {
        onProgress(data.fraction, data.label);
        return;
      }
      worker.terminate();
      if (data.type === 'done') resolve(data.world);
      else reject(new Error(data.message));
    };
    const fallBack = (reason: string): void => {
      worker.terminate();
      console.warn('Worldgen worker failed; generating on the main thread', reason);
      generateInline(request, onProgress).then(resolve, reject);
    };
    worker.onerror = (event) => {
      event.preventDefault();
      fallBack(event.message);
    };
    // A message that can't be deserialised would otherwise leave the promise pending forever.
    worker.onmessageerror = () => fallBack('unreadable message');
    worker.postMessage(request);
  });
}

async function generateInline(
  { width, height, seed }: WorldgenRequest,
  onProgress: WorldgenProgress,
): Promise<GeneratedWorld> {
  onProgress(0, 'Generating');
  // Let the progress screen paint once before the main thread is busy.
  await new Promise((r) => setTimeout(r, 0));
  return generateWorld(width, height, seed, onProgress);
}
