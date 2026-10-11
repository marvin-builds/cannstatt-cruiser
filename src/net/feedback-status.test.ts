import { describe, expect, it } from 'vitest';
import { createMemoryStore, type Store } from '../core/storage';
import type { FetchLike } from './api';
import { keepReport, sentReport } from './feedback-reports';
import { FEEDBACK_CHECKED_AT_KEY, FeedbackInbox, STATUS_CHECK_SPACING_MS } from './feedback-status';
import { type FeedbackBody, type FeedbackStatusEntry, MAX_REPLY_CHARS } from './feedback-types';

const NOON = Date.parse('2026-10-11T12:00:00Z');
const keyOf = (id: number) => id.toString(16).padStart(32, '0');

const body = (id: number): FeedbackBody => ({
  session: 'b'.repeat(32),
  kind: id % 2 ? 'bug' : 'idea',
  text: `Bericht ${id}`,
  version: '2026-10-11.10',
  platform: 'other',
  input: 'keys',
  orientation: 'landscape',
  viewWidth: 320,
  log: [],
  key: keyOf(id),
});

interface Call {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body: unknown;
}

/** A fake worker: answers POST /feedback/status from `rows` for the items whose key matches (never the network). */
function fakeWorker(rows: FeedbackStatusEntry[], status: number | 'reject' = 200) {
  const calls: Call[] = [];
  const fetchFn: FetchLike = (url, init) => {
    const sent = JSON.parse(init?.body ?? 'null') as { items: { id: number; key: string }[] };
    calls.push({ url, method: init?.method, headers: init?.headers, body: sent });
    if (status === 'reject') return Promise.reject(new Error('offline'));
    const entries = rows.filter((r) => sent.items.some((i) => i.id === r.id && i.key === keyOf(r.id)));
    return Promise.resolve({ ok: status < 300, status, json: () => Promise.resolve({ entries }) });
  };
  return { calls, fetchFn };
}

function setup(
  net: { fetchFn: FetchLike },
  { ids = [3, 5], online = true, baseUrl = 'https://fb.test' as string | null, store = createMemoryStore() as Store } = {},
) {
  for (const id of ids) keepReport(store, sentReport(body(id), id, '2026-10-11'));
  let now = NOON;
  const make = () => new FeedbackInbox({ baseUrl, fetch: net.fetchFn, store, now: () => now, online: () => online, timeoutMs: 20 });
  return { store, make, inbox: make(), later: (ms: number) => (now += ms) };
}

const open = (id: number): FeedbackStatusEntry => ({ id, status: 'open', reply: null, doneVersion: null });

