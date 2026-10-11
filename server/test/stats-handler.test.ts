import { beforeEach, describe, expect, it, vi } from 'vitest';
import { condenseAndPruneOnceADay } from '../src/event-store';
import { handleRequest, type Env } from '../src/handler';
import type { InsightsStats } from '../src/insights-types';
import { FakeD1 } from './d1-fake';

const BASE = 'https://cannstatt-cruiser-scores.marvinmai.workers.dev';
const ORIGIN = 'https://marvinmai.github.io';
const NOW = Date.parse('2026-10-11T14:37:21Z');
const TOKEN = 'dGVzdC10b2tlbi1mb3ItdGhlLWluc2lnaHRzLWJvYXJkLTAx';

let db: FakeD1;

function get(path: string, { auth = `Bearer ${TOKEN}` as string | null, env = undefined as Env | undefined } = {}): Promise<Response> {
  const headers: Record<string, string> = { Origin: ORIGIN };
  if (auth !== null) headers.Authorization = auth;
  return handleRequest(new Request(`${BASE}${path}`, { headers }), env ?? { DB: db.asD1(), STATS_TOKEN: TOKEN }, NOW);
}

/** A database that fails the test on any use. */
const untouchable = new Proxy({}, {
  get() {
    throw new Error('the database must not be touched');
  },
}) as D1Database;

let next = 0;
const sessionId = () => (next++).toString(16).padStart(32, '0');

interface SessionSeed {
  day: string;
  input?: string;
  orientation?: string;
  platform?: string;
  kid?: number;
  version?: string;
  country?: string | null;
  region?: string | null;
  city?: string | null;
}

