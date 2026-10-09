/** Which tile layer an event refers to. */
export type TileLayer = 'fg' | 'bg';

/**
 * Events the simulation emits. Rendering, audio and UI subscribe; the simulation never calls them.
 * Payload objects may be reused by the emitter: listeners must copy what they keep.
 */
export interface SimEvents {
  /** Fired once after every fixed simulation step. */
  stepped: { readonly step: number };
  /** Any tile write (mining, placing, worldgen edits after load, ...). */
  tileChanged: {
    readonly x: number;
    readonly y: number;
    readonly id: number;
    readonly previous: number;
    readonly layer: TileLayer;
  };
  /** Mining progress changed. `stage` 0 = undamaged/cleared, 1..CRACK_STAGES = visible cracks. */
  tileDamaged: {
    readonly x: number;
    readonly y: number;
    readonly layer: TileLayer;
    readonly stage: number;
  };
  /** A tile was mined out. `id` is the tile that was removed. */
  tileBroken: {
    readonly x: number;
    readonly y: number;
    readonly id: number;
    readonly layer: TileLayer;
  };
  /** The player placed a tile. */
  tilePlaced: {
    readonly x: number;
    readonly y: number;
    readonly id: number;
    readonly layer: TileLayer;
  };
  /** An item drop was collected; x/y is where it was picked up (pixels). */
  itemPickedUp: {
    readonly itemId: number;
    readonly count: number;
    readonly x: number;
    readonly y: number;
  };
  /** Lightning struck (storms, src/data/weather.ts): flash now, thunder after a delay. */
  lightning: { readonly flash: number };
  /** The light grid was rewritten in this rectangle (tiles, absolute). */
  lightUpdated: {
    readonly x0: number;
    readonly y0: number;
    readonly width: number;
    readonly height: number;
  };
  /** Inventory contents or the selected slot changed. */
  inventoryChanged: Record<string, never>;
}

type Listener<T> = (payload: T) => void;

/**
 * Small typed event bus. Listeners run in subscription order.
 * Listener lists are copy-on-write: subscribing allocates, emitting never does, and a listener
 * that (un)subscribes during an emit doesn't affect who receives the current event.
 */
export class EventBus<Events extends object> {
  private readonly listeners: { [K in keyof Events]?: readonly Listener<Events[K]>[] } = {};

  /** Subscribes and returns a function that unsubscribes. */
  on<K extends keyof Events>(type: K, listener: Listener<Events[K]>): () => void {
    this.listeners[type] = [...(this.listeners[type] ?? []), listener];
    return () => this.off(type, listener);
  }

  off<K extends keyof Events>(type: K, listener: Listener<Events[K]>): void {
    const list = this.listeners[type];
    if (!list?.includes(listener)) return;
    this.listeners[type] = list.filter((l) => l !== listener);
  }

  emit<K extends keyof Events>(type: K, payload: Events[K]): void {
    const list = this.listeners[type];
    if (!list) return;
    for (let i = 0; i < list.length; i++) list[i]?.(payload);
  }

  clear(): void {
    for (const key of Object.keys(this.listeners) as (keyof Events)[]) delete this.listeners[key];
  }
}