describe('the status check of the own reports', () => {
  it('posts id and key of each kept report as text/plain JSON to /feedback/status (keys never in the URL)', async () => {
    const net = fakeWorker([open(3), open(5)]);
    const { inbox } = setup(net);
    await inbox.checkIfDue();
    expect(net.calls).toEqual([
      {
        url: 'https://fb.test/feedback/status',
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: { items: [{ id: 3, key: keyOf(3) }, { id: 5, key: keyOf(5) }] },
      },
    ]);
  });

  it('asks at most once per 60 s (a failed try counts too)', async () => {
    const net = fakeWorker([], 'reject');
    const { inbox, later } = setup(net);
    await inbox.checkIfDue();
    await inbox.checkIfDue();
    later(STATUS_CHECK_SPACING_MS - 1);
    await inbox.checkIfDue();
    expect(net.calls).toHaveLength(1);
    later(1);
    await inbox.checkIfDue();
    expect(net.calls).toHaveLength(2);
    expect(STATUS_CHECK_SPACING_MS).toBe(60_000);
  });

  it('keeps the minute across a reload, and a clock turned back does not block the check', async () => {
    const net = fakeWorker([open(3), open(5)]);
    const { make, later, store } = setup(net);
    await make().checkIfDue();
    later(10_000);
    await make().checkIfDue(); // a reload 10 s later
    expect(net.calls).toHaveLength(1);
    later(STATUS_CHECK_SPACING_MS);
    await make().checkIfDue();
    expect(net.calls).toHaveLength(2);
    store.set(FEEDBACK_CHECKED_AT_KEY, NOON + 10 * STATUS_CHECK_SPACING_MS); // stored "in the future"
    await make().checkIfDue();
    expect(net.calls).toHaveLength(3);
    store.set(FEEDBACK_CHECKED_AT_KEY, 'kaputt');
    later(1);
    await make().checkIfDue();
    expect(net.calls).toHaveLength(4);
  });

  it('asks nothing without reports, offline or without an endpoint (not the live host)', async () => {
    const net = fakeWorker([]);
    await setup(net, { ids: [] }).inbox.checkIfDue();
    await setup(net, { online: false }).inbox.checkIfDue();
    await setup(net, { baseUrl: null }).inbox.checkIfDue();
    expect(net.calls).toEqual([]);
  });

  it('keeps the answer: status, reply and done version, also after a reload', async () => {
    const net = fakeWorker([
      { id: 3, status: 'done', reply: 'Danke!', doneVersion: '2026-10-12.1' },
      { id: 5, status: 'todo', reply: null, doneVersion: null },
    ]);
    const { inbox, make } = setup(net);
    await inbox.checkIfDue();
    const shown = (i: FeedbackInbox) => i.reports.map((r) => [r.id, r.status, r.reply, r.doneVersion]);
    expect(shown(inbox)).toEqual([
      [5, 'todo', null, null],
      [3, 'done', 'Danke!', '2026-10-12.1'],
    ]);
    expect(shown(make())).toEqual(shown(inbox));
  });

  it('marks a report the worker leaves out as removed, and asks no more about it', async () => {
    const net = fakeWorker([open(5)]);
    const { inbox, later } = setup(net);
    await inbox.checkIfDue();
    expect(inbox.reports.map((r) => [r.id, r.status])).toEqual([
      [5, 'open'],
      [3, 'removed'],
    ]);
    later(STATUS_CHECK_SPACING_MS);
    await inbox.checkIfDue();
    expect(net.calls[1]!.body).toEqual({ items: [{ id: 5, key: keyOf(5) }] });
  });

  it('asks nothing when every kept report was removed', async () => {
    const net = fakeWorker([]);
    const { inbox, later } = setup(net);
    await inbox.checkIfDue();
    later(STATUS_CHECK_SPACING_MS);
    await inbox.checkIfDue();
    expect(net.calls).toHaveLength(1);
  });

  it('keeps everything on a failed or malformed answer', async () => {
    const failed = setup(fakeWorker([], 503));
    await failed.inbox.checkIfDue();
    expect(failed.inbox.reports.map((r) => r.status)).toEqual(['open', 'open']);
    const junk: FetchLike = () => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ nope: 1 }) });
    const other = setup({ fetchFn: junk });
    await other.inbox.checkIfDue();
    expect(other.inbox.reports.map((r) => r.status)).toEqual(['open', 'open']);
  });

  it('drops invalid rows and reports it did not ask for, caps a long reply, ignores a bad version', async () => {
    const rows = [
      { id: 3, status: 'done', reply: 'x'.repeat(MAX_REPLY_CHARS + 50), doneVersion: 'v1<script>' },
      { id: 5, status: 'weird', reply: null, doneVersion: null },
      { id: 9, status: 'done', reply: null, doneVersion: null },
    ];
    const fetchFn: FetchLike = () => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ entries: rows }) });
    const { inbox } = setup({ fetchFn });
    await inbox.checkIfDue();
    expect(inbox.reports.map((r) => [r.id, r.status, r.reply, r.doneVersion])).toEqual([
      [5, 'removed', null, null],
      [3, 'done', 'x'.repeat(MAX_REPLY_CHARS), null],
    ]);
  });
});

describe('the red dot', () => {
  it('shows when a status, reply or done version changed, until "Mein Feedback" was opened (kept across reloads)', async () => {
    const rows = [open(3), open(5)];
    const net = fakeWorker(rows);
    const { inbox, make, later } = setup(net);
    expect(inbox.changed).toBe(false);
    await inbox.checkIfDue();
    expect(inbox.changed).toBe(false);
    for (const change of [
      { id: 3, status: 'todo', reply: null, doneVersion: null },
      { id: 3, status: 'todo', reply: 'Kommt bald', doneVersion: null },
      { id: 3, status: 'done', reply: 'Kommt bald', doneVersion: '2026-10-12.1' },
    ] as FeedbackStatusEntry[]) {
      rows[0] = change;
      later(STATUS_CHECK_SPACING_MS);
      await inbox.checkIfDue();
      expect(inbox.changed, JSON.stringify(change)).toBe(true);
      expect(inbox.changedIds()).toEqual([3]);
      expect(make().changed).toBe(true);
      inbox.markSeen();
      expect(inbox.changed).toBe(false);
      expect(make().changed).toBe(false);
    }
  });

  it('a removed report counts as a change', async () => {
    const { inbox } = setup(fakeWorker([open(3)]));
    await inbox.checkIfDue();
    expect(inbox.changedIds()).toEqual([5]);
  });

  it('a just sent report is nothing new', () => {
    const { inbox } = setup(fakeWorker([]), { ids: [] });
    inbox.add(sentReport(body(4), 4, '2026-10-11'));
    expect(inbox.reports.map((r) => r.id)).toEqual([4]);
    expect(inbox.changed).toBe(false);
  });
});

describe('ROADMAP 57 leftovers', () => {
  it('are dropped from the device when the inbox starts', () => {
    const store = createMemoryStore();
    store.set('feedbackIds', [3, 5]);
    setup(fakeWorker([]), { store, ids: [] });
    expect(store.get('feedbackIds', 'gone')).toBeNull();
  });
});
