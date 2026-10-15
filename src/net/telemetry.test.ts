import { describe, expect, it } from 'vitest';
import { createStore, type Store } from '../core/storage';
import type { FetchLike } from './api';
import {
  distanceBucket,
  endEvent,
  endSeconds,
  loadStatsOptOut,
  newSessionId,
  PRODUCTION_HOST,
  runEvent,
  runSecondsBucket,
  saveStatsOptOut,
  scoreBucket,
  sessionEvent,
  Telemetry,
  telemetryBaseUrl,
  type BeaconLike,
} from './telemetry';
import { MAX_DISTANCE_M, MAX_END_SECONDS, MAX_RUN_SECONDS, SESSION_ID_PATTERN, TEST_DEVICE_KEY } from './telemetry-types';
import { SCORES_URL } from './api';

function memoryStore(): Store & { raw: Map<string, string> } {
  const raw = new Map<string, string>();
  const store = createStore({
    getItem: (k: string) => raw.get(k) ?? null,
    setItem: (k: string, v: string) => void raw.set(k, v),
  } as unknown as Storage);
  return Object.assign(store, { raw });
}

interface Sent {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body: unknown;
}

function fakeNet(options: { fetchFails?: 'reject' | 'throw'; beaconThrows?: boolean } = {}) {
  const fetched: Sent[] = [];
  const beacons: { url: string; body: unknown }[] = [];
  const fetchFn: FetchLike = (url, init) => {
    if (options.fetchFails === 'throw') throw new Error('sync boom');
    fetched.push({ url, method: init?.method, headers: init?.headers, body: JSON.parse(init?.body ?? 'null') });
    if (options.fetchFails === 'reject') return Promise.reject(new Error('offline'));
    return Promise.resolve({ ok: true, status: 204, json: () => Promise.resolve(null) });
  };
  const beacon: BeaconLike = (url, body) => {
    if (options.beaconThrows) throw new Error('beacon boom');
    beacons.push({ url, body: JSON.parse(body) });
    return true;
  };
  return { fetched, beacons, fetchFn, beacon };
}

const SESSION = 'a'.repeat(32);
const INFO = { touch: true, platform: 'android', kid: false } as const;

function telemetry(net = fakeNet(), store = memoryStore(), baseUrl: string | null = 'https://stats.test', returning?: boolean) {
  const t = new Telemetry({ baseUrl, fetch: net.fetchFn, beacon: net.beacon, store, version: '2026-10-11.1', session: SESSION, returning });
  return { t, net, store };
}

describe('buckets', () => {
  it('score: the largest lower bound at or below the score', () => {
    expect(scoreBucket(0)).toBe(0);
    expect(scoreBucket(99)).toBe(0);
    expect(scoreBucket(100)).toBe(100);
    expect(scoreBucket(499)).toBe(100);
    expect(scoreBucket(1999)).toBe(500);
    expect(scoreBucket(2000)).toBe(2000);
    expect(scoreBucket(4999.9)).toBe(2000);
    expect(scoreBucket(5000)).toBe(5000);
    expect(scoreBucket(9_999_999)).toBe(5000);
    expect(scoreBucket(-5)).toBe(0);
  });

  it('distance: game px to metres, floored to 100 m, capped', () => {
    expect(distanceBucket(0)).toBe(0);
    expect(distanceBucket(999)).toBe(0); // 99.9 m
    expect(distanceBucket(1000)).toBe(100);
    expect(distanceBucket(12_345)).toBe(1200);
    expect(distanceBucket(50_000)).toBe(MAX_DISTANCE_M);
    expect(distanceBucket(10_000_000)).toBe(MAX_DISTANCE_M);
    expect(distanceBucket(-10)).toBe(0);
  });

  it('run seconds: floored to 10 s, capped', () => {
    expect(runSecondsBucket(0)).toBe(0);
    expect(runSecondsBucket(9.99)).toBe(0);
    expect(runSecondsBucket(10)).toBe(10);
    expect(runSecondsBucket(87.5)).toBe(80);
    expect(runSecondsBucket(MAX_RUN_SECONDS + 1)).toBe(MAX_RUN_SECONDS);
    expect(runSecondsBucket(-1)).toBe(0);
  });

  it('end seconds: whole seconds, capped', () => {
    expect(endSeconds(0)).toBe(0);
    expect(endSeconds(61.9)).toBe(61);
    expect(endSeconds(MAX_END_SECONDS + 100)).toBe(MAX_END_SECONDS);
    expect(endSeconds(-3)).toBe(0);
  });
});

