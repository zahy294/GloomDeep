import { TILES } from '../../data/tiles';
import type { EventBus, SimEvents } from '../events';
import type { World } from '../world/World';

/** Per tile id: its beacon radius in tiles, or 0. */
const RADIUS = Float32Array.from(TILES, (t) => t.beacon?.radius ?? 0);

export interface Beacon {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
}

/**
 * Beacons (plan 1.4 #4): each placed beacon keeps a safe circle — no shades spawn inside and the
 * Gloam there burns away as if lit — and is a fast-travel point. Kept as a list (beacons are few),
 * rebuilt from the world on load and updated from tile changes.
 */
export class BeaconSystem {
  readonly beacons: Beacon[] = [];
  private readonly unsubscribe: () => void;

  constructor(world: World, events: EventBus<SimEvents>) {
    for (let i = 0; i < world.fg.length; i++) {
      const r = RADIUS[world.fg[i] ?? 0] ?? 0;
      if (r > 0)
        this.beacons.push({ x: i % world.width, y: Math.floor(i / world.width), radius: r });
    }
    this.unsubscribe = events.on('tileChanged', ({ x, y, id, previous, layer }) => {
      if (layer !== 'fg') return;
      if ((RADIUS[previous] ?? 0) > 0) {
        const k = this.beacons.findIndex((b) => b.x === x && b.y === y);
        if (k >= 0) this.beacons.splice(k, 1);
      }
      const r = RADIUS[id] ?? 0;
      if (r > 0) this.beacons.push({ x, y, radius: r });
    });
  }

  destroy(): void {
    this.unsubscribe();
  }

  /** Is the tile inside any beacon's safe circle? */
  covers(x: number, y: number): boolean {
    for (const b of this.beacons) {
      const dx = x - b.x;
      const dy = y - b.y;
      if (dx * dx + dy * dy <= b.radius * b.radius) return true;
    }
    return false;
  }

  at(x: number, y: number): Beacon | undefined {
    return this.beacons.find((b) => b.x === x && b.y === y);
  }
}
