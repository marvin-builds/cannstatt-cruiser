import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { MAX_STATUS_ITEMS } from '../src/feedback-rules';
import type { FeedbackStatusList } from '../src/feedback-types';
import { handleRequest } from '../src/handler';
import { FakeD1 } from './d1-fake';

const BASE = 'https://cannstatt-cruiser-scores.marvinmai.workers.dev';
const ORIGIN = 'https://marvinmai.github.io';
const NOW = Date.parse('2026-10-11T14:37:21Z');
const SESSION = '0123456789abcdef0123456789abcdef';
const KEY_A = '00112233445566778899aabbccddeeff';
const KEY_B = 'fedcba9876543210fedcba9876543210';
const WRONG_KEY = '00000000000000000000000000000000';

const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');

let db: FakeD1;

beforeEach(() => {
  db = new FakeD1();
});

interface Seed {
  status?: string;
  reply?: string | null;
  key?: string | null;
  doneVersion?: string | null;
}

function seed({ status = 'open', reply = null, key = KEY_A, doneVersion = null }: Seed = {}): number {
  const { lastInsertRowid } = db.sqlite
    .prepare(`INSERT INTO feedback (day, kind, text, version, platform, input, orientation, view_width, log, status, reply, key_hash, done_version)
      VALUES ('2026-10-01', 'idea', 'Geheimer Text 0123', '2026-10-11.4', 'android', 'touch', 'portrait', 390, '["TypeError: geheim"]', ?, ?, ?, ?)`)
    .run(status, reply, key === null ? null : sha256(key), doneVersion);
  return Number(lastInsertRowid);
}

function postStatus(body: unknown, { origin = ORIGIN as string | null, type = 'text/plain', database = db.asD1() } = {}): Promise<Response> {
  const headers: Record<string, string> = { 'Content-Type': type };
  if (origin !== null) headers.Origin = origin;
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return handleRequest(new Request(`${BASE}/feedback/status`, { method: 'POST', headers, body: text }), { DB: database }, NOW);
}

/** A database that fails the test on any use. */
const untouchable = new Proxy({}, {
  get() {
    throw new Error('the database must not be touched');
  },
}) as D1Database;

const snapshot = () =>
  JSON.stringify(db.sqlite.prepare('SELECT * FROM feedback').all()) + JSON.stringify(db.sqlite.prepare('SELECT * FROM event_meta').all()) +
  JSON.stringify(db.sqlite.prepare('SELECT * FROM feedback_counts').all());

describe('POST /feedback with a key', () => {
  const report = {
    session: SESSION, kind: 'idea', text: 'Mehr Sterne bitte', version: '2026-10-11.4', platform: 'android',
    input: 'touch', orientation: 'portrait', viewWidth: 360, log: [],
  };
  const post = (body: unknown) =>
    handleRequest(
      new Request(`${BASE}/feedback`, { method: 'POST', headers: { Origin: ORIGIN, 'Content-Type': 'text/plain' }, body: JSON.stringify(body) }),
      { DB: db.asD1() },
      NOW,
    );

  it('answers {ok: true, id} and stores only the SHA-256 of the key', async () => {
    seed();
    const res = await post({ ...report, key: KEY_B });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ ok: true, id: 2 });
    const row = db.sqlite.prepare('SELECT * FROM feedback WHERE id = 2').get() as Record<string, unknown>;
    expect(row.key_hash).toBe(sha256(KEY_B));
    expect(JSON.stringify(db.sqlite.prepare('SELECT * FROM feedback').all())).not.toContain(KEY_B);
  });

  it('still takes a report without a key (key_hash NULL)', async () => {
    expect((await post(report)).status).toBe(201);
    expect(db.sqlite.prepare('SELECT key_hash FROM feedback').get()).toEqual({ key_hash: null });
  });

  it('rejects a malformed key with 400 and stores nothing', async () => {
    for (const key of [KEY_B.toUpperCase(), KEY_B.slice(1), `${KEY_B}0`, 'g'.repeat(32), null, 7, '']) {
      const res = await post({ ...report, key });
      expect(res.status, String(key)).toBe(400);
    }
    expect(db.sqlite.prepare('SELECT COUNT(*) AS n FROM feedback').get()).toEqual({ n: 0 });
  });
});

