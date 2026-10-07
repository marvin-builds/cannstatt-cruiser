import { describe, expect, it } from 'vitest';
import { createStore } from './storage';

function memoryBackend(): Storage {
  const m = new Map<string, string>();
  return {
    get length() { return m.size; },
    clear: () => m.clear(),
    getItem: (k) => m.get(k) ?? null,
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => void m.delete(k),
    setItem: (k, v) => void m.set(k, v),
  };
}

describe('createStore', () => {
  it('round-trips JSON values under a namespaced key', () => {
    const backend = memoryBackend();
    const store = createStore(backend);
    store.set('highscore', 1234);
    expect(store.get('highscore', 0)).toBe(1234);
    expect(backend.getItem('cannstatt-cruiser:highscore')).toBe('1234');
  });

  it('returns the fallback for missing or corrupt values', () => {
    const backend = memoryBackend();
    backend.setItem('cannstatt-cruiser:bad', '{nope');
    const store = createStore(backend);
    expect(store.get('missing', 5)).toBe(5);
    expect(store.get('bad', 7)).toBe(7);
  });

  it('never throws when storage is unavailable', () => {
    const broken = memoryBackend();
    broken.getItem = () => { throw new Error('denied'); };
    broken.setItem = () => { throw new Error('denied'); };
    const store = createStore(broken);
    expect(() => store.set('x', 1)).not.toThrow();
    expect(store.get('x', 3)).toBe(3);
    expect(createStore(null).get('x', 4)).toBe(4);
  });
});