function seedSessions(n: number, seed: SessionSeed): void {
  const insert = db.sqlite.prepare(
    `INSERT INTO events (session, kind, day, hour, version, input, orientation, platform, kid, country, region, city)
     VALUES (?, 'session', ?, 9, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  for (let i = 0; i < n; i++) {
    insert.run(sessionId(), seed.day, seed.version ?? '2026-10-11.1', seed.input ?? 'touch', seed.orientation ?? 'landscape', seed.platform ?? 'android',
      seed.kid ?? 0, seed.country ?? null, seed.region ?? null, seed.city ?? null);
  }
}

function seedEnd(day: string, seconds: number): void {
  db.sqlite.prepare("INSERT INTO events (session, kind, day, hour, seconds) VALUES (?, 'end', ?, 10, ?)").run(sessionId(), day, seconds);
}

function seedRun(day: string, seconds: number, distance: number, score: number): void {
  db.sqlite
    .prepare("INSERT INTO events (session, kind, day, hour, kid, seconds, distance_bucket, score_bucket) VALUES (?, 'run', ?, 10, 0, ?, ?, ?)")
    .run(sessionId(), day, seconds, distance, score);
}

function seedScore(name: string, score: number, date: string): void {
  db.sqlite.prepare("INSERT INTO scores (name, score, distance, duration, version, date, device) VALUES (?, ?, 100, 60, 'v', ?, ?)").run(name, score, date, `seed-${name}`);
}

beforeEach(() => {
  db = new FakeD1();
});

describe('GET /stats access', () => {
  it('answers 401 without a token, without touching the database', async () => {
    const res = await get('/stats?days=7', { auth: null, env: { DB: untouchable, STATS_TOKEN: TOKEN } });
    expect(res.status).toBe(401);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(await res.json()).toEqual({ ok: false, error: 'unauthorized' });
  });

  it('answers 401 for a wrong token or another scheme, without touching the database', async () => {
    for (const auth of [`Bearer ${TOKEN}x`, 'Bearer wrong', `Basic ${TOKEN}`, TOKEN]) {
      expect((await get('/stats?days=7', { auth, env: { DB: untouchable, STATS_TOKEN: TOKEN } })).status, auth).toBe(401);
    }
  });

  it('answers 401 when no token is configured', async () => {
    expect((await get('/stats?days=7', { auth: 'Bearer ', env: { DB: untouchable } })).status).toBe(401);
    expect((await get('/stats?days=7', { auth: 'Bearer undefined', env: { DB: untouchable } })).status).toBe(401);
  });

  it('answers 401 for every range, including 365 and 0, without touching the database', async () => {
    for (const days of [7, 30, 90, 365, 0]) {
      expect((await get(`/stats?days=${days}`, { auth: null, env: { DB: untouchable, STATS_TOKEN: TOKEN } })).status, String(days)).toBe(401);
    }
  });

  it('answers 400 for ranges other than 7, 30, 90, 365 or 0, without touching the database', async () => {
    const bad = ['', '?days=', '?days=1', '?days=14', '?days=7.0', '?days=07', '?days=abc', '?days=7&days=30',
      '?days=00', '?days=-0', '?days=180', '?days=365.0', '?days=3650', '?days=0&days=365'];
    for (const days of bad) {
      const res = await get(`/stats${days}`, { env: { DB: untouchable, STATS_TOKEN: TOKEN } });
      expect(res.status, days).toBe(400);
      expect(await res.json()).toEqual({ ok: false, error: 'bad-request' });
    }
  });
});

async function stats(days = 7): Promise<{ res: Response; body: InsightsStats }> {
  const res = await get(`/stats?days=${days}`);
  expect(res.status).toBe(200);
  return { res, body: (await res.json()) as InsightsStats };
}

describe('GET /stats unexpected errors', () => {
  it('answer 500 JSON with the CORS headers of the origin', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const broken = {
      prepare() {
        throw new Error('D1_ERROR: boom');
      },
    } as unknown as D1Database;
    const res = await get('/stats?days=365', { env: { DB: broken, STATS_TOKEN: TOKEN } });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'server' });
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(logged).toHaveBeenCalled();
    logged.mockRestore();
  });
});

describe('GET /stats answer', () => {
  it('is zero-filled on an empty database, not cached, with CORS headers', async () => {
    const { res, body } = await stats(7);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
    expect(body).toEqual({
      days: 7,
      generatedAt: '2026-10-11T14:37:21.000Z',
      perDay: ['05', '06', '07', '08', '09', '10', '11'].map((d) => ({ day: `2026-10-${d}`, sessions: 0, runs: 0, entries: 0 })),
      sessions: { total: 0, medianSeconds: 0, avgSeconds: 0 },
      runs: {
        total: 0,
        perSession: 0,
        seconds: ['0', '30', '60', '180', '600'].map((key) => ({ key, count: 0 })),
        distance: Array.from({ length: 51 }, (_, i) => ({ key: String(i * 100), count: 0 })),
        score: ['0', '100', '500', '2000', '5000'].map((key) => ({ key, count: 0 })),
      },
      split: { input: [], orientation: [], platform: [], kid: [], version: [], country: [], region: [], city: [] },
      topScores: [],
    });
  });

  it('lists every day of 30 and 90 day ranges', async () => {
    expect((await stats(30)).body.perDay).toHaveLength(30);
    const { body } = await stats(90);
    expect(body.days).toBe(90);
    expect(body.perDay).toHaveLength(90);
    expect(body.perDay[0]!.day).toBe('2026-07-14');
    expect(body.perDay[89]!.day).toBe('2026-10-11');
  });

  it('counts sessions, runs and highscore entries per day within the range', async () => {
    seedSessions(3, { day: '2026-10-11' });
    seedSessions(2, { day: '2026-10-05' });
    seedSessions(4, { day: '2026-10-04' }); // outside 7 days
    seedRun('2026-10-11', 60, 100, 0);
    seedRun('2026-10-09', 60, 100, 0);
    seedRun('2026-10-09', 60, 100, 0);
    seedScore('A', 900, '2026-10-11T10:00:00.000Z');
    seedScore('B', 800, '2026-10-11T23:59:59.000Z');
    seedScore('C', 700, '2026-10-06T08:00:00.000Z');
    seedScore('D', 600, '2026-09-01T08:00:00.000Z');
    const { body } = await stats(7);
    expect(body.perDay).toEqual([
      { day: '2026-10-05', sessions: 2, runs: 0, entries: 0 },
      { day: '2026-10-06', sessions: 0, runs: 0, entries: 1 },
      { day: '2026-10-07', sessions: 0, runs: 0, entries: 0 },
      { day: '2026-10-08', sessions: 0, runs: 0, entries: 0 },
      { day: '2026-10-09', sessions: 0, runs: 2, entries: 0 },
      { day: '2026-10-10', sessions: 0, runs: 0, entries: 0 },
      { day: '2026-10-11', sessions: 3, runs: 1, entries: 2 },
    ]);
    expect(body.sessions.total).toBe(5);
    expect(body.runs.total).toBe(3);
    expect(body.runs.perSession).toBe(0.6);
  });

  it('gives median and average session seconds from end rows in the range', async () => {
    for (const seconds of [300, 30, 120, 60]) seedEnd('2026-10-10', seconds);
    seedEnd('2026-10-01', 9999);
    expect((await stats(7)).body.sessions).toEqual({ total: 0, medianSeconds: 90, avgSeconds: 128 });
    seedEnd('2026-10-11', 7);
    expect((await stats(7)).body.sessions).toEqual({ total: 0, medianSeconds: 60, avgSeconds: 103 });
  });

  it('builds run histograms: seconds into 0/30/60/180/600, distance and score by bucket', async () => {
    const runs: [number, number, number][] = [
      [0, 0, 0], [20, 100, 0], [30, 100, 100], [50, 5000, 100], [60, 1300, 500],
      [170, 1300, 500], [180, 1300, 2000], [590, 0, 5000], [600, 0, 5000], [3600, 0, 5000],
    ];
    for (const [seconds, distance, score] of runs) seedRun('2026-10-10', seconds, distance, score);
    seedRun('2026-09-10', 0, 0, 0);
    const { runs: hist } = (await stats(7)).body;
    expect(hist.total).toBe(10);
    expect(hist.perSession).toBe(0);
    expect(hist.seconds).toEqual([
      { key: '0', count: 2 }, { key: '30', count: 2 }, { key: '60', count: 2 }, { key: '180', count: 2 }, { key: '600', count: 2 },
    ]);
    expect(hist.score).toEqual([
      { key: '0', count: 2 }, { key: '100', count: 2 }, { key: '500', count: 2 }, { key: '2000', count: 1 }, { key: '5000', count: 3 },
    ]);
    const nonZero = hist.distance.filter((entry) => entry.count > 0);
    expect(nonZero).toEqual([{ key: '0', count: 4 }, { key: '100', count: 2 }, { key: '1300', count: 3 }, { key: '5000', count: 1 }]);
  });

  it('splits sessions largest first, shows every place from one session on and merges unknown places into other', async () => {
    const bw = { country: 'DE', region: 'Baden-Württemberg' };
    seedSessions(6, { day: '2026-10-11', ...bw, city: 'Stuttgart', input: 'keys', platform: 'other' });
    seedSessions(4, { day: '2026-10-09', ...bw, city: 'Esslingen', kid: 1, version: '2026-10-08.3' });
    seedSessions(1, { day: '2026-10-11', orientation: 'portrait', platform: 'ios' });
    seedSessions(9, { day: '2026-10-01', country: 'DE', region: 'Berlin', city: 'Berlin' }); // outside 7 days
    const { split } = (await stats(7)).body;
    expect(split).toEqual({
      input: [{ key: 'keys', count: 6 }, { key: 'touch', count: 5 }],
      orientation: [{ key: 'landscape', count: 10 }, { key: 'portrait', count: 1 }],
      platform: [{ key: 'other', count: 6 }, { key: 'android', count: 4 }, { key: 'ios', count: 1 }],
      kid: [{ key: 'false', count: 7 }, { key: 'true', count: 4 }],
      version: [{ key: '2026-10-11.1', count: 7 }, { key: '2026-10-08.3', count: 4 }],
      country: [{ key: 'DE', count: 10 }, { key: 'other', count: 1 }],
      region: [{ key: 'Baden-Württemberg', count: 10 }, { key: 'other', count: 1 }],
      city: [{ key: 'Stuttgart', count: 6 }, { key: 'Esslingen', count: 4 }, { key: 'other', count: 1 }],
    });
  });

  it('includes the current top list as name, score and date', async () => {
    seedScore('Profi', 50_000, '2026-10-01T00:00:00.000Z');
    seedScore('Fuchs', 28_507, '2026-10-09T12:00:00.000Z');
    expect((await stats(7)).body.topScores).toEqual([
      { name: 'Profi', score: 50_000, date: '2026-10-01T00:00:00.000Z' },
      { name: 'Fuchs', score: 28_507, date: '2026-10-09T12:00:00.000Z' },
    ]);
  });
});

describe('GET /stats long ranges (365 and 0) from the day summaries', () => {
  const DAY_MS = 24 * 3600_000;
  const condense = () => condenseAndPruneOnceADay(db.asD1(), NOW);
  const day = (perDay: InsightsStats['perDay'], date: string) => perDay.find((entry) => entry.day === date);

  /** Old days are summarised (and the oldest pruned), today and yesterday still have raw rows. */
  async function seedHistory(): Promise<void> {
    seedSessions(2, { day: '2025-06-01', country: 'DE', region: 'Berlin', city: 'Berlin' });
    seedRun('2025-06-01', 600, 5000, 5000);
    seedEnd('2025-06-01', 100);
    seedSessions(3, { day: '2026-01-15', input: 'keys', country: 'DE', region: 'Baden-Württemberg', city: 'Stuttgart' });
    seedRun('2026-01-15', 60, 100, 100);
    seedRun('2026-01-15', 60, 100, 100);
    for (const seconds of [10, 20, 30, 100]) seedEnd('2026-01-15', seconds);
    seedSessions(1, { day: '2026-10-10', input: 'keys', country: 'DE', region: 'Baden-Württemberg', city: 'Stuttgart' });
    seedEnd('2026-10-10', 200);
    await condense();
    seedSessions(2, { day: '2026-10-11', kid: 1 });
    seedRun('2026-10-11', 30, 0, 0);
    seedEnd('2026-10-11', 50);
    seedEnd('2026-10-11', 90);
    seedScore('Heute', 900, '2026-10-11T10:00:00.000Z');
  }

  it('answers an empty database with today only for 0 and 365 zero days for 365', async () => {
    const all = (await stats(0)).body;
    expect(all.days).toBe(0);
    expect(all.perDay).toEqual([{ day: '2026-10-11', sessions: 0, runs: 0, entries: 0 }]);
    expect(all.sessions).toEqual({ total: 0, medianSeconds: 0, avgSeconds: 0 });
    expect(all.runs.total).toBe(0);
    expect(all.runs.seconds.map((entry) => entry.key)).toEqual(['0', '30', '60', '180', '600']);
    expect(all.split.city).toEqual([]);
    const year = (await stats(365)).body;
    expect(year.days).toBe(365);
    expect(year.perDay).toHaveLength(365);
    expect(year.perDay[0]!.day).toBe('2025-10-12');
    expect(year.perDay[364]!.day).toBe('2026-10-11');
  });

  it('adds summaries and today\'s raw rows for 365 days: totals, per day, weighted median', async () => {
    await seedHistory();
    const { body } = await stats(365);
    expect(body.perDay).toHaveLength(365);
    expect(day(body.perDay, '2026-01-15')).toEqual({ day: '2026-01-15', sessions: 3, runs: 2, entries: 0 });
    expect(day(body.perDay, '2026-10-10')).toEqual({ day: '2026-10-10', sessions: 1, runs: 0, entries: 0 });
    expect(day(body.perDay, '2026-10-11')).toEqual({ day: '2026-10-11', sessions: 2, runs: 1, entries: 1 });
    // Ends: 2026-01-15 4 (sum 160, median 25), 2026-10-10 1 (200), today 2 (sum 140, median 70).
    expect(body.sessions).toEqual({ total: 6, avgSeconds: 71, medianSeconds: 63 });
    expect(body.runs.total).toBe(3);
    expect(body.runs.perSession).toBe(0.5);
  });

  it('builds splits and histograms for 365 days from summaries and raw rows', async () => {
    await seedHistory();
    const { runs, split } = (await stats(365)).body;
    expect(runs.seconds).toEqual([
      { key: '0', count: 0 }, { key: '30', count: 1 }, { key: '60', count: 2 }, { key: '180', count: 0 }, { key: '600', count: 0 },
    ]);
    expect(runs.score).toEqual([
      { key: '0', count: 1 }, { key: '100', count: 2 }, { key: '500', count: 0 }, { key: '2000', count: 0 }, { key: '5000', count: 0 },
    ]);
    expect(runs.distance.filter((entry) => entry.count > 0)).toEqual([{ key: '0', count: 1 }, { key: '100', count: 2 }]);
    expect(split).toEqual({
      input: [{ key: 'keys', count: 4 }, { key: 'touch', count: 2 }],
      orientation: [{ key: 'landscape', count: 6 }],
      platform: [{ key: 'android', count: 6 }],
      kid: [{ key: 'false', count: 4 }, { key: 'true', count: 2 }],
      version: [{ key: '2026-10-11.1', count: 6 }],
      country: [{ key: 'DE', count: 4 }, { key: 'other', count: 2 }],
      region: [{ key: 'Baden-Württemberg', count: 4 }, { key: 'other', count: 2 }],
      city: [{ key: 'Stuttgart', count: 4 }, { key: 'other', count: 2 }],
    });
  });

  it('covers every day since the first recorded one for 0 (Alles)', async () => {
    await seedHistory();
    const { body } = await stats(0);
    expect(body.days).toBe(0);
    expect(body.perDay).toHaveLength((Date.parse('2026-10-11') - Date.parse('2025-06-01')) / DAY_MS + 1);
    expect(body.perDay[0]).toEqual({ day: '2025-06-01', sessions: 2, runs: 1, entries: 0 });
    expect(body.perDay.at(-1)!.day).toBe('2026-10-11');
    expect(body.sessions).toEqual({ total: 8, avgSeconds: 75, medianSeconds: 68 });
    expect(body.runs.total).toBe(4);
    expect(body.runs.seconds.at(-1)).toEqual({ key: '600', count: 1 });
    expect(body.split.city).toEqual([{ key: 'Stuttgart', count: 4 }, { key: 'Berlin', count: 2 }, { key: 'other', count: 2 }]);
  });

  it('counts finished days that are not summarised yet from their raw rows', async () => {
    seedSessions(2, { day: '2026-10-09' });
    seedEnd('2026-10-09', 40);
    const { body } = await stats(365);
    expect(day(body.perDay, '2026-10-09')!.sessions).toBe(2);
    expect(body.sessions).toEqual({ total: 2, avgSeconds: 40, medianSeconds: 40 });
    await condense();
    expect((await stats(365)).body.sessions).toEqual({ total: 2, avgSeconds: 40, medianSeconds: 40 });
  });

  it('starts Alles at most 3650 days ago', async () => {
    db.sqlite.prepare("INSERT INTO day_summaries (day, metric, key, value) VALUES ('2000-01-01', 'total', 'sessions', 5)").run();
    const { body } = await stats(0);
    expect(body.perDay).toHaveLength(3650);
    expect(body.perDay.at(-1)!.day).toBe('2026-10-11');
  });

  it('keeps the 7, 30 and 90 day answers unchanged by condensing', async () => {
    for (const date of ['2026-07-14', '2026-09-01', '2026-10-08', '2026-10-11']) {
      seedSessions(2, { day: date, city: 'Stuttgart' });
      seedRun(date, 60, 100, 100);
      seedEnd(date, 30);
      seedEnd(date, 90);
    }
    const before = await Promise.all([7, 30, 90].map(async (days) => (await stats(days)).body));
    await condense();
    const after = await Promise.all([7, 30, 90].map(async (days) => (await stats(days)).body));
    expect(after).toEqual(before);
    expect(before.map((body) => body.sessions.total)).toEqual([4, 4, 8]);
  });
});
