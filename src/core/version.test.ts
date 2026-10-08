import { describe, expect, it } from 'vitest';
import type { ChangelogEntry } from '../changelog';
import { createInitialState } from './state';
import { createMemoryStore } from './storage';
import { LAST_SEEN_VERSION_KEY, loadWhatsNew, markVersionSeen } from './version';

const LOG: ChangelogEntry[] = [
  { version: '2026-10-09.1', date: '2026-10-09', items: ['neu'] },
  { version: '2026-10-08.1', date: '2026-10-08', items: ['alt'] },
];

describe('loadWhatsNew', () => {
  it('stores the running build silently on a first visit', () => {
    const store = createMemoryStore();
    expect(loadWhatsNew(store, LOG)).toEqual([]);
    expect(store.get(LAST_SEEN_VERSION_KEY, null)).toBe('2026-10-09.1');
  });

  it('treats a junk stored value like a first visit', () => {
    const store = createMemoryStore();
    store.set(LAST_SEEN_VERSION_KEY, 42);
    expect(loadWhatsNew(store, LOG)).toEqual([]);
    expect(store.get(LAST_SEEN_VERSION_KEY, null)).toBe('2026-10-09.1');
  });

  it('lists the entries newer than the stored version and keeps the stored version', () => {
    const store = createMemoryStore();
    store.set(LAST_SEEN_VERSION_KEY, '2026-10-08.1');
    expect(loadWhatsNew(store, LOG).map((e) => e.version)).toEqual(['2026-10-09.1']);
    expect(store.get(LAST_SEEN_VERSION_KEY, null)).toBe('2026-10-08.1');
  });

  it('lists nothing when the running build was already seen', () => {
    const store = createMemoryStore();
    store.set(LAST_SEEN_VERSION_KEY, '2026-10-09.1');
    expect(loadWhatsNew(store, LOG)).toEqual([]);
  });
});

describe('markVersionSeen', () => {
  it('persists the running build and empties state.whatsNew', () => {
    const store = createMemoryStore();
    store.set(LAST_SEEN_VERSION_KEY, '2026-10-08.1');
    const state = createInitialState();
    state.whatsNew = loadWhatsNew(store, LOG);
    markVersionSeen(state, store, LOG);
    expect(state.whatsNew).toEqual([]);
    expect(store.get(LAST_SEEN_VERSION_KEY, null)).toBe('2026-10-09.1');
    expect(loadWhatsNew(store, LOG)).toEqual([]);
  });
});