describe('event builders', () => {
  it('session: input from the display, platform, kid, version; no orientation (ROADMAP 69)', () => {
    expect(sessionEvent(SESSION, '2026-10-11.1', INFO)).toEqual({
      kind: 'session',
      session: SESSION,
      version: '2026-10-11.1',
      input: 'touch',
      platform: 'android',
      kid: false,
    });
    expect(sessionEvent(SESSION, 'v', { touch: false, platform: 'other', kid: true })).toMatchObject({ input: 'keys', kid: true });
  });

  it('session: carries no orientation (ROADMAP 69)', () => {
    expect('orientation' in sessionEvent(SESSION, 'v', INFO)).toBe(false);
  });

  it('session flags (ROADMAP 55): tester only when true, returning when known', () => {
    const base = sessionEvent(SESSION, 'v', INFO);
    expect(sessionEvent(SESSION, 'v', INFO, { tester: false })).toEqual(base);
    expect(sessionEvent(SESSION, 'v', INFO, { tester: true })).toEqual({ ...base, tester: true });
    expect(sessionEvent(SESSION, 'v', INFO, { tester: false, returning: false })).toEqual({ ...base, returning: false });
    expect(sessionEvent(SESSION, 'v', INFO, { tester: true, returning: true })).toEqual({ ...base, tester: true, returning: true });
    expect('returning' in sessionEvent(SESSION, 'v', INFO, { tester: false, returning: undefined })).toBe(false);
  });

  it('run: only buckets, never the exact score', () => {
    expect(runEvent(SESSION, { score: 2345, distance: 15_678, seconds: 93.4 }, true)).toEqual({
      kind: 'run',
      session: SESSION,
      seconds: 90,
      score: 2000,
      distance: 1500,
      kid: true,
    });
  });

  it('end: whole active seconds', () => {
    expect(endEvent(SESSION, 125.7)).toEqual({ kind: 'end', session: SESSION, seconds: 125 });
  });
});

describe('session id', () => {
  it('is 32 lowercase hex from the random source', () => {
    const id = newSessionId();
    expect(id).toMatch(SESSION_ID_PATTERN);
    expect(newSessionId()).not.toBe(id);
    expect(newSessionId((a) => a.fill(255))).toBe('f'.repeat(32));
    expect(newSessionId((a) => a.fill(1))).toBe('01'.repeat(16));
  });

  it('is kept in memory only: sending stores nothing', () => {
    const store = memoryStore();
    const { t } = telemetry(fakeNet(), store);
    t.session(INFO);
    t.run({ score: 10, distance: 10, seconds: 10 }, false);
    t.played(5);
    t.end();
    expect([...store.raw.keys()]).toEqual([]);
  });

  it('a new Telemetry draws a fresh valid id', () => {
    const net = fakeNet();
    new Telemetry({ baseUrl: 'https://stats.test', fetch: net.fetchFn, beacon: null, store: memoryStore(), version: 'v' }).session(INFO);
    expect((net.fetched[0]!.body as { session: string }).session).toMatch(SESSION_ID_PATTERN);
  });
});

