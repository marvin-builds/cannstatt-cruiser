import { beforeEach, describe, expect, it } from 'vitest';
import type { FeedbackStatusList } from '../src/feedback-types';
import { handleRequest } from '../src/handler';
import { FakeD1 } from './d1-fake';

const BASE = 'https://cannstatt-cruiser-scores.marvinmai.workers.dev';
const ORIGIN = 'https://marvinmai.github.io';
const NOW = Date.parse('2026-10-11T14:37:21Z');
const SESSION = '0123456789abcdef0123456789abcdef';

let db: FakeD1;

beforeEach(() => {
  db = new FakeD1();
});

function seed(status = 'open', reply: string | null = null, text = 'Geheimer Text 0123'): number {
  const { lastInsertRowid } = db.sqlite
    .prepare(`INSERT INTO feedback (day, kind, text, version, platform, input, orientation, view_width, log, status, reply)
      VALUES ('2026-10-01', 'idea', ?, '2026-10-11.4', 'android', 'touch', 'portrait', 390, '["TypeError: geheim"]', ?, ?)`)
    .run(text, status, reply);
  return Number(lastInsertRowid);
}

function getStatus(query: string, origin: string | null = ORIGIN, method = 'GET'): Promise<Response> {
  const headers: Record<string, string> = {};
  if (origin !== null) headers.Origin = origin;
  return handleRequest(new Request(`${BASE}/feedback/status${query}`, { method, headers }), { DB: db.asD1() }, NOW);
}

/** A database that fails the test on any use. */
const untouchable = new Proxy({}, {
  get() {
    throw new Error('the database must not be touched');
  },
}) as D1Database;

describe('POST /feedback returns the new id', () => {
  const body = {
    session: SESSION, kind: 'idea', text: 'Mehr Sterne bitte', version: '2026-10-11.4', platform: 'android',
    input: 'touch', orientation: 'portrait', viewWidth: 360, log: [],
  };
  const post = () =>
    handleRequest(
      new Request(`${BASE}/feedback`, { method: 'POST', headers: { Origin: ORIGIN, 'Content-Type': 'text/plain' }, body: JSON.stringify(body) }),
      { DB: db.asD1() },
      NOW,
    );

  it('answers {ok: true, id} with the stored row id', async () => {
    seed();
    const res = await post();
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ ok: true, id: 2 });
    expect((await (await post()).json()) as unknown).toEqual({ ok: true, id: 3 });
  });
});

describe('GET /feedback/status', () => {
  it('answers only id, status and reply of the asked rows, with CORS for the game', async () => {
    const done = seed('done', 'Ist drin!');
    const rejected = seed('rejected', 'Passt nicht zur Strecke.');
    const open = seed();
    seed('todo', 'Nicht gefragt');
    const res = await getStatus(`?ids=${open},${rejected},${done}`);
    expect(res.status).toBe(200);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
    const answer = (await res.json()) as FeedbackStatusList;
    expect(answer).toEqual({
      entries: [
        { id: done, status: 'done', reply: 'Ist drin!' },
        { id: rejected, status: 'rejected', reply: 'Passt nicht zur Strecke.' },
        { id: open, status: 'open', reply: null },
      ],
    });
    const raw = JSON.stringify(answer);
    for (const secret of ['Geheimer', 'geheim', 'android', '2026-10', 'Nicht gefragt']) expect(raw).not.toContain(secret);
  });

  it('omits unknown ids', async () => {
    const id = seed('done');
    expect(await (await getStatus(`?ids=99,${id},1000`)).json()).toEqual({ entries: [{ id, status: 'done', reply: null }] });
    expect(await (await getStatus('?ids=42')).json()).toEqual({ entries: [] });
  });

  it('needs no token and writes nothing', async () => {
    const id = seed('todo');
    const before = JSON.stringify(db.sqlite.prepare('SELECT * FROM feedback').all()) + JSON.stringify(db.sqlite.prepare('SELECT * FROM event_meta').all());
    expect((await getStatus(`?ids=${id}`)).status).toBe(200);
    const after = JSON.stringify(db.sqlite.prepare('SELECT * FROM feedback').all()) + JSON.stringify(db.sqlite.prepare('SELECT * FROM event_meta').all());
    expect(after).toBe(before);
  });

  it('rejects bad id lists with 400 before touching the database', async () => {
    for (const query of ['', '?ids=', '?ids=a', '?ids=1,2,3,4,5,6,7,8,9,10,11', '?ids=1&x=2', '?ids=-3']) {
      const res = await handleRequest(new Request(`${BASE}/feedback/status${query}`, { headers: { Origin: ORIGIN } }), { DB: untouchable }, NOW);
      expect(res.status, query).toBe(400);
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
    }
  });

  it('refuses a missing or foreign Origin with 403 before touching the database', async () => {
    for (const origin of [null, 'https://evil.example']) {
      const headers: Record<string, string> = origin ? { Origin: origin } : {};
      const res = await handleRequest(new Request(`${BASE}/feedback/status?ids=1`, { headers }), { DB: untouchable }, NOW);
      expect(res.status).toBe(403);
    }
  });
});
