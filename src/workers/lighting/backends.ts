import { computeLight } from './computeLight';
import type { LightBackend, LightJob, LightResult } from './lightJob';

/** Runs the flood fill synchronously on the calling thread (tests, fallback). */
export class InlineLightBackend implements LightBackend {
  submit(job: LightJob, onResult: (result: LightResult) => void): void {
    onResult(computeLight(job));
  }
}

/** The subset of `Worker` we use, so a fake can stand in during tests. */
export interface LightWorkerLike {
  postMessage(message: LightJob, transfer: Transferable[]): void;
  onmessage: ((event: { data: LightResult }) => void) | null;
  /** Called if the worker crashes or fails to load. */
  onerror?: ((message: string) => void) | null;
  terminate(): void;
}

/** Vite's worker pattern; isolated because it cannot run in Node. */
export function createLightWorker(): LightWorkerLike {
  const worker = new Worker(new URL('./lighting.worker.ts', import.meta.url), { type: 'module' });
  // Adapter: the DOM Worker's handler signature (with `this`) doesn't match LightWorkerLike.
  const adapter: LightWorkerLike = {
    onmessage: null,
    postMessage: (message, transfer) => worker.postMessage(message, transfer),
    terminate: () => worker.terminate(),
  };
  worker.onmessage = (event: MessageEvent<LightResult>) =>
    adapter.onmessage?.({ data: event.data });
  worker.onerror = (event) => adapter.onerror?.(event.message);
  return adapter;
}

/**
 * Runs jobs in a Web Worker. If the worker errors (crash, failed module load), it switches to
 * computing inline on the main thread for good, so lighting never freezes. Jobs already posted to
 * the dead worker are lost; the LightSystem's timeout re-submits.
 */
export class WorkerLightBackend implements LightBackend {
  private readonly pending = new Map<number, (result: LightResult) => void>();
  private failed = false;

  constructor(private readonly worker: LightWorkerLike) {
    worker.onerror = (message) => {
      console.error('Light worker failed; lighting continues on the main thread:', message);
      this.failed = true;
      this.pending.clear();
      worker.terminate();
    };
    worker.onmessage = (event) => {
      const result = event.data;
      const callback = this.pending.get(result.id);
      if (!callback) return;
      this.pending.delete(result.id);
      callback(result);
    };
  }

  submit(job: LightJob, onResult: (result: LightResult) => void): void {
    if (this.failed) {
      onResult(computeLight(job));
      return;
    }
    this.pending.set(job.id, onResult);
    this.worker.postMessage(job, [
      job.fg.buffer,
      job.skyline.buffer,
      job.canopyTop.buffer,
      job.canopyShade.buffer,
      job.points.buffer,
      job.outR.buffer,
      job.outG.buffer,
      job.outB.buffer,
    ]);
  }

  destroy(): void {
    this.pending.clear();
    this.worker.terminate();
  }
}