describe('gate (telemetryBaseUrl)', () => {
  const prod = { hostname: PRODUCTION_HOST, dev: false, gpc: false };

  it('sends to the live worker only from the production host in a production build', () => {
    expect(telemetryBaseUrl(prod)).toBe(SCORES_URL);
  });

  it('blocks other hosts, the dev server and Global Privacy Control', () => {
    expect(telemetryBaseUrl({ ...prod, hostname: 'localhost' })).toBeNull();
    expect(telemetryBaseUrl({ ...prod, hostname: '127.0.0.1' })).toBeNull();
    expect(telemetryBaseUrl({ ...prod, hostname: 'evil.marvin-builds.github.io' })).toBeNull();
    expect(telemetryBaseUrl({ ...prod, dev: true })).toBeNull();
    expect(telemetryBaseUrl({ ...prod, gpc: true })).toBeNull();
  });

  it('an explicit base URL (manual or play tests) works on any host, never against GPC, with no fallback', () => {
    expect(telemetryBaseUrl({ hostname: 'localhost', dev: true, gpc: false, baseUrl: 'http://127.0.0.1:8787/' })).toBe('http://127.0.0.1:8787');
    expect(telemetryBaseUrl({ hostname: 'localhost', dev: true, gpc: true, baseUrl: 'http://127.0.0.1:8787' })).toBeNull();
    expect(telemetryBaseUrl({ hostname: 'localhost', dev: false, gpc: false, baseUrl: '' })).toBeNull();
  });
});

describe('Telemetry sender', () => {
  it('POSTs the session as text/plain JSON to /event', () => {
    const { t, net } = telemetry();
    t.session(INFO);
    expect(net.fetched).toEqual([
      {
        url: 'https://stats.test/event',
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: sessionEvent(SESSION, '2026-10-11.1', INFO),
      },
    ]);
  });

  it('sends the session once per page load', () => {
    const { t, net } = telemetry();
    t.session(INFO);
    t.session(INFO);
    expect(net.fetched).toHaveLength(1);
  });

  it('sends each run with buckets', () => {
    const { t, net } = telemetry();
    t.session(INFO);
    t.run({ score: 600, distance: 2500, seconds: 31 }, false);
    expect(net.fetched[1]!.body).toEqual({ kind: 'run', session: SESSION, seconds: 30, score: 500, distance: 200, kid: false });
  });

  it('end goes through the beacon with the accumulated active play seconds', () => {
    const { t, net } = telemetry();
    t.session(INFO);
    t.played(30.5);
    t.played(12.7);
    t.end();
    expect(net.beacons).toEqual([{ url: 'https://stats.test/event', body: { kind: 'end', session: SESSION, seconds: 43 } }]);
    t.played(10);
    t.end();
    expect((net.beacons[1]!.body as { seconds: number }).seconds).toBe(53);
    expect(net.fetched).toHaveLength(1);
  });

  it('end falls back to fetch without a beacon', () => {
    const net = fakeNet();
    const t = new Telemetry({ baseUrl: 'https://stats.test', fetch: net.fetchFn, beacon: null, store: memoryStore(), version: 'v', session: SESSION });
    t.session(INFO);
    t.end();
    expect(net.fetched[1]!.body).toEqual({ kind: 'end', session: SESSION, seconds: 0 });
  });

  it('sends nothing for a run or end before the session was sent', () => {
    const { t, net } = telemetry();
    t.run({ score: 1, distance: 1, seconds: 1 }, false);
    t.end();
    expect(net.fetched).toEqual([]);
    expect(net.beacons).toEqual([]);
  });

  it('sends nothing at all without a base URL (gate closed)', () => {
    const { t, net } = telemetry(fakeNet(), memoryStore(), null);
    t.session(INFO);
    t.run({ score: 1, distance: 1, seconds: 1 }, false);
    t.end();
    expect(net.fetched).toEqual([]);
    expect(net.beacons).toEqual([]);
  });

  it('honours the opt-out immediately, also mid-session', () => {
    const store = memoryStore();
    saveStatsOptOut(store, true);
    const { t, net } = telemetry(fakeNet(), store);
    t.session(INFO);
    expect(net.fetched).toEqual([]);
    saveStatsOptOut(store, false);
    t.session(INFO);
    expect(net.fetched).toHaveLength(1);
    saveStatsOptOut(store, true);
    t.run({ score: 1, distance: 1, seconds: 1 }, false);
    t.end();
    expect(net.fetched).toHaveLength(1);
    expect(net.beacons).toEqual([]);
  });

  it('sends the held-back session first when the player opts back in later in the page load', () => {
    const store = memoryStore();
    saveStatsOptOut(store, true);
    const { t, net } = telemetry(fakeNet(), store);
    t.session(INFO);
    t.run({ score: 1, distance: 1, seconds: 1 }, false);
    expect(net.fetched).toEqual([]);
    saveStatsOptOut(store, false);
    t.run({ score: 600, distance: 2500, seconds: 31 }, false);
    expect(net.fetched.map((s) => (s.body as { kind: string }).kind)).toEqual(['session', 'run']);
    expect(net.fetched[0]!.body).toEqual(sessionEvent(SESSION, '2026-10-11.1', INFO));
    t.played(5);
    t.end();
    expect(net.beacons).toHaveLength(1);
    expect(net.fetched).toHaveLength(2);
  });

  it('a held-back session is also sent first by end', () => {
    const store = memoryStore();
    saveStatsOptOut(store, true);
    const { t, net } = telemetry(fakeNet(), store);
    t.session(INFO);
    saveStatsOptOut(store, false);
    t.end();
    expect(net.fetched.map((s) => (s.body as { kind: string }).kind)).toEqual(['session']);
    expect(net.beacons).toHaveLength(1);
  });

  it('never throws when fetch rejects or throws, or the beacon throws', async () => {
    for (const fetchFails of ['reject', 'throw'] as const) {
      const { t } = telemetry(fakeNet({ fetchFails, beaconThrows: true }));
      expect(() => {
        t.session(INFO);
        t.run({ score: 1, distance: 1, seconds: 1 }, false);
        t.end();
      }).not.toThrow();
    }
    await new Promise((r) => setTimeout(r, 0)); // a rejected fetch must not surface as an unhandled rejection
  });
});

