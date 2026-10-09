import { describe, expect, it } from 'vitest';
import { createMemoryStore } from '../core/storage';
import type { ScoreEntry, ScoreError, ScoreSubmission, SubmitResult, TopResult } from './api';
import { SEND_SPACING_MS } from './queue';
import { ScoreService } from './service';

const ENTRY: ScoreEntry = { rank: 1, name: 'Ada', score: 5000, distance: 900, date: '2026-10-09T10:00:00.000Z' };
const RUN = { score: 1200, distance: 3000, seconds: 40.4 };

/** A fake worker: answers come from the queues (default: success), every request is recorded. */
function setup() {
  const posted: ScoreSubmission[] = [];
  const submitAnswers: SubmitResult[] = [];
  const topAnswers: TopResult[] = [];
  let tops = 0;
  const api = {
    async top(): Promise<TopResult> {
      tops++;
      return topAnswers.shift() ?? { ok: true, entries: [ENTRY] };
    },
    async submit(s: ScoreSubmission): Promise<SubmitResult> {
      posted.push(s);
      return submitAnswers.shift() ?? { ok: true, rank: 2, entries: [ENTRY, { ...ENTRY, rank: 2, name: s.name, score: s.score }] };
    },
  };
  const clock = { now: 1_000_000, online: true };
  const timers: { at: number; fn: () => void }[] = [];
  const store = createMemoryStore();
  const service = new ScoreService({
    api,
    store,
    version: '2026-10-09.3',
    device: 'device-1234',
    now: () => clock.now,
    online: () => clock.online,
    schedule: (fn, ms) => void timers.push({ at: clock.now + ms, fn }),
  });
  const fail = (error: ScoreError) => submitAnswers.push({ ok: false, error });
  /** Moves the clock on and runs the timers that came due. */
  const advance = async (ms: number) => {
    clock.now += ms;
    const due = timers.filter((t) => t.at <= clock.now);
    timers.splice(0, timers.length, ...timers.filter((t) => t.at > clock.now));
    for (const t of due) t.fn();
    await new Promise((r) => setTimeout(r, 0));
  };
  return { service, store, api, posted, submitAnswers, topAnswers, clock, timers, fail, advance, tops: () => tops };
}

describe('ScoreService top list', () => {
  it('loads the list and remembers it', async () => {
    const { service } = setup();
    expect(service.topState).toBe('idle');
    const loading = service.refreshTop();
    expect(service.topState).toBe('loading');
    await loading;
    expect(service.topState).toBe('ready');
    expect(service.top).toEqual([ENTRY]);
  });

  it('is offline without a connection and keeps the last list', async () => {
    const { service, clock, topAnswers, tops } = setup();
    await service.refreshTop();
    clock.online = false;
    await service.refreshTop();
    expect(tops()).toBe(1);
    expect(service.topState).toBe('offline');
    expect(service.top).toEqual([ENTRY]);
    clock.online = true;
    topAnswers.push({ ok: false, error: 'offline' });
    await service.refreshTop();
    expect(service.topState).toBe('offline');
    expect(service.top).toEqual([ENTRY]);
  });
});

describe('ScoreService.submit', () => {
  it('sends the run in metres and whole seconds with version and device', async () => {
    const { service, posted } = setup();
    const outcome = await service.submit(RUN, 'Max');
    expect(posted).toEqual([{ name: 'Max', score: 1200, distance: 300, duration: 40, version: '2026-10-09.3', device: 'device-1234' }]);
    expect(outcome).toEqual({ kind: 'ok', rank: 2, entries: expect.any(Array) });
    expect(service.top?.[1]?.name).toBe('Max');
    expect(service.topState).toBe('ready');
  });

  it('passes the server refusals through without queueing', async () => {
    const { service, fail } = setup();
    for (const error of ['name', 'implausible', 'rate', 'bad-request'] as const) {
      fail(error);
      expect(await service.submit(RUN, 'Max')).toEqual({ kind: 'failed', error });
      expect(service.pending).toBeNull();
    }
  });

  it('queues the run when offline (no request at all) or on a server error', async () => {
    const { service, clock, posted, fail } = setup();
    clock.online = false;
    expect(await service.submit(RUN, 'Max')).toEqual({ kind: 'queued', reason: 'offline' });
    expect(posted).toHaveLength(0);
    expect(service.pending?.score).toBe(1200);
    clock.online = true;
    fail('server');
    expect(await service.submit({ ...RUN, score: 2000 }, 'Max')).toEqual({ kind: 'queued', reason: 'server' });
    expect(service.pending?.score).toBe(2000);
    fail('offline');
    expect(await service.submit({ ...RUN, score: 100 }, 'Max')).toEqual({ kind: 'queued', reason: 'offline' });
    expect(service.pending?.score).toBe(2000);
  });
});

describe('ScoreService offline queue', () => {
  it('resends the best pending entry once online, at most one send per 20 s', async () => {
    const { service, clock, posted, advance, fail } = setup();
    fail('offline');
    await service.submit(RUN, 'Max');
    expect(posted).toHaveLength(1);

    // Back online right away: too soon after the last send, so it waits for the spacing.
    await service.retryPending();
    expect(posted).toHaveLength(1);
    await advance(SEND_SPACING_MS - 1);
    expect(posted).toHaveLength(1);
    await advance(1);
    expect(posted).toHaveLength(2);
    expect(posted[1]!.score).toBe(1200);
    expect(service.pending).toBeNull();

    // Nothing pending: nothing sent.
    clock.now += SEND_SPACING_MS;
    await service.retryPending();
    expect(posted).toHaveLength(2);
  });

  it('keeps the entry while still offline or rate limited and drops one the server refuses', async () => {
    const { service, clock, posted, fail } = setup();
    clock.online = false;
    await service.submit(RUN, 'Max');
    await service.retryPending();
    expect(posted).toHaveLength(0);
    clock.online = true;
    fail('rate');
    await service.retryPending();
    expect(posted).toHaveLength(1);
    expect(service.pending).not.toBeNull();
    clock.now += SEND_SPACING_MS;
    fail('name');
    await service.retryPending();
    expect(posted).toHaveLength(2);
    expect(service.pending).toBeNull();
  });

  it('schedules a single retry however often it is asked too soon', async () => {
    const { service, timers, fail } = setup();
    fail('server');
    await service.submit(RUN, 'Max');
    await service.retryPending();
    await service.retryPending();
    await service.retryPending();
    expect(timers).toHaveLength(1);
  });

  it('a queued entry survives a reload (same store)', async () => {
    const first = setup();
    first.clock.online = false;
    await first.service.submit(RUN, 'Max');
    const again = new ScoreService({
      api: first.api,
      store: first.store,
      version: 'v',
      device: 'device-1234',
      now: () => first.clock.now + SEND_SPACING_MS,
      online: () => true,
      schedule: () => {},
    });
    await again.retryPending();
    expect(first.posted.map((p) => p.score)).toEqual([1200]);
    expect(again.pending).toBeNull();
  });
});
