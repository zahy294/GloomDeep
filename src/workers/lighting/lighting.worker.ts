import { computeLight } from './computeLight';
import type { LightJob, LightResult } from './lightJob';

// The tsconfig has no WebWorker lib (it would clash with the DOM lib), so `self` is typed as
// Window. Cast it to the minimal worker-scope shape this file uses.
const ctx = self as unknown as {
  onmessage: ((event: { data: LightJob }) => void) | null;
  postMessage(message: LightResult, transfer: Transferable[]): void;
};

ctx.onmessage = (event) => {
  const result = computeLight(event.data);
  ctx.postMessage(result, [result.r.buffer, result.g.buffer, result.b.buffer]);
};
