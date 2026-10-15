import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { MAX_DELETE_BYTES } from '../src/feedback-rules';
import type { GitHubFetch } from '../src/github';
import { handleRequest } from '../src/handler';
import { FakeD1 } from './d1-fake';

const BASE = 'https://cannstatt-cruiser-scores.marvin-builds.workers.dev';
const ORIGIN = 'https://marvin-builds.github.io';
const NOW = Date.parse('2026-10-12T14:37:21Z');
const KEY = '00112233445566778899aabbccddeeff';
const OTHER_KEY = 'fedcba9876543210fedcba9876543210';

const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');

const unreachableGitHub: GitHubFetch = async () => {
  throw new Error('GitHub must not be called');
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

function seed(key: string | null = KEY, issue: number | null = null): number {
  const { lastInsertRowid } = db.sqlite
    .prepare(`INSERT INTO feedback (day, kind, text, version, platform, input, orientation, view_width, log, key_hash, issue, status)
      VALUES ('2026-10-11', 'idea', 'Mehr Hunde', '2026-10-11.4', 'android', 'touch', 'portrait', 390, '[]', ?, ?, ?)`)
    .run(key === null ? null : sha256(key), issue, issue === null ? 'open' : 'todo');
  return Number(lastInsertRowid);
}

const ids = () => (db.sqlite.prepare('SELECT id FROM feedback ORDER BY id').all() as { id: number }[]).map(({ id }) => id);

function postDelete(body: unknown, { origin = ORIGIN as string | null, method = 'POST', database = db.asD1() as D1Database } = {}): Promise<Response> {
  const headers: Record<string, string> = { 'Content-Type': 'text/plain' };
  if (origin !== null) headers.Origin = origin;
  const init: RequestInit = { method, headers };
  if (method !== 'GET') init.body = typeof body === 'string' ? body : JSON.stringify(body);
  return handleRequest(new Request(`${BASE}/feedback/delete`, init), { DB: database }, NOW, unreachableGitHub);
}

describe('POST /feedback/delete (ROADMAP 78)', () => {
  it('deletes the row whose id and key match with 204, without a token; then answers 404', async () => {
    const keep = seed();
    const id = seed(KEY, 12);
    const res = await postDelete({ id, key: KEY });
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
    expect(ids()).toEqual([keep]);
    expect((await postDelete({ id, key: KEY })).status).toBe(404);
  });

  it('answers the same 404 for a wrong key, an unknown id and a row without a key, and deletes nothing', async () => {
    const id = seed();
    const keyless = seed(null);
    const answers = await Promise.all([postDelete({ id, key: OTHER_KEY }), postDelete({ id: 99, key: KEY }), postDelete({ id: keyless, key: KEY })]);
    const bodies = await Promise.all(answers.map((res) => res.text()));
    expect(answers.map((res) => res.status)).toEqual([404, 404, 404]);
    expect(new Set(bodies).size).toBe(1);
    expect(ids()).toEqual([id, keyless]);
  });

  it('answers 403 for a foreign or missing Origin before any database access', async () => {
    for (const origin of ['https://evil.example', null]) {
      expect((await postDelete({ id: 1, key: KEY }, { origin, database: untouchable })).status, String(origin)).toBe(403);
    }
  });

  it('answers 400 for a bad or too large body before any database access', async () => {
    for (const body of [{ id: 1 }, { id: 1, key: 'x' }, { id: 0, key: KEY }, { id: 1, key: KEY, all: true }, 'x', `{"id":1,"key":"${KEY}","p":"${'x'.repeat(MAX_DELETE_BYTES)}"}`]) {
      expect((await postDelete(body, { database: untouchable })).status, JSON.stringify(body).slice(0, 40)).toBe(400);
    }
    expect(MAX_DELETE_BYTES).toBeLessThanOrEqual(1024);
  });

  it('answers 404 for other methods', async () => {
    const id = seed();
    expect((await postDelete(undefined, { method: 'GET' })).status).toBe(404);
    expect((await postDelete({ id, key: KEY }, { method: 'DELETE' })).status).toBe(404);
    expect(ids()).toEqual([id]);
  });
});
