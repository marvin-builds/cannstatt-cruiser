import { beforeEach, describe, expect, it } from 'vitest';
import { issueSession } from '../src/board-session';
import { FEEDBACK_PER_SESSION_PER_DAY, MAX_TESTER_PASS_CHARS } from '../src/feedback-rules';
import { FEEDBACK_DAILY_CAP } from '../src/feedback-store';
import { handleRequest, type Env } from '../src/handler';
import { issueTesterPass, TESTER_PASS_MS } from '../src/tester-pass';
import { FakeD1 } from './d1-fake';

const BASE = 'https://cannstatt-cruiser-scores.marvin-builds.workers.dev';
const ORIGIN = 'https://marvin-builds.github.io';
const NOW = Date.parse('2026-10-12T09:15:00Z');
const TOKEN = 'dGVzdC10b2tlbi1mb3ItdGhlLWluc2lnaHRzLWJvYXJkLTAx';
const KEY = 'c2Vzc2lvbi1rZXktZm9yLXRlc3RzLW9ubHktMDEyMzQ1Njc4OQ==';

const feedback = {
  session: '0123456789abcdef0123456789abcdef', kind: 'idea', text: 'Mehr Hunde im Park', version: '2026-10-12.1', platform: 'android',
  input: 'touch', orientation: 'portrait', viewWidth: 390, log: [],
};

/** A database that fails the test on any use. */
const untouchable = new Proxy({}, {
  get() {
    throw new Error('the database must not be touched');
  },
}) as D1Database;

let db: FakeD1;

beforeEach(() => {
  db = new FakeD1();
});

const env = (extra: Partial<Env> = {}): Env => ({ DB: db.asD1(), STATS_TOKEN: TOKEN, BOARD_SESSION_KEY: KEY, ...extra });

function askPass(auth: string | null, extra: Partial<Env> = {}, method = 'POST'): Promise<Response> {
  const headers: Record<string, string> = { Origin: ORIGIN };
  if (auth !== null) headers.Authorization = auth;
  return handleRequest(new Request(`${BASE}/board/tester-pass`, { method, headers }), env(extra), NOW);
}

function send(body: unknown, now = NOW, extra: Partial<Env> = {}): Promise<Response> {
  const headers = { Origin: ORIGIN, 'Content-Type': 'text/plain;charset=UTF-8' };
  return handleRequest(new Request(`${BASE}/feedback`, { method: 'POST', headers, body: JSON.stringify(body) }), env(extra), now);
}

const count = () => (db.sqlite.prepare('SELECT COUNT(*) AS n FROM feedback').get() as { n: number }).n;

describe('POST /board/tester-pass', () => {
  it('answers a signed tester pass to the stats token and to a board session token, uncached', async () => {
    const expected = await issueTesterPass(KEY, NOW);
    for (const auth of [`Bearer ${TOKEN}`, `Bearer ${(await issueSession(KEY, NOW)).token}`]) {
      const res = await askPass(auth, { DB: untouchable });
      expect(res.status).toBe(200);
      expect(res.headers.get('Cache-Control')).toBe('no-store');
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
      expect(await res.json()).toEqual({ pass: expected.pass, scope: 'tester', expiresAt: NOW + TESTER_PASS_MS });
    }
  });

  it('answers 401 before any database access without, with a wrong token or with a tester pass', async () => {
    const pass = (await issueTesterPass(KEY, NOW)).pass;
    for (const auth of [null, 'Bearer wrong', `Bearer ${pass}`]) {
      const res = await askPass(auth, { DB: untouchable });
      expect(res.status, String(auth)).toBe(401);
      expect(res.headers.get('WWW-Authenticate')).toBe('Bearer');
    }
  });

  it('answers 503 without BOARD_SESSION_KEY (also when blank), after the token check', async () => {
    for (const key of [undefined, '', ' \n']) {
      const res = await askPass(`Bearer ${TOKEN}`, { DB: untouchable, BOARD_SESSION_KEY: key });
      expect(res.status).toBe(503);
      expect(await res.json()).toEqual({ ok: false, error: 'session-key-missing' });
    }
    expect((await askPass(null, { DB: untouchable, BOARD_SESSION_KEY: undefined })).status).toBe(401);
  });

  it('answers 404 to other methods', async () => {
    expect((await askPass(`Bearer ${TOKEN}`, { DB: untouchable }, 'GET')).status).toBe(404);
  });
});

