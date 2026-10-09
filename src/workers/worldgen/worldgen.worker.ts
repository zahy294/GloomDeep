import { generateWorld } from './generateWorld';
import { transferList, type WorldgenMessage, type WorldgenRequest } from './worldgenMessages';

// The tsconfig has no WebWorker lib (it would clash with the DOM lib), so `self` is typed as
// Window. Cast it to the minimal worker-scope shape this file uses.
const ctx = self as unknown as {
  onmessage: ((event: { data: WorldgenRequest }) => void) | null;
  postMessage(message: WorldgenMessage, transfer?: Transferable[]): void;
};

ctx.onmessage = ({ data }) => {
  try {
    const world = generateWorld(data.width, data.height, data.seed, (fraction, label) =>
      ctx.postMessage({ type: 'progress', fraction, label }),
    );
    ctx.postMessage({ type: 'done', world }, transferList(world.arrays));
  } catch (error) {
    ctx.postMessage({
      type: 'error',
      message: error instanceof Error ? error.message : String(error),
    });
  }
};
