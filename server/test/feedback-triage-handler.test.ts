import { beforeEach, describe, expect, it } from 'vitest';
import { FEEDBACK_RETENTION_DAYS } from '../src/feedback-rules';
import { ISSUE_REPO, MAX_REPLY_CHARS } from '../src/feedback-triage-rules';
import type { TriagedFeedbackList } from '../src/feedback-triage-types';
import type { GitHubFetch } from '../src/github';
import { handleRequest, type Env } from '../src/handler';
import { FakeD1 } from './d1-fake';

const BASE = 'https://cannstatt-cruiser-scores.marvinmai.workers.dev';
const ORIGIN = 'https://marvinmai.github.io';
const NOW = Date.parse('2026-10-11T14:37:21Z');
const DAY_MS = 24 * 3600_000;
const TOKEN = 'dGVzdC10b2tlbi1mb3ItdGhlLWluc2lnaHRzLWJvYXJkLTAx';
const GITHUB_TOKEN = 'github_pat_11SECRETSECRETSECRET_abcdefghijklmnopqrstuvwxyz';
const SESSION = '0123456789abcdef0123456789abcdef';

interface GitHubCall {
  url: string;
  init: RequestInit;
}

/** A fake GitHub API: records calls and answers with the given status and body (or throws). */
function fakeGitHub(status = 201, body: unknown = { number: 12, html_url: `https://github.com/${ISSUE_REPO}/issues/12` }) {
  const calls: GitHubCall[] = [];
  const fetch: GitHubFetch = async (url, init) => {
    calls.push({ url, init });
    if (status === 0) throw new Error(`network down for ${GITHUB_TOKEN}`);
    return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });
  };
  return { calls, fetch };
}

/** A GitHub that fails the test when it is called. */
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

function seed(kind: 'bug' | 'idea' = 'bug', day = '2026-10-11'): number {
  const { lastInsertRowid } = db.sqlite
    .prepare(`INSERT INTO feedback (day, kind, text, version, platform, input, orientation, view_width, log)
      VALUES (?, ?, 'Der Skater hängt', '2026-10-11.4', 'android', 'touch', 'portrait', 390, '[]')`)
    .run(day, kind);
  return Number(lastInsertRowid);
}

const row = (id: number) => db.sqlite.prepare('SELECT status, issue, reply FROM feedback WHERE id = ?').get(id) as
  { status: string; issue: number | null; reply: string | null } | undefined;

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
  if (body !== undefined) init.body = typeof body === 'string' ? body : JSON.stringify(body);
  const fullEnv: Env = { DB: db.asD1(), STATS_TOKEN: TOKEN, GITHUB_TOKEN, ...env };
  return handleRequest(new Request(`${BASE}${path}`, init), fullEnv, now, github);
}

const draft = { title: 'Fehler: Der Skater hängt', body: '> Der Skater hängt\n\nVersion 2026-10-11.4 · Android' };

