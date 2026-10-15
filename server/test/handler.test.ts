import { beforeEach, describe, expect, it } from 'vitest';
import { handleRequest } from '../src/handler';
import { FakeD1 } from './d1-fake';

const BASE = 'https://cannstatt-cruiser-scores.marvin-builds.workers.dev';
const ORIGIN = 'https://marvin-builds.github.io';
const NOW = Date.parse('2026-10-09T12:00:00Z');

const run = { name: 'Flinker Fuchs 42', score: 28507, distance: 4069, duration: 300, version: '2026-10-08.3', device: 'device-0001' };

let db: FakeD1;

function call(method: string, path: string, body?: unknown, now = NOW): Promise<Response> {
  const init: RequestInit = { method, headers: { Origin: ORIGIN, 'Content-Type': 'application/json', 'CF-Connecting-IP': '203.0.113.9' } };
  if (body !== undefined) init.body = typeof body === 'string' ? body : JSON.stringify(body);
  return handleRequest(new Request(`${BASE}${path}`, init), { DB: db.asD1() }, now);
}

/** Inserts rows directly, each under its own device hash (`seed-<name>`) unless one is given. */
function seed(rows: { name: string; score: number; date: string; device?: string }[]): void {
  const insert = db.sqlite.prepare("INSERT INTO scores (name, score, distance, duration, version, date, device) VALUES (?, ?, 100, 60, 'v', ?, ?)");
  for (const row of rows) insert.run(row.name, row.score, row.date, row.device ?? `seed-${row.name}`);
}

function scoreRows(): Record<string, unknown>[] {
  return db.sqlite.prepare('SELECT name, score, date, device FROM scores ORDER BY id').all() as Record<string, unknown>[];
}

beforeEach(() => {
  db = new FakeD1();
});

describe('CORS and routing', () => {
  it('answers the preflight with 204 and CORS headers', async () => {
    const res = await call('OPTIONS', '/score');
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
    expect(res.headers.get('Access-Control-Allow-Methods')).toBe('GET, POST, PATCH, DELETE, OPTIONS');
  });

  it('adds CORS headers to normal responses', async () => {
    const res = await call('GET', '/top');
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
  });

  it('answers unknown routes with 404', async () => {
    const res = await call('GET', '/admin');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ ok: false, error: 'not-found' });
  });
});

