import { describe, expect, it, vi } from 'vitest';
import { InlineLightBackend, WorkerLightBackend } from '../../../src/workers/lighting/backends';
import type { LightWorkerLike } from '../../../src/workers/lighting/backends';
import type { LightJob, LightResult } from '../../../src/workers/lighting/lightJob';

function job(id: number): LightJob {
  const n = 4;
  return {
    id,
    x0: 0,
    y0: 0,
    width: 2,
    height: 2,
    fg: new Uint16Array(n),
    skyline: new Int32Array(2),
    canopyTop: new Int32Array(2).fill(2),
    canopyShade: new Float32Array(2).fill(1),
    sunR: 255,
    sunG: 255,
    sunB: 255,
    points: new Float32Array(0),
    cone: null,
    time: 0,
    focusX: 0,
    focusY: 0,
    outR: new Uint8Array(n),
    outG: new Uint8Array(n),
    outB: new Uint8Array(n),
  };
}

describe('InlineLightBackend', () => {
  it('returns the result synchronously', () => {
    const cb = vi.fn();
    const j = job(3);
    j.skyline.fill(10);
    new InlineLightBackend().submit(j, cb);
    expect(cb).toHaveBeenCalledTimes(1);
    const res = cb.mock.calls[0]![0] as LightResult;
    expect(res.id).toBe(3);
    expect(Array.from(res.r)).toEqual([255, 255, 255, 255]);
  });
});

describe('WorkerLightBackend', () => {
  it('posts with the transfer list and resolves callbacks by id', () => {
    const worker: LightWorkerLike = { postMessage: vi.fn(), onmessage: null, terminate: vi.fn() };
    const backend = new WorkerLightBackend(worker);
    const a = vi.fn();
    const b = vi.fn();
    const ja = job(1);
    const jb = job(2);
    backend.submit(ja, a);
    backend.submit(jb, b);
    const [msg, transfer] = (worker.postMessage as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(msg).toBe(ja);
    expect(transfer).toEqual([
      ja.fg.buffer,
      ja.skyline.buffer,
      ja.canopyTop.buffer,
      ja.canopyShade.buffer,
      ja.points.buffer,
      ja.outR.buffer,
      ja.outG.buffer,
      ja.outB.buffer,
    ]);

    const result = (id: number): LightResult => ({
      id,
      x0: 0,
      y0: 0,
      width: 2,
      height: 2,
      r: new Uint8Array(4),
      g: new Uint8Array(4),
      b: new Uint8Array(4),
      computeMs: 0,
    });
    const r2 = result(2);
    worker.onmessage!({ data: r2 });
    expect(b).toHaveBeenCalledWith(r2);
    expect(a).not.toHaveBeenCalled();
    worker.onmessage!({ data: result(1) });
    expect(a).toHaveBeenCalledTimes(1);
    worker.onmessage!({ data: result(1) });
    expect(a).toHaveBeenCalledTimes(1);
  });

  it('terminates on destroy', () => {
    const worker: LightWorkerLike = { postMessage: vi.fn(), onmessage: null, terminate: vi.fn() };
    new WorkerLightBackend(worker).destroy();
    expect(worker.terminate).toHaveBeenCalled();
  });
});

describe('WorkerLightBackend failure', () => {
  it('switches to computing inline after the worker errors', () => {
    const worker: LightWorkerLike = { postMessage: vi.fn(), onmessage: null, terminate: vi.fn() };
    const backend = new WorkerLightBackend(worker);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    worker.onerror?.('failed to load module');
    expect(worker.terminate).toHaveBeenCalled();

    const onResult = vi.fn();
    backend.submit(job(7), onResult);
    expect(worker.postMessage).not.toHaveBeenCalled();
    expect(onResult).toHaveBeenCalledWith(expect.objectContaining({ id: 7 }));
  });
});