describe('triage routes check the token first', () => {
  const routes: [string, string, unknown][] = [
    ['POST', '/feedback/1/issue', draft],
    ['POST', '/feedback/1/link', { issue: 7 }],
    ['PATCH', '/feedback/1', { status: 'done' }],
    ['DELETE', '/feedback/1', undefined],
    ['PATCH', '/feedback/abc', { status: 'done' }],
  ];

  it('answers 401 before any database query or GitHub call without, with a wrong or with no configured token', async () => {
    for (const [method, path, body] of routes) {
      for (const [auth, statsToken] of [[null, TOKEN], ['Bearer wrong', TOKEN], [`Bearer ${TOKEN}`, undefined]] as const) {
        const res = await call(method, path, { auth, body, env: { DB: untouchable, STATS_TOKEN: statsToken } });
        expect(res.status, `${method} ${path} ${auth}`).toBe(401);
        expect(res.headers.get('WWW-Authenticate')).toBe('Bearer');
        expect(res.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
      }
    }
  });
});

describe('POST /feedback/:id/issue', () => {
  it('creates the issue with the labels of the kind, stores its number and sets status todo', async () => {
    const id = seed('bug');
    const github = fakeGitHub();
    const res = await call('POST', `/feedback/${id}/issue`, { body: draft, github: github.fetch });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ ok: true, issue: 12 });
    expect(row(id)).toEqual({ status: 'todo', issue: 12, reply: null });
    expect(github.calls).toHaveLength(1);
    const [{ url, init }] = github.calls as [GitHubCall];
    expect(url).toBe(`https://api.github.com/repos/${ISSUE_REPO}/issues`);
    expect(init.method).toBe('POST');
    const headers = new Headers(init.headers);
    expect(headers.get('Authorization')).toBe(`Bearer ${GITHUB_TOKEN}`);
    expect(headers.get('Accept')).toBe('application/vnd.github+json');
    expect(headers.get('X-GitHub-Api-Version')).toBe('2022-11-28');
    expect(headers.get('User-Agent')).toMatch(/cannstatt-cruiser/);
    expect(JSON.parse(String(init.body))).toEqual({ title: draft.title, body: draft.body, labels: ['feedback', 'bug'] });
  });

  it('labels an idea as idea', async () => {
    const id = seed('idea');
    const github = fakeGitHub(201, { number: 3 });
    expect((await call('POST', `/feedback/${id}/issue`, { body: draft, github: github.fetch })).status).toBe(201);
    expect(JSON.parse(String(github.calls[0]!.init.body)).labels).toEqual(['feedback', 'idea']);
    expect(row(id)).toEqual({ status: 'todo', issue: 3, reply: null });
  });

  it('maps a GitHub error, a network error or a broken answer to 502 without leaking the token and stores nothing', async () => {
    for (const [status, body] of [[401, { message: `Bad credentials ${GITHUB_TOKEN}` }], [422, { message: 'Validation Failed' }], [0, ''], [201, 'not json'], [201, { number: 'x' }]] as const) {
      const id = seed();
      const res = await call('POST', `/feedback/${id}/issue`, { body: draft, github: fakeGitHub(status, body).fetch });
      expect(res.status, String(status)).toBe(502);
      const text = await res.text();
      expect(JSON.parse(text)).toMatchObject({ ok: false, error: 'github' });
      expect(text).not.toContain(GITHUB_TOKEN);
      expect(text).not.toContain('SECRET');
      expect(row(id)).toEqual({ status: 'open', issue: null, reply: null });
    }
  });

  it('passes GitHub\'s status code on for diagnosis', async () => {
    const id = seed();
    const res = await call('POST', `/feedback/${id}/issue`, { body: draft, github: fakeGitHub(403, { message: 'Resource not accessible' }).fetch });
    expect(await res.json()).toEqual({ ok: false, error: 'github', status: 403 });
  });

  it('answers 503 github-token-missing without the secret and never calls GitHub', async () => {
    const id = seed();
    const res = await call('POST', `/feedback/${id}/issue`, { body: draft, env: { GITHUB_TOKEN: undefined } });
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ ok: false, error: 'github-token-missing' });
    expect(row(id)).toEqual({ status: 'open', issue: null, reply: null });
  });

  it('answers 404 for an unknown id and 409 with the number when the row already has an issue', async () => {
    expect((await call('POST', '/feedback/99/issue', { body: draft })).status).toBe(404);
    const id = seed();
    db.sqlite.prepare("UPDATE feedback SET status = 'todo', issue = 5 WHERE id = ?").run(id);
    const res = await call('POST', `/feedback/${id}/issue`, { body: draft });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ ok: false, error: 'exists', issue: 5 });
  });

  it('rejects a bad id or draft with 400 before GitHub', async () => {
    const id = seed();
    const bad = [
      call('POST', '/feedback/0/issue', { body: draft }),
      call('POST', '/feedback/1.5/issue', { body: draft }),
      call('POST', '/feedback/99999999999999999999/issue', { body: draft }),
      call('POST', `/feedback/${id}/issue`, { body: 'not json' }),
      call('POST', `/feedback/${id}/issue`, { body: { title: draft.title } }),
      call('POST', `/feedback/${id}/issue`, { body: { ...draft, labels: ['x'] } }),
      call('POST', `/feedback/${id}/issue`, { body: { ...draft, title: '  ' } }),
    ];
    for (const res of await Promise.all(bad)) expect(res.status).toBe(400);
    expect(row(id)).toEqual({ status: 'open', issue: null, reply: null });
  });
});

