import { describe, expect, it } from 'vitest';
import type { OrientationEnv } from '../core/orientation';
import { TypingOrientation } from './typing-orientation';

function env(locked: boolean, canLock = true) {
  const calls: string[] = [];
  const e: OrientationEnv = { locked: () => locked, lock: canLock ? (o) => (calls.push(o), Promise.resolve()) : undefined };
  return { e, calls };
}

describe('typing orientation (ROADMAP 54)', () => {
  it('frees portrait while the player types and locks landscape again after', () => {
    const { e, calls } = env(true);
    const o = new TypingOrientation(e);
    o.update(false);
    expect(calls).toEqual([]);
    o.update(true);
    o.update(true);
    expect(calls).toEqual(['any']);
    o.update(false);
    expect(calls).toEqual(['any', 'landscape']);
  });

  it('frees nothing where the game holds no orientation (plain browser tab) or cannot lock it', () => {
    for (const { e, calls } of [env(false), env(true, false)]) {
      const o = new TypingOrientation(e);
      o.update(true);
      o.update(false);
      expect(calls).toEqual([]);
    }
  });

  it('does nothing without an environment (tests, headless games)', () => {
    expect(() => new TypingOrientation(null).update(true)).not.toThrow();
    expect(new TypingOrientation(null).turnsToLandscape()).toBe(false);
  });

  it('says whether closing a form turns the screen back to landscape (the settle cover waits for it, ROADMAP 75)', () => {
    expect(new TypingOrientation(env(true).e).turnsToLandscape()).toBe(true);
    expect(new TypingOrientation(env(false).e).turnsToLandscape()).toBe(false);
    expect(new TypingOrientation(env(true, false).e).turnsToLandscape()).toBe(false);
  });
});