describe('POST /feedback/status', () => {
  it('answers id, status, reply and doneVersion only for rows whose key matches', async () => {
    const done = seed({ status: 'done', reply: 'Ist drin!', doneVersion: '2026-10-12.1' });
    const rejected = seed({ status: 'rejected', reply: 'Passt nicht zur Strecke.', key: KEY_B });
    const open = seed();
    seed({ status: 'todo', reply: 'Nicht gefragt' });
    const res = await postStatus({ items: [{ id: open, key: KEY_A }, { id: rejected, key: KEY_B }, { id: done, key: KEY_A }] });
    expect(res.status).toBe(200);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    const answer = (await res.json()) as FeedbackStatusList;
    expect(answer).toEqual({
      entries: [
        { id: done, status: 'done', reply: 'Ist drin!', doneVersion: '2026-10-12.1' },
        { id: rejected, status: 'rejected', reply: 'Passt nicht zur Strecke.', doneVersion: null },
        { id: open, status: 'open', reply: null, doneVersion: null },
      ],
    });
    const raw = JSON.stringify(answer);
    for (const secret of ['Geheimer', 'geheim', 'android', '2026-10-01', 'Nicht gefragt', 'key', sha256(KEY_A)]) expect(raw).not.toContain(secret);
  });

  it('omits a row asked with the wrong key, a row without key hash, and unknown or deleted ids', async () => {
    const mine = seed({ status: 'done' });
    const someoneElses = seed({ key: KEY_B, reply: 'Privat' });
    const old = seed({ key: null });
    const deleted = seed();
    db.sqlite.prepare('DELETE FROM feedback WHERE id = ?').run(deleted);
    const res = await postStatus({
      items: [{ id: mine, key: KEY_A }, { id: someoneElses, key: KEY_A }, { id: old, key: WRONG_KEY }, { id: deleted, key: KEY_A }, { id: 999, key: KEY_A }],
    });
    expect(await res.json()).toEqual({ entries: [{ id: mine, status: 'done', reply: null, doneVersion: null }] });
    expect(await (await postStatus({ items: [{ id: someoneElses, key: WRONG_KEY }] })).json()).toEqual({ entries: [] });
  });

  it('takes a JSON content type too', async () => {
    const id = seed();
    const res = await postStatus({ items: [{ id, key: KEY_A }] }, { type: 'application/json' });
    expect(await res.json()).toEqual({ entries: [{ id, status: 'open', reply: null, doneVersion: null }] });
  });

  it(`answers for up to ${MAX_STATUS_ITEMS} items`, async () => {
    const ids = Array.from({ length: MAX_STATUS_ITEMS }, () => seed());
    const res = await postStatus({ items: ids.map((id) => ({ id, key: KEY_A })) });
    expect(res.status).toBe(200);
    expect(((await res.json()) as FeedbackStatusList).entries.map((e) => e.id)).toEqual(ids);
  });

  it('needs no token and writes nothing', async () => {
    const id = seed({ status: 'todo' });
    const before = snapshot();
    expect((await postStatus({ items: [{ id, key: KEY_A }, { id, key: WRONG_KEY }] })).status).toBe(200);
    expect(snapshot()).toBe(before);
  });

  it('rejects a bad body with 400 before touching the database', async () => {
    const tooMany = Array.from({ length: MAX_STATUS_ITEMS + 1 }, (_, i) => ({ id: i + 1, key: KEY_A }));
    for (const body of ['', 'x', '{}', { items: [] }, { items: tooMany }, { items: [{ id: 1, key: 'abc' }] }, { items: [{ id: 0, key: KEY_A }] }, { ids: [1] }]) {
      const res = await postStatus(body, { database: untouchable });
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
      expect(res.headers.get('Cache-Control')).toBe('no-store');
    }
    expect((await postStatus({ items: [{ id: 1, key: KEY_A }] }, { type: 'text/html', database: untouchable })).status).toBe(400);
    expect((await postStatus(JSON.stringify({ items: [{ id: 1, key: KEY_A }], pad: 'x'.repeat(4096) }), { database: untouchable })).status).toBe(400);
  });

  it('refuses a missing or foreign Origin with 403 before touching the database', async () => {
    for (const origin of [null, 'https://evil.example']) {
      const res = await postStatus({ items: [{ id: 1, key: KEY_A }] }, { origin, database: untouchable });
      expect(res.status).toBe(403);
    }
  });

  it('no longer answers the old GET /feedback/status?ids= (404, no database)', async () => {
    const res = await handleRequest(new Request(`${BASE}/feedback/status?ids=1,2`, { headers: { Origin: ORIGIN } }), { DB: untouchable }, NOW);
    expect(res.status).toBe(404);
    for (const method of ['PATCH', 'DELETE', 'PUT']) {
      const other = await handleRequest(new Request(`${BASE}/feedback/status`, { method, headers: { Origin: ORIGIN } }), { DB: untouchable }, NOW);
      expect(other.status, method).toBe(404);
    }
  });
});
