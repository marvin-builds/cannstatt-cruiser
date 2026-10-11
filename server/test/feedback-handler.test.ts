import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FEEDBACK_DAILY_CAP } from '../src/feedback-store';
import { FEEDBACK_LIST_LIMIT, FEEDBACK_PER_SESSION_PER_DAY, MAX_FEEDBACK_BYTES } from '../src/feedback-rules';
import type { FeedbackList } from '../src/feedback-types';
import { handleRequest, type Env } from '../src/handler';
import { FakeD1 } from './d1-fake';

const BASE = 'https://cannstatt-cruiser-scores.marvinmai.workers.dev';
const ORIGIN = 'https://marvinmai.github.io';
const NOW = Date.parse('2026-10-11T14:37:21Z');
const DAY_MS = 24 * 3600_000;
const TOKEN = 'dGVzdC10b2tlbi1mb3ItdGhlLWluc2lnaHRzLWJvYXJkLTAx';
const SESSION = '0123456789abcdef0123456789abcdef';

const body = {
  session: SESSION, kind: 'bug', text: '  Der Skater bleibt\n\n\n\n\nhängen  ', version: '2026-10-11.4', platform: 'android',
  input: 'touch', orientation: 'portrait', viewWidth: 360, log: ['TypeError: x is undefined'],
};

let db: FakeD1;

beforeEach(() => {
  db = new FakeD1();
});

interface PostOptions {
  origin?: string | null;
  contentType?: string;
  now?: number;
}

function post(payload: unknown, { origin = ORIGIN, contentType = 'text/plain;charset=UTF-8', now = NOW }: PostOptions = {}): Promise<Response> {
  const headers: Record<string, string> = { 'Content-Type': contentType, 'CF-Connecting-IP': '203.0.113.9' };
  if (origin !== null) headers.Origin = origin;
  const request = new Request(`${BASE}/feedback`, { method: 'POST', headers, body: typeof payload === 'string' ? payload : JSON.stringify(payload) });
  return handleRequest(request, { DB: db.asD1() }, now);
}

function get({ auth = `Bearer ${TOKEN}` as string | null, env = undefined as Env | undefined } = {}): Promise<Response> {
  const headers: Record<string, string> = { Origin: ORIGIN };
  if (auth !== null) headers.Authorization = auth;
  return handleRequest(new Request(`${BASE}/feedback`, { headers }), env ?? { DB: db.asD1(), STATS_TOKEN: TOKEN }, NOW);
}

