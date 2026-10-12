import { describe, expect, it } from 'vitest';
import { initialTab, readStoredTab, storeTab, TAB_STORAGE_KEY, tabFromHash, tabHash } from './tabs';

describe('tabFromHash and tabHash', () => {
  it('reads #feedback and #statistik, nothing else', () => {
    expect(tabFromHash('#feedback')).toBe('feedback');
    expect(tabFromHash('#statistik')).toBe('stats');
    expect(tabFromHash('')).toBeNull();
    expect(tabFromHash('#')).toBeNull();
    expect(tabFromHash('#token=abc')).toBeNull();
  });

  it('writes #feedback and #statistik', () => {
    expect(tabHash('feedback')).toBe('#feedback');
    expect(tabHash('stats')).toBe('#statistik');
    expect(tabFromHash(tabHash('feedback'))).toBe('feedback');
    expect(tabFromHash(tabHash('stats'))).toBe('stats');
  });
});

describe('initialTab', () => {
  it('prefers the hash, then the stored tab, then Statistik', () => {
    expect(initialTab('#feedback', 'stats')).toBe('feedback');
    expect(initialTab('#statistik', 'feedback')).toBe('stats');
    expect(initialTab('', 'feedback')).toBe('feedback');
    expect(initialTab('', 'kaputt')).toBe('stats');
    expect(initialTab('', null)).toBe('stats');
  });
});

describe('readStoredTab and storeTab', () => {
  function memory(): Storage & { data: Map<string, string> } {
    const data = new Map<string, string>();
    return {
      data,
      get length() {
        return data.size;
      },
      clear: () => data.clear(),
      getItem: (k) => data.get(k) ?? null,
      key: () => null,
      removeItem: (k) => void data.delete(k),
      setItem: (k, v) => void data.set(k, v),
    };
  }

  it('keeps only the tab name under its key', () => {
    const storage = memory();
    storeTab(storage, 'feedback');
    expect([...storage.data]).toEqual([[TAB_STORAGE_KEY, 'feedback']]);
    expect(readStoredTab(storage)).toBe('feedback');
  });

  it('survives storage that throws or is missing', () => {
    const throwing = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    expect(readStoredTab(throwing)).toBeNull();
    expect(() => storeTab(throwing, 'stats')).not.toThrow();
    expect(readStoredTab(null)).toBeNull();
    expect(() => storeTab(null, 'stats')).not.toThrow();
  });
});
