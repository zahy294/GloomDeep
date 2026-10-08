/** Events the simulation emits. Rendering, audio and UI subscribe; the simulation never calls them. */
export interface SimEvents {
  /** Fired once after every fixed simulation step. */
  stepped: { readonly step: number };
  tileChanged: { readonly x: number; readonly y: number; readonly id: number };
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