describe('POST /feedback/:id/issue with the developer addition (ROADMAP 75)', () => {
  const addition = 'Kommt mit dem Park-Level.\n> kein Zitat';

  it('puts it into its own marked section after the player\'s quoted text, never inside the quote', async () => {
    const id = seed('idea');
    const github = fakeGitHub(201, { number: 8 });
    const res = await call('POST', `/feedback/${id}/issue`, { body: { ...draft, addition }, github: github.fetch });
    expect(res.status).toBe(201);
    const sent = JSON.parse(String(github.calls[0]!.init.body)).body as string;
    expect(sent).toBe(`${draft.body}\n\n---\n\n**Ergänzung des Entwicklers**\n\n${addition}`);
    const quoteEnd = sent.indexOf('\n\n', sent.lastIndexOf('> Der Skater hängt'));
    expect(sent.indexOf('**Ergänzung des Entwicklers**')).toBeGreaterThan(quoteEnd);
    expect(row(id)).toEqual({ status: 'todo', issue: 8, reply: null });
  });

  it('without an addition the body goes out as drafted', async () => {
    const id = seed();
    const github = fakeGitHub();
    await call('POST', `/feedback/${id}/issue`, { body: { ...draft, addition: '  ' }, github: github.fetch });
    expect(JSON.parse(String(github.calls[0]!.init.body)).body).toBe(draft.body);
  });

  it('sets no status when GitHub refuses the issue', async () => {
    const id = seed();
    const res = await call('POST', `/feedback/${id}/issue`, { body: { ...draft, addition }, github: fakeGitHub(422, { message: 'Validation Failed' }).fetch });
    expect(res.status).toBe(502);
    expect(row(id)).toEqual({ status: 'open', issue: null, reply: null });
  });
});

describe('PATCH /feedback/:id', () => {
  it('sets the status and a trimmed reply and answers with the triage fields', async () => {
    const id = seed();
    const res = await call('PATCH', `/feedback/${id}`, { body: { status: 'rejected', reply: '  Passt nicht ins Spiel.  ' } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true, status: 'rejected', issue: null, reply: 'Passt nicht ins Spiel.', doneVersion: null, issueState: null, issueClosedDay: null,
    });
    expect(row(id)).toEqual({ status: 'rejected', issue: null, reply: 'Passt nicht ins Spiel.' });
  });

  it('changes only the given field; an empty or null reply clears it; the issue stays', async () => {
    const id = seed();
    db.sqlite.prepare("UPDATE feedback SET status = 'todo', issue = 4, reply = 'Kommt bald' WHERE id = ?").run(id);
    expect((await call('PATCH', `/feedback/${id}`, { body: { status: 'done' } })).status).toBe(200);
    expect(row(id)).toEqual({ status: 'done', issue: 4, reply: 'Kommt bald' });
    await call('PATCH', `/feedback/${id}`, { body: { reply: ' ' } });
    expect(row(id)).toEqual({ status: 'done', issue: 4, reply: null });
    await call('PATCH', `/feedback/${id}`, { body: { reply: 'Umgesetzt' } });
    await call('PATCH', `/feedback/${id}`, { body: { reply: null } });
    expect(row(id)).toEqual({ status: 'done', issue: 4, reply: null });
  });

  it('rejects an unknown status, a long or multi-line reply, unknown or no fields with 400 and changes nothing', async () => {
    const id = seed();
    const bodies = [
      { status: 'later' }, { status: null }, { reply: 'x'.repeat(MAX_REPLY_CHARS + 1) }, { reply: 'zwei\nZeilen' }, { reply: 5 },
      { issue: 3 }, { status: 'done', issue: 3 }, {}, [], 'not json',
    ];
    for (const body of bodies) expect((await call('PATCH', `/feedback/${id}`, { body })).status, JSON.stringify(body)).toBe(400);
    expect((await call('PATCH', `/feedback/${id}`, { body: { reply: 'x'.repeat(MAX_REPLY_CHARS) } })).status).toBe(200);
    expect(row(id)?.status).toBe('open');
  });

  it('answers 404 for an unknown id', async () => {
    expect((await call('PATCH', '/feedback/42', { body: { status: 'done' } })).status).toBe(404);
  });
});