describe('GET /top', () => {
  it('returns an empty list, cached for 30 s', async () => {
    const res = await call('GET', '/top');
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=30');
    expect(res.headers.get('Content-Type')).toContain('application/json');
    expect(await res.json()).toEqual({ entries: [] });
  });

  it('returns the best 20 by score, earlier date first on a tie', async () => {
    seed(Array.from({ length: 25 }, (_, i) => ({ name: `P${i}`, score: 1000 + i * 10, date: `2026-10-0${(i % 9) + 1}T00:00:00.000Z` })));
    seed([{ name: 'Late', score: 1240, date: '2026-10-09T00:00:00.000Z' }, { name: 'Early', score: 1240, date: '2026-09-01T00:00:00.000Z' }]);
    const { entries } = (await (await call('GET', '/top')).json()) as { entries: { rank: number; name: string; score: number }[] };
    expect(entries).toHaveLength(20);
    expect(entries.map((e) => e.rank)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
    expect(entries.slice(0, 3).map((e) => e.name)).toEqual(['Early', 'P24', 'Late']);
    expect(entries[0]).toEqual({ rank: 1, name: 'Early', score: 1240, distance: 100, date: '2026-09-01T00:00:00.000Z' });
  });
});

describe('POST /score', () => {
  it('stores a valid run and returns its rank and the list', async () => {
    seed([{ name: 'Profi', score: 50_000, date: '2026-10-01T00:00:00.000Z' }]);
    const res = await call('POST', '/score', { ...run, name: '  Flinker   Fuchs 42 ' });
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(await res.json()).toEqual({
      ok: true,
      stored: true,
      rank: 2,
      best: 28507,
      entries: [
        { rank: 1, name: 'Profi', score: 50_000, distance: 100, date: '2026-10-01T00:00:00.000Z' },
        { rank: 2, name: 'Flinker Fuchs 42', score: 28507, distance: 4069, date: '2026-10-09T12:00:00.000Z' },
      ],
    });
  });

  it('stores only the listed fields and a SHA-256 of the device id', async () => {
    await call('POST', '/score', run);
    const rows = db.sqlite.prepare('SELECT * FROM scores').all();
    expect(rows).toHaveLength(1);
    const stored = rows[0] as Record<string, unknown>;
    expect(Object.keys(stored).sort()).toEqual(['date', 'device', 'distance', 'duration', 'id', 'name', 'score', 'version']);
    expect(stored.device).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(rows)).not.toContain(run.device);
    expect(JSON.stringify(rows)).not.toContain('203.0.113.9');
  });

  it('gives rank null when the run does not reach the top 20', async () => {
    seed(Array.from({ length: 20 }, (_, i) => ({ name: `P${i}`, score: 90_000 + i, date: '2026-10-01T00:00:00.000Z' })));
    const body = (await (await call('POST', '/score', run)).json()) as { ok: boolean; stored: boolean; rank: number | null; entries: unknown[] };
    expect(body.ok).toBe(true);
    expect(body.stored).toBe(true);
    expect(body.rank).toBeNull();
    expect(body.entries).toHaveLength(20);
  });

  it('rejects broken JSON and bodies as 400 bad-request', async () => {
    for (const body of ['{not json', JSON.stringify({ ...run, score: '9' }), JSON.stringify({ ...run, device: 'short' })]) {
      const res = await call('POST', '/score', body);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ ok: false, error: 'bad-request' });
    }
  });

  it('rejects an oversized body as 400 bad-request', async () => {
    const res = await call('POST', '/score', { ...run, padding: 'x'.repeat(5000) });
    expect(res.status).toBe(400);
  });

  it('rejects bad names and implausible runs as 422', async () => {
    const name = await call('POST', '/score', { ...run, name: 'Sch31ss3' });
    expect(name.status).toBe(422);
    expect(await name.json()).toEqual({ ok: false, error: 'name' });
    const cheat = await call('POST', '/score', { ...run, score: 5_000_000 });
    expect(cheat.status).toBe(422);
    expect(await cheat.json()).toEqual({ ok: false, error: 'implausible' });
    expect(db.sqlite.prepare('SELECT COUNT(*) AS n FROM scores').get()).toEqual({ n: 0 });
  });

  it('allows one submission per device every 20 s', async () => {
    expect((await call('POST', '/score', run, NOW)).status).toBe(200);
    const again = await call('POST', '/score', run, NOW + 19_000);
    expect(again.status).toBe(429);
    expect(await again.json()).toEqual({ ok: false, error: 'rate' });
    expect((await call('POST', '/score', { ...run, device: 'device-0002' }, NOW + 19_000)).status).toBe(200);
    expect((await call('POST', '/score', run, NOW + 20_000)).status).toBe(200);
  });

  it('allows 50 submissions per device and day', async () => {
    for (let i = 0; i < 50; i++) expect((await call('POST', '/score', run, NOW + i * 60_000)).status).toBe(200);
    expect((await call('POST', '/score', run, NOW + 50 * 60_000)).status).toBe(429);
    expect((await call('POST', '/score', run, NOW + 24 * 3600_000 + 1)).status).toBe(200);
  });

  it('keeps only the best 500 rows', async () => {
    seed(Array.from({ length: 505 }, (_, i) => ({ name: `P${i}`, score: 100 + i, date: '2026-10-01T00:00:00.000Z' })));
    await call('POST', '/score', run);
    expect(db.sqlite.prepare('SELECT COUNT(*) AS n FROM scores').get()).toEqual({ n: 500 });
    expect(db.sqlite.prepare('SELECT MIN(score) AS low FROM scores').get()).toEqual({ low: 106 });
  });
});