const rows = () => db.sqlite.prepare('SELECT * FROM feedback ORDER BY id').all() as Record<string, unknown>[];
const count = (table: string) => (db.sqlite.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;
const sessionId = (n: number) => n.toString(16).padStart(32, '0');

function seedFeedback(day: string, text = 'Alte Idee', log = '[]'): void {
  db.sqlite
    .prepare(`INSERT INTO feedback (day, kind, text, version, platform, input, orientation, view_width, log)
      VALUES (?, 'idea', ?, '2026-01-01.1', 'other', 'keys', 'landscape', 427, ?)`)
    .run(day, text, log);
}

/** A database that fails the test on any use. */
const untouchable = new Proxy({}, {
  get() {
    throw new Error('the database must not be touched');
  },
}) as D1Database;

describe('POST /feedback stores valid feedback', () => {
  it('answers 201 {ok:true} with CORS and stores the normalised text with the day only', async () => {
    const res = await post(body);
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ ok: true });
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
    expect(rows()).toEqual([
      {
        id: 1, day: '2026-10-11', kind: 'bug', text: 'Der Skater bleibt\n\n\nhängen', version: '2026-10-11.4', platform: 'android',
        input: 'touch', orientation: 'portrait', view_width: 360, log: '["TypeError: x is undefined"]',
      },
    ]);
  });

  it('accepts application/json too', async () => {
    expect((await post(body, { contentType: 'application/json' })).status).toBe(201);
  });

  it('never stores the session id, the IP or the exact time', async () => {
    await post(body);
    const everything = JSON.stringify([
      ...db.sqlite.prepare('SELECT * FROM feedback').all(),
      ...db.sqlite.prepare('SELECT * FROM feedback_counts').all(),
      ...db.sqlite.prepare('SELECT * FROM event_meta').all(),
    ]);
    expect(everything).not.toContain(SESSION);
    expect(everything).not.toContain('203.0.113.9');
    expect(everything).not.toContain('14:37');
    expect(everything).not.toContain(String(NOW));
  });

  it('keeps only a SHA-256 of the session in the counter table', async () => {
    await post(body);
    const counters = db.sqlite.prepare("SELECT session_hash FROM feedback_counts WHERE session_hash != 'all'").all() as { session_hash: string }[];
    expect(counters).toHaveLength(1);
    expect(counters[0]!.session_hash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('POST /feedback rejects', () => {
  it('a missing or foreign Origin with 403 and stores nothing', async () => {
    expect((await post(body, { origin: null })).status).toBe(403);
    expect((await post(body, { origin: 'https://evil.example' })).status).toBe(403);
    expect(count('feedback')).toBe(0);
  });

  it('another content type, an oversized body and invalid bodies with 400', async () => {
    const bad = [
      await post(body, { contentType: 'application/x-www-form-urlencoded' }),
      await post(JSON.stringify(body).padEnd(MAX_FEEDBACK_BYTES + 1, ' ')),
      await post({ ...body, extra: 1 }),
      await post({ ...body, kind: 'praise' }),
      await post({ ...body, version: 'v1' }),
      await post({ ...body, viewWidth: 500 }),
      await post({ ...body, text: 'a' }),
      await post({ ...body, text: 'a'.repeat(501) }),
      await post({ ...body, log: Array(21).fill('x') }),
      await post({ ...body, log: ['x'.repeat(201)] }),
      await post({ ...body, text: 'bell\u0007' }),
      await post('{"kind":'),
    ];
    for (const res of bad) {
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ ok: false, error: 'bad-request' });
    }
    expect(count('feedback')).toBe(0);
  });
});

describe('POST /feedback rate limits', () => {
  it(`allows ${FEEDBACK_PER_SESSION_PER_DAY} per session and day, then answers 429 {error:'rate'}`, async () => {
    for (let i = 0; i < FEEDBACK_PER_SESSION_PER_DAY; i++) expect((await post(body)).status).toBe(201);
    const res = await post(body);
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ ok: false, error: 'rate' });
    expect(count('feedback')).toBe(FEEDBACK_PER_SESSION_PER_DAY);
    expect((await post({ ...body, session: sessionId(7) })).status).toBe(201);
  });

  it('counts per UTC day: the same session may send again the next day', async () => {
    for (let i = 0; i < FEEDBACK_PER_SESSION_PER_DAY; i++) await post(body);
    expect((await post(body, { now: NOW + DAY_MS })).status).toBe(201);
  });

  it('caps all sessions together per day', async () => {
    db.sqlite.prepare("INSERT INTO feedback_counts (day, session_hash, count) VALUES ('2026-10-11', 'all', ?)").run(FEEDBACK_DAILY_CAP - 1);
    expect((await post(body)).status).toBe(201);
    expect((await post({ ...body, session: sessionId(1) })).status).toBe(429);
    expect(count('feedback')).toBe(1);
  });

  it('does not let one session over its limit use up the global cap', async () => {
    for (let i = 0; i < FEEDBACK_PER_SESSION_PER_DAY + 10; i++) await post(body);
    const global = db.sqlite.prepare("SELECT count FROM feedback_counts WHERE session_hash = 'all'").get() as { count: number };
    expect(global.count).toBe(FEEDBACK_PER_SESSION_PER_DAY);
  });
});