describe('PATCH /feedback/:id with doneVersion (ROADMAP 70)', () => {
  const doneVersion = (id: number) => (db.sqlite.prepare('SELECT done_version FROM feedback WHERE id = ?').get(id) as { done_version: string | null }).done_version;

  it('stores the version together with status done and answers it', async () => {
    const id = seed();
    const res = await call('PATCH', `/feedback/${id}`, { body: { status: 'done', doneVersion: '2026-10-12.1', reply: 'Ist drin!' } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true, status: 'done', issue: null, reply: 'Ist drin!', doneVersion: '2026-10-12.1', issueState: null, issueClosedDay: null,
    });
    expect(doneVersion(id)).toBe('2026-10-12.1');
  });

  it('keeps the version on a reply-only patch, clears it with status done without a version or null', async () => {
    const id = seed();
    await call('PATCH', `/feedback/${id}`, { body: { status: 'done', doneVersion: '2026-10-12.1' } });
    await call('PATCH', `/feedback/${id}`, { body: { reply: 'Danke' } });
    expect(doneVersion(id)).toBe('2026-10-12.1');
    await call('PATCH', `/feedback/${id}`, { body: { status: 'done' } });
    expect(doneVersion(id)).toBeNull();
    await call('PATCH', `/feedback/${id}`, { body: { status: 'done', doneVersion: '2026-10-12.2' } });
    await call('PATCH', `/feedback/${id}`, { body: { status: 'done', doneVersion: null } });
    expect(doneVersion(id)).toBeNull();
  });

  it('clears the version when the status leaves done, also by creating an issue', async () => {
    const id = seed();
    db.sqlite.prepare('UPDATE feedback SET issue = 4 WHERE id = ?').run(id);
    for (const status of ['open', 'todo', 'rejected']) {
      await call('PATCH', `/feedback/${id}`, { body: { status: 'done', doneVersion: '2026-10-12.1' } });
      const res = await call('PATCH', `/feedback/${id}`, { body: { status } });
      expect(((await res.json()) as { doneVersion: unknown }).doneVersion, status).toBeNull();
      expect(doneVersion(id), status).toBeNull();
    }
    const fresh = seed();
    await call('PATCH', `/feedback/${fresh}`, { body: { status: 'done', doneVersion: '2026-10-12.1' } });
    expect((await call('POST', `/feedback/${fresh}/issue`, { body: draft, github: fakeGitHub().fetch })).status).toBe(201);
    expect(doneVersion(fresh)).toBeNull();
  });

  it('rejects a malformed version, a version without status done, and changes nothing', async () => {
    const id = seed();
    const bodies = [
      { status: 'done', doneVersion: '2026-10-12' }, { status: 'done', doneVersion: 'v2026-10-12.1' }, { status: 'done', doneVersion: '2026-10-12.123' },
      { status: 'done', doneVersion: ' 2026-10-12.1' }, { status: 'done', doneVersion: 20261012 }, { status: 'todo', doneVersion: '2026-10-12.1' },
      { doneVersion: '2026-10-12.1' }, { reply: 'x', doneVersion: null },
    ];
    for (const body of bodies) expect((await call('PATCH', `/feedback/${id}`, { body })).status, JSON.stringify(body)).toBe(400);
    expect(row(id)?.status).toBe('open');
    expect(doneVersion(id)).toBeNull();
  });
});

