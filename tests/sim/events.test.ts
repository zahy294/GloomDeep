import { describe, expect, it, vi } from 'vitest';
import { EventBus } from '../../src/sim/events';

interface TestEvents {
  ping: { n: number };
  pong: { s: string };
}

describe('EventBus', () => {
  it('delivers payloads only to listeners of that event type', () => {
    const bus = new EventBus<TestEvents>();
    const ping = vi.fn();
    const pong = vi.fn();
    bus.on('ping', ping);
    bus.on('pong', pong);

    bus.emit('ping', { n: 3 });

    expect(ping).toHaveBeenCalledWith({ n: 3 });
    expect(pong).not.toHaveBeenCalled();
  });

  it('stops delivering after unsubscribe', () => {
    const bus = new EventBus<TestEvents>();
    const listener = vi.fn();
    const unsubscribe = bus.on('ping', listener);

    unsubscribe();
    bus.emit('ping', { n: 1 });

    expect(listener).not.toHaveBeenCalled();
  });

  it('still calls every other listener when one unsubscribes itself mid-emit', () => {
    const bus = new EventBus<TestEvents>();
    const calls: string[] = [];
    const a = () => calls.push('a');
    const selfRemoving = () => {
      calls.push('self');
      bus.off('ping', selfRemoving);
    };
    const c = () => calls.push('c');
    bus.on('ping', a);
    bus.on('ping', selfRemoving);
    bus.on('ping', c);

    bus.emit('ping', { n: 0 });
    bus.emit('ping', { n: 0 });

    expect(calls).toEqual(['a', 'self', 'c', 'a', 'c']);
  });

  it('calls listeners in subscription order', () => {
    const bus = new EventBus<TestEvents>();
    const calls: number[] = [];
    for (const n of [1, 2, 3]) bus.on('ping', () => calls.push(n));
    bus.emit('ping', { n: 0 });
    expect(calls).toEqual([1, 2, 3]);
  });

  it('calls each listener once even if a later one removes an earlier one mid-emit', () => {
    const bus = new EventBus<TestEvents>();
    const calls: string[] = [];
    const a = () => calls.push('a');
    bus.on('ping', a);
    bus.on('ping', () => calls.push('b'));
    bus.on('ping', () => {
      calls.push('c');
      bus.off('ping', a);
    });

    bus.emit('ping', { n: 0 });
    bus.emit('ping', { n: 0 });

    expect(calls).toEqual(['a', 'b', 'c', 'b', 'c']);
  });

  it('emitting with no listeners is a no-op', () => {
    const bus = new EventBus<TestEvents>();
    expect(() => bus.emit('pong', { s: 'x' })).not.toThrow();
  });
});
