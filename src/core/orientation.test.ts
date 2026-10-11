import { describe, expect, it } from 'vitest';
import { createOrientationLock, type OrientationEnv } from './orientation';

function env(locked: boolean, lockResult: 'ok' | 'reject' | 'missing' = 'ok') {
  const calls: string[] = [];
  const e: OrientationEnv = {
    locked: () => locked,
    lock:
      lockResult === 'missing'
        ? undefined
        : (o) => {
            calls.push(o);
            return lockResult === 'ok' ? Promise.resolve() : Promise.reject(new Error('NotSupported'));
          },
  };
  return { e, calls };
}

describe('orientation lock while typing', () => {
  it('frees portrait while a form is open and locks landscape again when it closes', () => {
    const { e, calls } = env(true);
    const lock = createOrientationLock(e);
    lock.allowPortrait(true);
    lock.allowPortrait(false);
    expect(calls).toEqual(['any', 'landscape']);
  });

  it('does nothing in a plain browser tab, where the game never locked the orientation', () => {
    const { e, calls } = env(false);
    const lock = createOrientationLock(e);
    lock.allowPortrait(true);
    lock.allowPortrait(false);
    expect(calls).toEqual([]);
  });

  it('only acts on a change, so calling it every tick is cheap', () => {
    const { e, calls } = env(true);
    const lock = createOrientationLock(e);
    lock.allowPortrait(false);
    lock.allowPortrait(true);
    lock.allowPortrait(true);
    lock.allowPortrait(false);
    lock.allowPortrait(false);
    expect(calls).toEqual(['any', 'landscape']);
  });

  it('never throws when the browser refuses or has no lock (iOS)', async () => {
    for (const result of ['reject', 'missing'] as const) {
      const lock = createOrientationLock(env(true, result).e);
      expect(() => lock.allowPortrait(true)).not.toThrow();
      expect(() => lock.allowPortrait(false)).not.toThrow();
    }
    await Promise.resolve();
  });
});