describe('DELETE /feedback/:id', () => {
  it('deletes the row with 204, then answers 404', async () => {
    const keep = seed();
    const id = seed();
    const res = await call('DELETE', `/feedback/${id}`);
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
    expect(row(id)).toBeUndefined();
    expect(row(keep)).toBeDefined();
    expect((await call('DELETE', `/feedback/${id}`)).status).toBe(404);
  });

  it('answers 404 for other methods and paths under /feedback/:id', async () => {
    const id = seed();
    expect((await call('GET', `/feedback/${id}`)).status).toBe(404);
    expect((await call('POST', `/feedback/${id}`, { body: draft })).status).toBe(404);
    expect((await call('DELETE', `/feedback/${id}/issue`)).status).toBe(404);
    expect(row(id)).toBeDefined();
  });
});

describe('CORS for the board', () => {
  it('allows PATCH and DELETE with the Authorization header in the preflight', async () => {
    const request = new Request(`${BASE}/feedback/1`, {
      method: 'OPTIONS',
      headers: { Origin: ORIGIN, 'Access-Control-Request-Method': 'DELETE', 'Access-Control-Request-Headers': 'authorization' },
    });
    const res = await handleRequest(request, { DB: untouchable }, NOW);
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
    const methods = res.headers.get('Access-Control-Allow-Methods')!.split(/,\s*/);
    expect(methods).toEqual(expect.arrayContaining(['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS']));
    expect(res.headers.get('Access-Control-Allow-Headers')).toContain('Authorization');
  });
});

describe('GET /feedback with triage', () => {
  it('returns status, issue, reply and doneVersion, never the key hash', async () => {
    const id = seed();
    seed('idea');
    db.sqlite.prepare("UPDATE feedback SET status = 'done', issue = 12, reply = 'Danke!', done_version = '2026-10-12.1', key_hash = 'abc123' WHERE id = ?").run(id);
    const res = await call('GET', '/feedback');
    const { entries } = (await res.json()) as TriagedFeedbackList;
    expect(entries.map(({ id: entryId, status, issue, reply, doneVersion }) => ({ id: entryId, status, issue, reply, doneVersion }))).toEqual([
      { id: 2, status: 'open', issue: null, reply: null, doneVersion: null },
      { id: 1, status: 'done', issue: 12, reply: 'Danke!', doneVersion: '2026-10-12.1' },
    ]);
    expect(JSON.stringify(entries)).not.toMatch(/abc123|key/i);
  });
});

describe('the daily feedback prune', () => {
  it('keeps old rows with status todo and deletes the other old ones', async () => {
    const oldDay = new Date(NOW - (FEEDBACK_RETENTION_DAYS + 5) * DAY_MS).toISOString().slice(0, 10);
    const todo = seed('bug', oldDay);
    const done = seed('bug', oldDay);
    const open = seed('idea', oldDay);
    db.sqlite.prepare("UPDATE feedback SET status = 'todo', issue = 9 WHERE id = ?").run(todo);
    db.sqlite.prepare("UPDATE feedback SET status = 'done' WHERE id = ?").run(done);
    const headers = { Origin: ORIGIN, 'Content-Type': 'text/plain' };
    const body = JSON.stringify({
      session: SESSION, kind: 'idea', text: 'Mehr Brezeln', version: '2026-10-11.4', platform: 'other', input: 'keys',
      orientation: 'landscape', viewWidth: 427, log: [],
    });
    const res = await handleRequest(new Request(`${BASE}/feedback`, { method: 'POST', headers, body }), { DB: db.asD1() }, NOW);
    expect(res.status).toBe(201);
    expect(row(todo)).toEqual({ status: 'todo', issue: 9, reply: null });
    expect(row(done)).toBeUndefined();
    expect(row(open)).toBeUndefined();
  });
});