describe('POST /feedback housekeeping', () => {
  it('deletes feedback older than 365 days and past counters on the first feedback of a day', async () => {
    seedFeedback(new Date(NOW - 366 * DAY_MS).toISOString().slice(0, 10), 'zu alt');
    seedFeedback(new Date(NOW - 365 * DAY_MS).toISOString().slice(0, 10), 'gerade noch');
    db.sqlite.prepare("INSERT INTO feedback_counts (day, session_hash, count) VALUES ('2026-10-10', 'all', 5)").run();
    expect((await post(body)).status).toBe(201);
    expect(rows().map((row) => row.text)).toEqual(['gerade noch', 'Der Skater bleibt\n\n\nhängen']);
    expect(count("feedback_counts WHERE day < '2026-10-11'")).toBe(0);
    expect(db.sqlite.prepare("SELECT value FROM event_meta WHERE key = 'feedback-pruned'").get()).toEqual({ value: '2026-10-11' });
  });

  it('runs at most once per UTC day', async () => {
    await post(body);
    seedFeedback('2020-01-01', 'zu alt');
    await post({ ...body, session: sessionId(1) });
    expect(count('feedback')).toBe(3);
    await post({ ...body, session: sessionId(2) }, { now: NOW + DAY_MS });
    expect(rows().map((row) => row.text)).not.toContain('zu alt');
  });

  it('keeps the stored feedback and answers 201 when housekeeping fails, and retries later the same day', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    seedFeedback('2020-01-01', 'zu alt');
    db.sqlite.exec("CREATE TRIGGER fail_prune BEFORE DELETE ON feedback BEGIN SELECT RAISE(ABORT, 'prune failed'); END");
    expect((await post(body)).status).toBe(201);
    expect(count('feedback')).toBe(2);
    expect(db.sqlite.prepare("SELECT value FROM event_meta WHERE key = 'feedback-pruned'").get()).toBeUndefined();
    expect(logged).toHaveBeenCalled();
    db.sqlite.exec('DROP TRIGGER fail_prune');
    await post({ ...body, session: sessionId(1) });
    expect(rows().map((row) => row.text)).not.toContain('zu alt');
    logged.mockRestore();
  });
});

describe('GET /feedback', () => {
  it('answers 401 without, with a wrong or with no configured token, before any database access', async () => {
    for (const res of [
      await get({ auth: null, env: { DB: untouchable, STATS_TOKEN: TOKEN } }),
      await get({ auth: 'Bearer wrong', env: { DB: untouchable, STATS_TOKEN: TOKEN } }),
      await get({ auth: `Basic ${TOKEN}`, env: { DB: untouchable, STATS_TOKEN: TOKEN } }),
      await get({ env: { DB: untouchable } }),
    ]) {
      expect(res.status).toBe(401);
      expect(res.headers.get('WWW-Authenticate')).toBe('Bearer');
    }
  });

  it('lists the feedback newest first with the log as an array, not cached, with CORS', async () => {
    seedFeedback('2026-10-09', 'älter');
    await post(body);
    seedFeedback('2026-10-11', 'später am Tag', '["a","b"]');
    const res = await get();
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
    const list = (await res.json()) as FeedbackList;
    expect(list.entries.map((entry) => entry.text)).toEqual(['später am Tag', 'Der Skater bleibt\n\n\nhängen', 'älter']);
    expect(list.entries[0]).toEqual({
      id: 3, day: '2026-10-11', kind: 'idea', text: 'später am Tag', version: '2026-01-01.1', platform: 'other',
      input: 'keys', orientation: 'landscape', viewWidth: 427, log: ['a', 'b'],
    });
    expect(list.entries[1]!.log).toEqual(['TypeError: x is undefined']);
  });

  it(`returns at most ${FEEDBACK_LIST_LIMIT} entries`, async () => {
    for (let i = 0; i < FEEDBACK_LIST_LIMIT + 5; i++) seedFeedback('2026-10-10', `Idee ${i}`);
    const list = (await (await get()).json()) as FeedbackList;
    expect(list.entries).toHaveLength(FEEDBACK_LIST_LIMIT);
    expect(list.entries[0]!.text).toBe(`Idee ${FEEDBACK_LIST_LIMIT + 4}`);
  });

  it('answers an empty list on an empty database', async () => {
    expect(await (await get()).json()).toEqual({ entries: [] });
  });
});