describe('board routes refuse a tester pass before any database access', () => {
  it('GET /stats, GET /feedback, PATCH /feedback/:id and POST /board/session', async () => {
    const auth = `Bearer ${(await issueTesterPass(KEY, NOW)).pass}`;
    const routes: [string, string, unknown][] = [
      ['GET', '/stats?days=7', undefined], ['GET', '/feedback', undefined], ['PATCH', '/feedback/1', { status: 'done' }], ['POST', '/board/session', undefined],
    ];
    for (const [method, path, body] of routes) {
      const init: RequestInit = { method, headers: { Origin: ORIGIN, Authorization: auth, 'Content-Type': 'application/json' } };
      if (body !== undefined) init.body = JSON.stringify(body);
      const res = await handleRequest(new Request(`${BASE}${path}`, init), env({ DB: untouchable }), NOW);
      expect(res.status, `${method} ${path}`).toBe(401);
    }
  });
});

describe('POST /feedback with a tester pass', () => {
  it('a valid pass skips the per-session limit and is never stored', async () => {
    const { pass } = await issueTesterPass(KEY, NOW);
    for (let i = 0; i < FEEDBACK_PER_SESSION_PER_DAY + 3; i++) expect((await send({ ...feedback, testerPass: pass })).status).toBe(201);
    expect(count()).toBe(FEEDBACK_PER_SESSION_PER_DAY + 3);
    const stored = JSON.stringify(db.sqlite.prepare('SELECT * FROM feedback').all()) + JSON.stringify(db.sqlite.prepare('SELECT * FROM feedback_counts').all());
    expect(stored).not.toContain(pass);
    expect(stored).not.toContain(pass.split('.')[3]);
  });

  it('the global daily cap still applies with a valid pass', async () => {
    const { pass } = await issueTesterPass(KEY, NOW);
    db.sqlite.prepare("INSERT INTO feedback_counts (day, session_hash, count) VALUES ('2026-10-12', 'all', ?)").run(FEEDBACK_DAILY_CAP);
    const res = await send({ ...feedback, testerPass: pass });
    expect(res.status).toBe(429);
    expect(count()).toBe(0);
  });

  it('an expired, tampered, foreign-key or board-session pass behaves as without a pass (no error, normal limit)', async () => {
    const valid = (await issueTesterPass(KEY, NOW)).pass;
    const passes = [
      (await issueTesterPass(KEY, NOW - TESTER_PASS_MS)).pass,
      valid.slice(0, -1) + (valid.endsWith('A') ? 'B' : 'A'),
      (await issueTesterPass('another-key-after-rotation', NOW)).pass,
      (await issueSession(KEY, NOW)).token,
      TOKEN,
      'x',
    ];
    for (const [i, testerPass] of passes.entries()) {
      const session = i.toString(16).padStart(32, '0');
      for (let n = 0; n < FEEDBACK_PER_SESSION_PER_DAY; n++) expect((await send({ ...feedback, session, testerPass })).status, testerPass).toBe(201);
      expect((await send({ ...feedback, session, testerPass })).status, testerPass).toBe(429);
    }
  });

  it('a valid pass without BOARD_SESSION_KEY behaves as without a pass', async () => {
    const { pass } = await issueTesterPass(KEY, NOW);
    for (let n = 0; n < FEEDBACK_PER_SESSION_PER_DAY; n++) await send({ ...feedback, testerPass: pass }, NOW, { BOARD_SESSION_KEY: undefined });
    expect((await send({ ...feedback, testerPass: pass }, NOW, { BOARD_SESSION_KEY: undefined })).status).toBe(429);
  });

  it('a pass that is not a string or longer than MAX_TESTER_PASS_CHARS is a bad request', async () => {
    for (const testerPass of ['x'.repeat(MAX_TESTER_PASS_CHARS + 1), 12, null, ['pass']]) {
      expect((await send({ ...feedback, testerPass })).status, JSON.stringify(testerPass)).toBe(400);
    }
    expect((await send({ ...feedback, testerPass: 'x'.repeat(MAX_TESTER_PASS_CHARS) })).status).toBe(201);
    expect(count()).toBe(1);
  });
});
