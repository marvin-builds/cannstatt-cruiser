import { describe, expect, it, vi } from 'vitest';
import { EventBus } from './events';

type TestEvents = { ping: { n: number }; pong: Record<never, never> };

describe('EventBus', () => {
  it('delivers payloads to listeners of that event only', () => {
    const bus = new EventBus<TestEvents>();
    const ping = vi.fn();
    const pong = vi.fn();
    bus.on('ping', ping);
    bus.on('pong', pong);
    bus.emit('ping', { n: 1 });
    expect(ping).toHaveBeenCalledWith({ n: 1 });
    expect(pong).not.toHaveBeenCalled();
  });

  it('returns an unsubscribe function', () => {
    const bus = new EventBus<TestEvents>();
    const fn = vi.fn();
    const off = bus.on('ping', fn);
    off();
    bus.emit('ping', { n: 1 });
    expect(fn).not.toHaveBeenCalled();
  });

  it('notifies onAny listeners with name and payload', () => {
    const bus = new EventBus<TestEvents>();
    const any = vi.fn();
    bus.onAny(any);
    bus.emit('pong', {});
    expect(any).toHaveBeenCalledWith('pong', {});
  });

  it('lets a listener unsubscribe during emit without skipping others', () => {
    const bus = new EventBus<TestEvents>();
    const calls: string[] = [];
    const offA = bus.on('ping', () => {
      calls.push('a');
      offA();
    });
    bus.on('ping', () => calls.push('b'));
    bus.emit('ping', { n: 0 });
    bus.emit('ping', { n: 0 });
    expect(calls).toEqual(['a', 'b', 'b']);
  });
});