describe('POST /score keeps one row per device', () => {
  type Reply = { ok: boolean; stored: boolean; rank: number | null; best: number; entries: { name: string; score: number }[] };
  const post = async (body: unknown, now: number) => (await (await call('POST', '/score', body, now)).json()) as Reply;

  it('replaces the row in place when the same device beats its score', async () => {
    await post(run, NOW);
    const later = NOW + 60_000;
    const reply = await post({ ...run, name: 'Neuer Name', score: 30_000 }, later);
    expect(reply).toMatchObject({ ok: true, stored: true, rank: 1, best: 30_000 });
    const rows = scoreRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ name: 'Neuer Name', score: 30_000, date: new Date(later).toISOString() });
    expect(reply.entries.map((e) => e.name)).toEqual(['Neuer Name']);
  });

  it('does not store an equal or lower score and answers with the stored best', async () => {
    await post(run, NOW);
    for (const [i, score] of [run.score, run.score - 1].entries()) {
      const reply = await post({ ...run, name: 'Anderer Name', score }, NOW + (i + 1) * 60_000);
      expect(reply).toMatchObject({ ok: true, stored: false, rank: 1, best: run.score });
    }
    expect(scoreRows()).toEqual([expect.objectContaining({ name: run.name, score: run.score, date: new Date(NOW).toISOString() })]);
  });

  it('keeps separate rows for different devices', async () => {
    await post(run, NOW);
    await post({ ...run, device: 'device-0002', score: 100 }, NOW);
    expect(scoreRows()).toHaveLength(2);
  });

  it('gives rank null and stored false when a lower run is outside the top 20 too', async () => {
    seed(Array.from({ length: 20 }, (_, i) => ({ name: `P${i}`, score: 90_000 + i, date: '2026-10-01T00:00:00.000Z' })));
    await post(run, NOW);
    expect(await post({ ...run, score: 10 }, NOW + 60_000)).toMatchObject({ stored: false, rank: null, best: run.score });
  });

  it('answers stored false and best = the run score when the run is pruned at once', async () => {
    seed(Array.from({ length: 500 }, (_, i) => ({ name: `P${i}`, score: 90_000 + i, date: '2026-10-01T00:00:00.000Z' })));
    expect(await post({ ...run, score: 10 }, NOW)).toMatchObject({ stored: false, rank: null, best: 10 });
    expect(scoreRows()).toHaveLength(500);
  });

  it('still counts runs that are not stored for the rate limit', async () => {
    await post(run, NOW);
    await post({ ...run, score: 10 }, NOW + 20_000);
    expect((await call('POST', '/score', run, NOW + 39_000)).status).toBe(429);
  });
});

describe('GET /top?device=', () => {
  const ownOf = async (device: string) => {
    const res = await call('GET', `/top?device=${device}`);
    return { res, body: (await res.json()) as { entries: unknown[]; own: { rank: number | null; score: number } | null } };
  };

  it('adds the device own row with its rank, privately cached', async () => {
    seed([{ name: 'Profi', score: 50_000, date: '2026-10-01T00:00:00.000Z' }]);
    await call('POST', '/score', run);
    const { res, body } = await ownOf(run.device);
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('private, max-age=30');
    expect(body.entries).toHaveLength(2);
    expect(body.own).toEqual({ rank: 2, score: run.score });
  });

  it('gives own null for a device without a row', async () => {
    const { res, body } = await ownOf('device-unknown');
    expect(res.status).toBe(200);
    expect(body).toEqual({ entries: [], own: null });
  });

  it('gives rank null when the device row is outside the top 20', async () => {
    seed(Array.from({ length: 20 }, (_, i) => ({ name: `P${i}`, score: 90_000 + i, date: '2026-10-01T00:00:00.000Z' })));
    await call('POST', '/score', run);
    expect((await ownOf(run.device)).body.own).toEqual({ rank: null, score: run.score });
  });

  it('rejects an invalid device id as 400 bad-request', async () => {
    for (const device of ['', 'short', 'bad%20device!!', 'x'.repeat(65)]) {
      const res = await call('GET', `/top?device=${device}`);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ ok: false, error: 'bad-request' });
    }
  });
});
