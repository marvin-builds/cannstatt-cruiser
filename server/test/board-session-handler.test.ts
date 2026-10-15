import { beforeEach, describe, expect, it } from 'vitest';
import { BOARD_SESSION_MS, issueSession } from '../src/board-session';
import type { GitHubFetch } from '../src/github';
import { handleRequest, type Env } from '../src/handler';
import { FakeD1 } from './d1-fake';

const BASE = 'https://cannstatt-cruiser-scores.marvin-builds.workers.dev';
const ORIGIN = 'https://marvin-builds.github.io';
const NOW = Date.parse('2026-10-11T14:37:21Z');
const TOKEN = 'dGVzdC10b2tlbi1mb3ItdGhlLWluc2lnaHRzLWJvYXJkLTAx';
const KEY = 'c2Vzc2lvbi1rZXktZm9yLXRlc3RzLW9ubHktMDEyMzQ1Njc4OQ==';
const GITHUB_TOKEN = 'github_pat_11SECRETSECRETSECRET_abcdefghijklmnopqrstuvwxyz';

/** A database that fails the test on any use. */
const untouchable = new Proxy({}, {
  get() {
    throw new Error('the database must not be touched');
  },
}) as D1Database;

/** A GitHub that fails the test when it is called. */
const unreachableGitHub: GitHubFetch = async () => {
  throw new Error('GitHub must not be called');
};

let db: FakeD1;

beforeEach(() => {
  db = new FakeD1();
});

interface CallOptions {
  auth?: string | null;
  body?: unknown;
  env?: Partial<Env>;
  github?: GitHubFetch;
  now?: number;
}

function call(method: string, path: string, { auth = `Bearer ${TOKEN}`, body, env = {}, github = unreachableGitHub, now = NOW }: CallOptions = {}): Promise<Response> {
  const headers: Record<string, string> = { Origin: ORIGIN };
  if (auth !== null) headers.Authorization = auth;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const init: RequestInit = { method, headers };
  if (body !== undefined) init.body = JSON.stringify(body);
  const fullEnv: Env = { DB: db.asD1(), STATS_TOKEN: TOKEN, BOARD_SESSION_KEY: KEY, GITHUB_TOKEN, ...env };
  return handleRequest(new Request(`${BASE}${path}`, init), fullEnv, now, github);
}

function seed(): number {
  const { lastInsertRowid } = db.sqlite
    .prepare(`INSERT INTO feedback (day, kind, text, version, platform, input, orientation, view_width, log)
      VALUES ('2026-10-11', 'bug', 'Der Skater hängt', '2026-10-11.4', 'android', 'touch', 'portrait', 390, '[]')`)
    .run();
  return Number(lastInsertRowid);
}

async function session(now = NOW): Promise<string> {
  return (await issueSession(KEY, now)).token;
}

describe('POST /board/session', () => {
  it('trades the stats token for a signed 7-day session token, uncached', async () => {
    const res = await call('POST', '/board/session');
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
    const body = (await res.json()) as { token: string; expiresAt: number };
    expect(body).toEqual({ token: await session(), expiresAt: NOW + BOARD_SESSION_MS });
    expect(body.token).not.toContain(TOKEN);
  });

  it('answers 401 before any database access without, with a wrong or with a session token', async () => {
    for (const auth of [null, 'Bearer wrong', `Bearer ${await session()}`]) {
      const res = await call('POST', '/board/session', { auth, env: { DB: untouchable } });
      expect(res.status, String(auth)).toBe(401);
      expect(res.headers.get('WWW-Authenticate')).toBe('Bearer');
    }
  });

  it('answers 401 without a configured stats token', async () => {
    expect((await call('POST', '/board/session', { env: { DB: untouchable, STATS_TOKEN: undefined } })).status).toBe(401);
  });

  it('answers 503 without BOARD_SESSION_KEY (also when it is blank)', async () => {
    for (const key of [undefined, '', ' \n']) {
      const res = await call('POST', '/board/session', { env: { DB: untouchable, BOARD_SESSION_KEY: key } });
      expect(res.status).toBe(503);
      expect(await res.json()).toEqual({ ok: false, error: 'session-key-missing' });
    }
  });

  it('answers 404 to other methods', async () => {
    expect((await call('GET', '/board/session', { env: { DB: untouchable } })).status).toBe(404);
  });

  it('accepts a stats token configured with surrounding whitespace', async () => {
    expect((await call('POST', '/board/session', { env: { STATS_TOKEN: `${TOKEN}\n` } })).status).toBe(200);
  });
});

describe('board routes accept a valid session token', () => {
  it('GET /stats and GET /feedback', async () => {
    const auth = `Bearer ${await session()}`;
    expect((await call('GET', '/stats?days=7', { auth })).status).toBe(200);
    expect((await call('GET', '/feedback', { auth })).status).toBe(200);
  });

  it('PATCH and DELETE /feedback/:id', async () => {
    const auth = `Bearer ${await session()}`;
    const id = seed();
    expect((await call('PATCH', `/feedback/${id}`, { auth, body: { status: 'done' } })).status).toBe(200);
    expect((await call('DELETE', `/feedback/${id}`, { auth })).status).toBe(204);
  });

  it('POST /feedback/:id/issue sends the trimmed GitHub token', async () => {
    const id = seed();
    let sent: string | null = null;
    const github: GitHubFetch = async (_url, init) => {
      sent = new Headers(init.headers).get('Authorization');
      return new Response(JSON.stringify({ number: 7 }), { status: 201 });
    };
    const res = await call('POST', `/feedback/${id}/issue`, {
      auth: `Bearer ${await session()}`,
      body: { title: 'Fehler: Der Skater hängt', body: 'Text' },
      env: { GITHUB_TOKEN: `  ${GITHUB_TOKEN}\n` },
      github,
    });
    expect(res.status).toBe(201);
    expect(sent).toBe(`Bearer ${GITHUB_TOKEN}`);
  });

  it('a blank GitHub token counts as missing', async () => {
    const id = seed();
    const res = await call('POST', `/feedback/${id}/issue`, { body: { title: 'Fehler: Der Skater hängt', body: 'Text' }, env: { GITHUB_TOKEN: ' \n' } });
    expect(res.status).toBe(503);
  });
});

describe('board routes refuse other session tokens before any database access', () => {
  const routes: [string, string, unknown][] = [
    ['GET', '/stats?days=7', undefined],
    ['GET', '/feedback', undefined],
    ['POST', '/feedback/1/issue', { title: 'Titel', body: 'Text' }],
    ['PATCH', '/feedback/1', { status: 'done' }],
    ['DELETE', '/feedback/1', undefined],
  ];

  it('an expired, a tampered and a rotated-key session, and any session without the key', async () => {
    const valid = await session();
    const expired = await session(NOW - BOARD_SESSION_MS);
    const tampered = valid.replace(/^v1\.\d+/, `v1.${NOW + BOARD_SESSION_MS - 1}`);
    const rotated = (await issueSession('another-key-after-rotation', NOW)).token;
    const cases: [string, Partial<Env>][] = [
      [expired, {}],
      [tampered, {}],
      [rotated, {}],
      [valid, { BOARD_SESSION_KEY: undefined }],
    ];
    for (const [method, path, body] of routes) {
      for (const [token, env] of cases) {
        const res = await call(method, path, { auth: `Bearer ${token}`, body, env: { DB: untouchable, ...env } });
        expect(res.status, `${method} ${path} ${token}`).toBe(401);
      }
    }
  });
});