describe('session flags (ROADMAP 55)', () => {
  const sentSession = (net: ReturnType<typeof fakeNet>) => net.fetched[0]!.body as Record<string, unknown>;

  it('carries tester: true only while the board marked this device (store true)', () => {
    for (const [stored, tester] of [[true, true], [false, undefined], ['1', undefined], [undefined, undefined]] as const) {
      const store = memoryStore();
      if (stored !== undefined) store.set(TEST_DEVICE_KEY, stored);
      const { t, net } = telemetry(fakeNet(), store);
      t.session(INFO);
      expect(sentSession(net).tester, String(stored)).toBe(tester);
      expect('tester' in sentSession(net)).toBe(tester === true);
    }
  });

  it('reads the marker when the session goes out, never writes it', () => {
    const store = memoryStore();
    saveStatsOptOut(store, true);
    const { t, net } = telemetry(fakeNet(), store);
    t.session(INFO);
    store.set(TEST_DEVICE_KEY, true);
    saveStatsOptOut(store, false);
    t.end();
    expect(sentSession(net).tester).toBe(true);
    expect([...store.raw.keys()].filter((k) => k.endsWith(TEST_DEVICE_KEY))).toHaveLength(1);
  });

  it('carries returning as given at startup, omitted when unknown', () => {
    for (const returning of [true, false]) {
      const { t, net } = telemetry(fakeNet(), memoryStore(), 'https://stats.test', returning);
      t.session(INFO);
      expect(sentSession(net).returning).toBe(returning);
    }
    const { t, net } = telemetry();
    t.session(INFO);
    expect('returning' in sentSession(net)).toBe(false);
  });
});

describe('opt-out setting', () => {
  it('defaults to sending; only a stored true opts out', () => {
    const store = memoryStore();
    expect(loadStatsOptOut(store)).toBe(false);
    store.raw.set('cannstatt-cruiser:statsOptOut', '"junk"');
    expect(loadStatsOptOut(store)).toBe(false);
    saveStatsOptOut(store, true);
    expect(loadStatsOptOut(store)).toBe(true);
    saveStatsOptOut(store, false);
    expect(loadStatsOptOut(store)).toBe(false);
  });
});
