import { beforeEach, describe, expect, it } from 'vitest';
import { DAILY_EVENT_CAP, RUNS_PER_SESSION } from '../src/event-store';
import { MAX_EVENT_BYTES } from '../src/events';
import { handleRequest } from '../src/handler';
import { FakeD1 } from './d1-fake';

const BASE = 'https://cannstatt-cruiser-scores.marvinmai.workers.dev';
const ORIGIN = 'https://marvinmai.github.io';
const NOW = Date.parse('2026-10-11T14:37:21Z');
const DAY_MS = 24 * 3600_000;
const SESSION = '0123456789abcdef0123456789abcdef';
const OTHER = 'fedcba9876543210fedcba9876543210';
const CF = { country: 'DE', region: 'Baden-Württemberg', city: 'Stuttgart', colo: 'FRA', latitude: '48.78', asn: 3320 };

const session = { kind: 'session', session: SESSION, version: '2026-10-11.1', input: 'touch', orientation: 'portrait', platform: 'android', kid: false };
const run = { kind: 'run', session: SESSION, seconds: 120, score: 500, distance: 1300, kid: false };
const end = { kind: 'end', session: SESSION, seconds: 300 };

let db: FakeD1;

interface Options {
  origin?: string | null;
  contentType?: string;
  /** null: a request without `cf`. */
  cf?: Record<string, unknown> | null;
  now?: number;
}

function post(body: unknown, { origin = ORIGIN, contentType = 'text/plain;charset=UTF-8', cf = CF, now = NOW }: Options = {}): Promise<Response> {
  const headers: Record<string, string> = { 'Content-Type': contentType, 'CF-Connecting-IP': '203.0.113.9' };
  if (origin !== null) headers.Origin = origin;
  const request = new Request(`${BASE}/event`, { method: 'POST', headers, body: typeof body === 'string' ? body : JSON.stringify(body) });
  if (cf) Object.defineProperty(request, 'cf', { value: cf });
  return handleRequest(request, { DB: db.asD1() }, now);
}

const rows = (sql = 'SELECT * FROM events ORDER BY id') => db.sqlite.prepare(sql).all() as Record<string, unknown>[];
const count = (where = '1 = 1') => (db.sqlite.prepare(`SELECT COUNT(*) AS n FROM events WHERE ${where}`).get() as { n: number }).n;

function seedEvents(n: number, kind: string, day: string, sessionId = SESSION): void {
  const insert = db.sqlite.prepare('INSERT INTO events (session, kind, day, hour) VALUES (?, ?, ?, 0)');
  for (let i = 0; i < n; i++) insert.run(sessionId, kind, day);
}

beforeEach(() => {
  db = new FakeD1();
});

describe('POST /event stores valid events', () => {
  it('answers 204 with CORS headers and stores a session with its coarse location', async () => {
    const res = await post(session);
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
    expect(rows()).toEqual([
      {
        id: 1, session: SESSION, kind: 'session', day: '2026-10-11', hour: 14, version: '2026-10-11.1', input: 'touch',
        orientation: 'portrait', platform: 'android', kid: 0, country: 'DE', region: 'Baden-Württemberg', city: 'Stuttgart',
        seconds: null, score_bucket: null, distance_bucket: null,
      },
    ]);
  });

  it('stores day and hour only, never the IP or other request data', async () => {
    await post(session);
    await post(run);
    await post(end);
    const stored = JSON.stringify(rows());
    expect(stored).not.toContain('203.0.113.9');
    expect(stored).not.toContain('14:37');
    expect(stored).not.toContain('FRA');
    expect(stored).not.toContain('48.78');
    expect(stored).not.toContain(String(NOW));
  });

  it('accepts application/json too', async () => {
    expect((await post(session, { contentType: 'application/json' })).status).toBe(204);
    expect(count()).toBe(1);
  });

  it('stores runs with their buckets and no location', async () => {
    expect((await post(run)).status).toBe(204);
    expect(rows()[0]).toMatchObject({ kind: 'run', seconds: 120, score_bucket: 500, distance_bucket: 1300, kid: 0, country: null, region: null, city: null, version: null });
  });

  it('stores the location from request.cf only on session rows, trimmed to 64 chars and null when absent', async () => {
    await post(session, { cf: { country: 'DE', region: ' ' + 'R'.repeat(80), city: '' } });
    await post({ ...session, session: OTHER }, { cf: null });
    await post(end, { cf: CF });
    expect(rows('SELECT kind, country, region, city FROM events ORDER BY id')).toEqual([
      { kind: 'session', country: 'DE', region: 'R'.repeat(64), city: null },
      { kind: 'session', country: null, region: null, city: null },
      { kind: 'end', country: null, region: null, city: null },
    ]);
  });

  it('ignores a duplicate session', async () => {
    await post(session);
    expect((await post({ ...session, input: 'keys' })).status).toBe(204);
    expect(rows('SELECT input FROM events')).toEqual([{ input: 'touch' }]);
  });

  it('keeps the largest end seconds per session', async () => {
    await post(end);
    await post({ ...end, seconds: 200 });
    await post({ ...end, seconds: 900 });
    await post({ ...end, session: OTHER, seconds: 10 });
    expect(rows("SELECT session, seconds FROM events WHERE kind = 'end' ORDER BY id")).toEqual([
      { session: SESSION, seconds: 900 },
      { session: OTHER, seconds: 10 },
    ]);
  });

  it(`stores at most ${RUNS_PER_SESSION} runs per session`, async () => {
    seedEvents(RUNS_PER_SESSION - 1, 'run', '2026-10-11');
    expect((await post(run)).status).toBe(204);
    expect((await post(run)).status).toBe(204);
    expect(count(`session = '${SESSION}' AND kind = 'run'`)).toBe(RUNS_PER_SESSION);
    expect((await post({ ...run, session: OTHER })).status).toBe(204);
    expect(count(`session = '${OTHER}'`)).toBe(1);
  });
});

