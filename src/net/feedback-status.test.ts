import { describe, expect, it } from 'vitest';
import { createMemoryStore, type Store } from '../core/storage';
import type { FetchLike } from './api';
import { FEEDBACK_IDS_KEY, FeedbackStatusCheck, loadFeedbackIds, rememberFeedbackId } from './feedback-status';
import { MAX_REPLY_CHARS, MAX_STATUS_IDS, type FeedbackStatusEntry } from './feedback-types';

const DAY_MS = 24 * 3600_000;
const NOON = Date.parse('2026-10-11T12:00:00Z');

describe('feedback ids on the device', () => {
  it('keeps the ids of sent reports, newest last, at most MAX_STATUS_IDS', () => {
    const store = createMemoryStore();
    expect(loadFeedbackIds(store)).toEqual([]);
    for (let id = 1; id <= MAX_STATUS_IDS + 3; id++) rememberFeedbackId(store, id);
    expect(loadFeedbackIds(store)).toEqual(Array.from({ length: MAX_STATUS_IDS }, (_, i) => i + 4));
  });

  it('keeps an id once', () => {
    const store = createMemoryStore();
    rememberFeedbackId(store, 7);
    rememberFeedbackId(store, 8);
    rememberFeedbackId(store, 7);
    expect(loadFeedbackIds(store)).toEqual([8, 7]);
  });

  it('ignores a damaged stored value', () => {
    for (const value of ['x', { a: 1 }, [1, 'two', -3, 2.5, 4], null]) {
      const store = createMemoryStore();
      store.set(FEEDBACK_IDS_KEY, value);
      expect(loadFeedbackIds(store)).toEqual(Array.isArray(value) ? [1, 4] : []);
    }
  });
});

interface Net {
  calls: string[];
  fetchFn: FetchLike;
}

/** A fake worker: answers GET /feedback/status from `rows` (never the network). */
function fakeWorker(rows: FeedbackStatusEntry[], status = 200): Net {
  const calls: string[] = [];
  const fetchFn: FetchLike = (url) => {
    calls.push(url);
    if (status === 0) return Promise.reject(new Error('offline'));
    const ids = new URL(url).searchParams.get('ids')!.split(',').map(Number);
    const entries = rows.filter((r) => ids.includes(r.id));
    return Promise.resolve({ ok: status < 300, status, json: () => Promise.resolve({ entries }) });
  };
  return { calls, fetchFn };
}

function setup(net: Net, { ids = [3, 5], online = true, baseUrl = 'https://fb.test' as string | null, store = createMemoryStore() as Store } = {}) {
  for (const id of ids) rememberFeedbackId(store, id);
  let now = NOON;
  const make = () => new FeedbackStatusCheck({ baseUrl, fetch: net.fetchFn, store, now: () => now, online: () => online, timeoutMs: 20 });
  return { store, make, check: make(), later: (ms: number) => (now += ms) };
}

describe('feedback status check', () => {
  it('asks GET /feedback/status for the kept ids, without a device id', async () => {
    const net = fakeWorker([]);
    const { check } = setup(net);
    await check.checkIfDue();
    expect(net.calls).toEqual(['https://fb.test/feedback/status?ids=3,5']);
  });

  it('asks at most once per day, also across page loads', async () => {
    const net = fakeWorker([{ id: 3, status: 'open', reply: null }, { id: 5, status: 'open', reply: null }]);
    const { check, make, later } = setup(net);
    await check.checkIfDue();
    await check.checkIfDue();
    await make().checkIfDue();
    expect(net.calls).toHaveLength(1);
    later(DAY_MS);
    await make().checkIfDue();
    expect(net.calls).toHaveLength(2);
  });

  it('a failed check also waits for the next day', async () => {
    const net = fakeWorker([], 0);
    const { check } = setup(net);
    await check.checkIfDue();
    await check.checkIfDue();
    expect(net.calls).toHaveLength(1);
  });

  it('asks nothing without ids, offline or without an endpoint (not the live host)', async () => {
    const net = fakeWorker([]);
    await setup(net, { ids: [] }).check.checkIfDue();
    await setup(net, { online: false }).check.checkIfDue();
    await setup(net, { baseUrl: null }).check.checkIfDue();
    expect(net.calls).toEqual([]);
  });

  it('shows a done note once, then never again (also after a reload and the next check)', async () => {
    const net = fakeWorker([{ id: 3, status: 'done', reply: null }, { id: 5, status: 'open', reply: null }]);
    const { check, make, later } = setup(net);
    expect(check.note).toBeNull();
    await check.checkIfDue();
    expect(check.note).toEqual({ id: 3, status: 'done', reply: null });
    expect(make().note).toEqual({ id: 3, status: 'done', reply: null });
    check.dismiss();
    expect(check.note).toBeNull();
    later(DAY_MS);
    const next = make();
    await next.checkIfDue();
    expect(next.note).toBeNull();
  });

  it('shows a rejected note with its reply, and a todo note before a later done note', async () => {
    const rows: FeedbackStatusEntry[] = [{ id: 5, status: 'todo', reply: 'Kommt bald' }, { id: 3, status: 'open', reply: null }];
    const net = fakeWorker(rows);
    const { check, make, later } = setup(net);
    await check.checkIfDue();
    expect(check.note).toEqual({ id: 5, status: 'todo', reply: 'Kommt bald' });
    check.dismiss();
    rows[0] = { id: 5, status: 'done', reply: null };
    rows[1] = { id: 3, status: 'rejected', reply: 'Passt nicht zur Strecke.' };
    later(DAY_MS);
    const next = make();
    await next.checkIfDue();
    expect(next.note).toEqual({ id: 5, status: 'done', reply: null });
    next.dismiss();
    expect(next.note).toEqual({ id: 3, status: 'rejected', reply: 'Passt nicht zur Strecke.' });
    next.dismiss();
    expect(next.note).toBeNull();
  });

  it('forgets ids the worker no longer knows (deleted or pruned)', async () => {
    const net = fakeWorker([{ id: 5, status: 'open', reply: null }]);
    const { check, store } = setup(net);
    await check.checkIfDue();
    expect(loadFeedbackIds(store)).toEqual([5]);
  });

  it('keeps everything on a failed or malformed answer', async () => {
    const { check, store } = setup(fakeWorker([], 503));
    await check.checkIfDue();
    expect(loadFeedbackIds(store)).toEqual([3, 5]);
    const junk: FetchLike = () => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ nope: 1 }) });
    const other = setup({ calls: [], fetchFn: junk });
    await other.check.checkIfDue();
    expect(loadFeedbackIds(other.store)).toEqual([3, 5]);
  });

  it('drops invalid rows and ids it did not ask for, and caps a long reply', async () => {
    const rows = [
      { id: 3, status: 'done', reply: 'x'.repeat(MAX_REPLY_CHARS + 50) },
      { id: 5, status: 'weird', reply: null },
      { id: 9, status: 'done', reply: null },
      { id: 5, text: 'never' },
    ];
    const fetchFn: FetchLike = () => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ entries: rows }) });
    const { check } = setup({ calls: [], fetchFn });
    await check.checkIfDue();
    expect(check.note).toEqual({ id: 3, status: 'done', reply: 'x'.repeat(MAX_REPLY_CHARS) });
    check.dismiss();
    expect(check.note).toBeNull();
  });
});