describe('POST /event rejects', () => {
  it('a missing or foreign Origin with 403 and writes nothing', async () => {
    for (const origin of [null, 'https://evil.example', 'https://marvinmai.github.io.evil.example']) {
      const res = await post(session, { origin });
      expect(res.status, String(origin)).toBe(403);
      expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
    }
    expect(count()).toBe(0);
  });

  it('bodies that are too large, not JSON or not valid with 400', async () => {
    const bad = [
      JSON.stringify(session) + ' '.repeat(1100),
      '{not json',
      JSON.stringify({ ...session, version: 'dev' }),
      JSON.stringify({ ...session, name: 'Fuchs' }),
      JSON.stringify({ ...run, seconds: 125 }),
      JSON.stringify({ ...run, score: 1234 }),
      JSON.stringify({ ...run, distance: 1350 }),
    ];
    for (const body of bad) {
      const res = await post(body);
      expect(res.status, body.slice(0, 60)).toBe(400);
      expect(await res.json()).toEqual({ ok: false, error: 'bad-request' });
    }
    expect(count()).toBe(0);
  });

  it('a body of more than MAX_EVENT_BYTES', async () => {
    const json = JSON.stringify(session);
    expect((await post(json + ' '.repeat(MAX_EVENT_BYTES - json.length))).status).toBe(204);
    expect((await post(json + ' '.repeat(MAX_EVENT_BYTES - json.length + 1))).status).toBe(400);
  });

  it('other content types with 400', async () => {
    expect((await post(session, { contentType: 'application/x-www-form-urlencoded' })).status).toBe(400);
    expect(count()).toBe(0);
  });

  it('GET with 404', async () => {
    const res = await handleRequest(new Request(`${BASE}/event`, { headers: { Origin: ORIGIN } }), { DB: db.asD1() }, NOW);
    expect(res.status).toBe(404);
  });
});

describe('POST /event daily cap', () => {
  it(`writes nothing once ${DAILY_EVENT_CAP} events were accepted today, but still answers 204`, async () => {
    db.sqlite.prepare('INSERT INTO event_days (day, accepted) VALUES (?, ?)').run('2026-10-11', DAILY_EVENT_CAP - 1);
    expect((await post(session)).status).toBe(204);
    expect(count()).toBe(1);
    expect((await post(end)).status).toBe(204);
    expect((await post({ ...session, session: OTHER })).status).toBe(204);
    expect(count()).toBe(1);
    expect(db.sqlite.prepare('SELECT accepted FROM event_days WHERE day = ?').get('2026-10-11')).toEqual({ accepted: DAILY_EVENT_CAP });
  });

  it('starts counting again on the next UTC day', async () => {
    db.sqlite.prepare('INSERT INTO event_days (day, accepted) VALUES (?, ?)').run('2026-10-11', DAILY_EVENT_CAP);
    expect((await post(session)).status).toBe(204);
    expect(count()).toBe(0);
    expect((await post(session, { now: NOW + DAY_MS })).status).toBe(204);
    expect(count()).toBe(1);
  });
});

describe('POST /event retention', () => {
  it('deletes events older than 90 days, at most once per UTC day', async () => {
    seedEvents(1, 'session', '2026-07-12', OTHER); // 91 days old
    seedEvents(1, 'session', '2026-07-13', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'); // 90 days old: kept
    await post(session);
    expect(rows('SELECT day FROM events ORDER BY day')).toEqual([{ day: '2026-07-13' }, { day: '2026-10-11' }]);

    seedEvents(1, 'session', '2026-07-01', 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb');
    await post(end, { now: NOW + 3600_000 });
    expect(count("day = '2026-07-01'")).toBe(1);

    await post(end, { now: NOW + DAY_MS });
    expect(count("day < '2026-07-14'")).toBe(0);
  });

  it('forgets the counters of past days when pruning', async () => {
    db.sqlite.prepare('INSERT INTO event_days (day, accepted) VALUES (?, ?)').run('2026-10-10', 42);
    await post(session);
    expect(db.sqlite.prepare('SELECT day, accepted FROM event_days').all()).toEqual([{ day: '2026-10-11', accepted: 1 }]);
  });
});

describe('preflight', () => {
  it('allows the Authorization header for the stats board, without credentials', async () => {
    const res = await handleRequest(new Request(`${BASE}/stats`, { method: 'OPTIONS', headers: { Origin: ORIGIN } }), { DB: db.asD1() }, NOW);
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Headers')).toBe('Content-Type, Authorization');
    expect(res.headers.get('Access-Control-Allow-Credentials')).toBeNull();
  });
});
