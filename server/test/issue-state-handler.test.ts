import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ISSUE_REPO, MAX_REPLY_CHARS } from '../src/feedback-triage-rules';
import type { TriagedFeedbackList } from '../src/feedback-triage-types';
import { GITHUB_READ_TIMEOUT_MS, type GitHubFetch } from '../src/github';
import { handleRequest, type Env } from '../src/handler';
import { ISSUE_SYNC_INTERVAL_MS, MAX_SINGLE_ISSUE_READS } from '../src/issue-sync';
import { FakeD1 } from './d1-fake';

const BASE = 'https://cannstatt-cruiser-scores.marvin-builds.workers.dev';
const ORIGIN = 'https://marvin-builds.github.io';
const NOW = Date.parse('2026-10-12T14:37:21Z');
const TOKEN = 'dGVzdC10b2tlbi1mb3ItdGhlLWluc2lnaHRzLWJvYXJkLTAx';
const GITHUB_TOKEN = 'github_pat_11SECRETSECRETSECRET_abcdefghijklmnopqrstuvwxyz';
const LIST_URL = `https://api.github.com/repos/${ISSUE_REPO}/issues?state=all&per_page=100&sort=updated`;
const issueUrl = (n: number) => `https://api.github.com/repos/${ISSUE_REPO}/issues/${n}`;

interface Answer {
  status: number;
  body: unknown;
}

/** A fake GitHub API answering by URL (unknown URLs: 404); records every URL it was asked for. */
function fakeGitHub(answers: Record<string, Answer | 'hang' | 'throw'>) {
  const urls: string[] = [];
  const fetch: GitHubFetch = (url, init) => {
    urls.push(url);
    expect(new Headers(init.headers).get('Authorization')).toBe(`Bearer ${GITHUB_TOKEN}`);
    const answer = answers[url] ?? { status: 404, body: { message: 'Not Found' } };
    if (answer === 'hang') return new Promise(() => {});
    if (answer === 'throw') return Promise.reject(new Error(`down ${GITHUB_TOKEN}`));
    return Promise.resolve(new Response(JSON.stringify(answer.body), { status: answer.status }));
  };
  return { urls, fetch };
}

const unreachableGitHub: GitHubFetch = async () => {
  throw new Error('GitHub must not be called');
};

const open = (number: number) => ({ number, state: 'open', state_reason: null, closed_at: null });
const closed = (number: number, reason: string | null, at = '2026-10-12T09:00:00Z') => ({ number, state: 'closed', state_reason: reason, closed_at: at });

/** Advances the fake timers by read timeouts, yielding to real I/O in between, until `pending` settles. */
async function afterTimeouts<T>(pending: Promise<T>): Promise<T> {
  let settled = false;
  void pending.finally(() => { settled = true; });
  for (let round = 0; round < 20 && !settled; round++) {
    await new Promise((resolve) => setImmediate(resolve));
    await vi.advanceTimersByTimeAsync(GITHUB_READ_TIMEOUT_MS);
  }
  return pending;
}

let db: FakeD1;

beforeEach(() => {
  db = new FakeD1();
});

afterEach(() => {
  vi.useRealTimers();
});

function seed({ status = 'open', issue = null as number | null, state = null as string | null, closedDay = null as string | null, reply = null as string | null } = {}): number {
  const { lastInsertRowid } = db.sqlite
    .prepare(`INSERT INTO feedback (day, kind, text, version, platform, input, orientation, view_width, log, status, issue, reply, issue_state, issue_closed_day)
      VALUES ('2026-10-11', 'bug', 'Der Skater hängt', '2026-10-11.4', 'android', 'touch', 'portrait', 390, '[]', ?, ?, ?, ?, ?)`)
    .run(status, issue, reply, state, closedDay);
  return Number(lastInsertRowid);
}

const row = (id: number) => db.sqlite.prepare('SELECT status, issue, reply, done_version, issue_state, issue_closed_day FROM feedback WHERE id = ?').get(id) as
  { status: string; issue: number | null; reply: string | null; done_version: string | null; issue_state: string | null; issue_closed_day: string | null } | undefined;

interface CallOptions {
  body?: unknown;
  env?: Partial<Env>;
  github?: GitHubFetch;
  now?: number;
  auth?: string | null;
}

function call(method: string, path: string, { body, env = {}, github = unreachableGitHub, now = NOW, auth = `Bearer ${TOKEN}` }: CallOptions = {}): Promise<Response> {
  const headers: Record<string, string> = { Origin: ORIGIN };
  if (auth !== null) headers.Authorization = auth;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const init: RequestInit = { method, headers };
  if (body !== undefined) init.body = typeof body === 'string' ? body : JSON.stringify(body);
  return handleRequest(new Request(`${BASE}${path}`, init), { DB: db.asD1(), STATS_TOKEN: TOKEN, GITHUB_TOKEN, ...env }, now, github);
}

async function states(res: Response) {
  expect(res.status).toBe(200);
  const { entries } = (await res.json()) as TriagedFeedbackList;
  return Object.fromEntries(entries.map(({ id, issue, issueState, issueClosedDay }) => [id, { issue, issueState, issueClosedDay }]));
}

describe('GET /feedback with issue states (ROADMAP 82)', () => {
  it('refreshes linked issues from one list read, skipping pull requests, and returns the states', async () => {
    const a = seed({ status: 'todo', issue: 3, state: 'open' });
    const b = seed({ status: 'todo', issue: 5 });
    const c = seed({ status: 'todo', issue: 6 });
    const d = seed();
    const github = fakeGitHub({
      [LIST_URL]: { status: 200, body: [closed(3, 'completed', '2026-10-12T23:10:00Z'), { ...closed(5, 'completed'), pull_request: { url: 'x' } }, closed(6, 'duplicate'), open(99)] },
      [issueUrl(5)]: { status: 200, body: closed(5, 'not_planned', '2026-10-10T08:00:00Z') },
    });
    expect(await states(await call('GET', '/feedback', { github: github.fetch }))).toEqual({
      [a]: { issue: 3, issueState: 'completed', issueClosedDay: '2026-10-12' },
      [b]: { issue: 5, issueState: 'notPlanned', issueClosedDay: '2026-10-10' },
      [c]: { issue: 6, issueState: 'notPlanned', issueClosedDay: '2026-10-12' },
      [d]: { issue: null, issueState: null, issueClosedDay: null },
    });
    expect(github.urls).toEqual([LIST_URL, issueUrl(5)]);
    expect(row(a)).toMatchObject({ issue_state: 'completed', issue_closed_day: '2026-10-12' });
  });

  it('marks an issue missing when GitHub answers 404 or 410, and back to open when it is reopened', async () => {
    const a = seed({ status: 'todo', issue: 7, state: 'completed', closedDay: '2026-10-01' });
    const b = seed({ status: 'todo', issue: 8, state: 'open' });
    const c = seed({ status: 'done', issue: 9, state: 'completed', closedDay: '2026-10-01' });
    const github = fakeGitHub({ [LIST_URL]: { status: 200, body: [open(9)] }, [issueUrl(8)]: { status: 410, body: {} } });
    expect(await states(await call('GET', '/feedback', { github: github.fetch }))).toEqual({
      [a]: { issue: 7, issueState: 'missing', issueClosedDay: null },
      [b]: { issue: 8, issueState: 'missing', issueClosedDay: null },
      [c]: { issue: 9, issueState: 'open', issueClosedDay: null },
    });
  });

  it('reads GitHub at most once per ISSUE_SYNC_INTERVAL_MS', async () => {
    seed({ status: 'todo', issue: 3 });
    const github = fakeGitHub({ [LIST_URL]: { status: 200, body: [open(3)] } });
    await call('GET', '/feedback', { github: github.fetch });
    await call('GET', '/feedback', { github: github.fetch, now: NOW + ISSUE_SYNC_INTERVAL_MS - 1 });
    expect(github.urls).toEqual([LIST_URL]);
    await call('GET', '/feedback', { github: github.fetch, now: NOW + ISSUE_SYNC_INTERVAL_MS });
    expect(github.urls).toEqual([LIST_URL, LIST_URL]);
    expect(ISSUE_SYNC_INTERVAL_MS).toBeGreaterThanOrEqual(30_000);
    expect(ISSUE_SYNC_INTERVAL_MS).toBeLessThanOrEqual(120_000);
  });

  it('serves the cached states when GitHub fails, and does not ask again within the interval', async () => {
    const a = seed({ status: 'todo', issue: 3, state: 'completed', closedDay: '2026-10-02' });
    for (const answer of [{ status: 500, body: { message: GITHUB_TOKEN } }, 'throw', { status: 200, body: 'kaputt' }] as const) {
      db.sqlite.exec('DELETE FROM event_meta');
      const github = fakeGitHub({ [LIST_URL]: answer });
      const res = await call('GET', '/feedback', { github: github.fetch });
      const text = await res.clone().text();
      expect(text).not.toContain(GITHUB_TOKEN);
      expect(await states(res)).toEqual({ [a]: { issue: 3, issueState: 'completed', issueClosedDay: '2026-10-02' } });
      await call('GET', '/feedback', { github: github.fetch, now: NOW + 1000 });
      expect(github.urls).toEqual([LIST_URL]);
    }
  });

  it('answers 200 with the cached states when GitHub hangs (after the read timeout)', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const a = seed({ status: 'todo', issue: 3, state: 'open' });
    const github = fakeGitHub({ [LIST_URL]: 'hang' });
    const pending = call('GET', '/feedback', { github: github.fetch });
    expect(await states(await afterTimeouts(pending))).toEqual({ [a]: { issue: 3, issueState: 'open', issueClosedDay: null } });
    expect(github.urls).toEqual([LIST_URL]);
  });

  it('keeps a state when its single read hangs or fails', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const a = seed({ status: 'todo', issue: 3, state: 'open' });
    const b = seed({ status: 'todo', issue: 4, state: 'completed', closedDay: '2026-10-03' });
    const github = fakeGitHub({ [LIST_URL]: { status: 200, body: [] }, [issueUrl(3)]: 'hang', [issueUrl(4)]: { status: 502, body: {} } });
    const pending = call('GET', '/feedback', { github: github.fetch });
    expect(await states(await afterTimeouts(pending))).toEqual({
      [a]: { issue: 3, issueState: 'open', issueClosedDay: null },
      [b]: { issue: 4, issueState: 'completed', issueClosedDay: '2026-10-03' },
    });
    expect(github.urls).toEqual([LIST_URL, issueUrl(3), issueUrl(4)]);
  });

  it(`reads at most ${MAX_SINGLE_ISSUE_READS} issues one by one per load, the never-read ones first`, async () => {
    for (let n = 1; n <= MAX_SINGLE_ISSUE_READS + 5; n++) seed({ status: 'todo', issue: n, state: 'open' });
    const unread = seed({ status: 'todo', issue: 500 });
    const github = fakeGitHub({ [LIST_URL]: { status: 200, body: [] } });
    await call('GET', '/feedback', { github: github.fetch });
    expect(github.urls).toHaveLength(1 + MAX_SINGLE_ISSUE_READS);
    expect(github.urls[1]).toBe(issueUrl(500));
    expect(row(unread)?.issue_state).toBe('missing');
  });

  it('asks GitHub nothing without linked issues or without the GitHub token', async () => {
    const github = fakeGitHub({});
    const plain = seed();
    expect(await states(await call('GET', '/feedback', { github: github.fetch }))).toEqual({ [plain]: { issue: null, issueState: null, issueClosedDay: null } });
    const linked = seed({ status: 'todo', issue: 3, state: 'open' });
    const later = { github: github.fetch, env: { GITHUB_TOKEN: undefined }, now: NOW + 10 * ISSUE_SYNC_INTERVAL_MS };
    expect(await states(await call('GET', '/feedback', later))).toEqual({
      [plain]: { issue: null, issueState: null, issueClosedDay: null },
      [linked]: { issue: 3, issueState: 'open', issueClosedDay: null },
    });
    expect(github.urls).toEqual([]);
  });

  it('answers 401 before GitHub', async () => {
    seed({ status: 'todo', issue: 3 });
    expect((await call('GET', '/feedback', { auth: null })).status).toBe(401);
  });
});

describe('POST /feedback/:id/issue with the player message (ROADMAP 83)', () => {
  const draft = { title: 'Fehler: Der Skater hängt', body: '> Der Skater hängt' };
  const created = (number: number) => fakeGitHub({ [`https://api.github.com/repos/${ISSUE_REPO}/issues`]: { status: 201, body: { number } } });

  it('stores the trimmed reply with status todo and the issue state open in the same request', async () => {
    const id = seed();
    const res = await call('POST', `/feedback/${id}/issue`, { body: { ...draft, reply: '  Ist geplant, danke!  ' }, github: created(12).fetch });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ ok: true, issue: 12 });
    expect(row(id)).toEqual({ status: 'todo', issue: 12, reply: 'Ist geplant, danke!', done_version: null, issue_state: 'open', issue_closed_day: null });
  });

  it('clears the reply with an empty or null one and keeps it without the field', async () => {
    for (const [reply, stored] of [['', null], [null, null], [undefined, 'Alt']] as const) {
      const id = seed({ reply: 'Alt' });
      const body = reply === undefined ? draft : { ...draft, reply };
      expect((await call('POST', `/feedback/${id}/issue`, { body, github: created(4).fetch })).status).toBe(201);
      expect(row(id)?.reply, String(reply)).toBe(stored);
    }
  });

  it('rejects a too long reply with 400 before GitHub and stores nothing', async () => {
    const id = seed();
    expect((await call('POST', `/feedback/${id}/issue`, { body: { ...draft, reply: 'x'.repeat(MAX_REPLY_CHARS + 1) } })).status).toBe(400);
    expect(row(id)?.status).toBe('open');
  });

  it('keeps the reply untouched when GitHub refuses the issue', async () => {
    const id = seed({ reply: 'Alt' });
    const github = fakeGitHub({ [`https://api.github.com/repos/${ISSUE_REPO}/issues`]: { status: 422, body: {} } });
    expect((await call('POST', `/feedback/${id}/issue`, { body: { ...draft, reply: 'Neu' }, github: github.fetch })).status).toBe(502);
    expect(row(id)).toMatchObject({ status: 'open', issue: null, reply: 'Alt', issue_state: null });
  });
});

describe('POST /feedback/:id/link (ROADMAP 83)', () => {
  it('links an existing open issue, sets todo, the reply and the read state', async () => {
    const id = seed();
    db.sqlite.prepare("UPDATE feedback SET done_version = '2026-10-01.1' WHERE id = ?").run(id);
    const github = fakeGitHub({ [issueUrl(7)]: { status: 200, body: open(7) } });
    const res = await call('POST', `/feedback/${id}/link`, { body: { issue: 7, reply: ' Ist schon geplant! ' }, github: github.fetch });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, issue: 7, issueState: 'open', issueClosedDay: null });
    expect(row(id)).toEqual({ status: 'todo', issue: 7, reply: 'Ist schon geplant!', done_version: null, issue_state: 'open', issue_closed_day: null });
    expect(github.urls).toEqual([issueUrl(7)]);
  });

  it('stores the state of a closed issue, and keeps the reply without the field', async () => {
    const id = seed({ reply: 'Alt' });
    const github = fakeGitHub({ [issueUrl(7)]: { status: 200, body: closed(7, 'not_planned', '2026-10-09T10:00:00Z') } });
    expect((await call('POST', `/feedback/${id}/link`, { body: { issue: 7 }, github: github.fetch })).status).toBe(200);
    expect(row(id)).toMatchObject({ status: 'todo', issue: 7, reply: 'Alt', issue_state: 'notPlanned', issue_closed_day: '2026-10-09' });
  });

  it('answers 422 issue-not-found for an unknown issue or a pull request and stores nothing', async () => {
    for (const answer of [{ status: 404, body: {} }, { status: 410, body: {} }, { status: 200, body: { ...open(7), pull_request: {} } }]) {
      const id = seed();
      const res = await call('POST', `/feedback/${id}/link`, { body: { issue: 7 }, github: fakeGitHub({ [issueUrl(7)]: answer }).fetch });
      expect(res.status).toBe(422);
      expect(await res.json()).toEqual({ ok: false, error: 'issue-not-found' });
      expect(row(id)).toMatchObject({ status: 'open', issue: null, issue_state: null });
    }
  });

  it('answers 502 github with the status when GitHub fails, without leaking the token', async () => {
    const id = seed();
    for (const [answer, status] of [[{ status: 403, body: { message: GITHUB_TOKEN } }, 403], ['throw', 0]] as const) {
      const res = await call('POST', `/feedback/${id}/link`, { body: { issue: 7 }, github: fakeGitHub({ [issueUrl(7)]: answer }).fetch });
      expect(res.status).toBe(502);
      const text = await res.text();
      expect(JSON.parse(text)).toEqual({ ok: false, error: 'github', status });
      expect(text).not.toContain('SECRET');
    }
    expect(row(id)?.issue).toBeNull();
  });

  it('answers 404 for an unknown row and 409 when the row has an issue, both before GitHub', async () => {
    expect((await call('POST', '/feedback/99/link', { body: { issue: 7 } })).status).toBe(404);
    const id = seed({ status: 'todo', issue: 5 });
    const res = await call('POST', `/feedback/${id}/link`, { body: { issue: 7 } });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ ok: false, error: 'exists', issue: 5 });
  });

  it('replaces an issue that GitHub no longer has (state missing), and only that one', async () => {
    const id = seed({ status: 'todo', issue: 5, state: 'missing', reply: 'Alt' });
    const github = fakeGitHub({ [issueUrl(31)]: { status: 200, body: open(31) } });
    expect((await call('POST', `/feedback/${id}/link`, { body: { issue: 31 }, github: github.fetch })).status).toBe(200);
    expect(row(id)).toMatchObject({ status: 'todo', issue: 31, reply: 'Alt', issue_state: 'open', issue_closed_day: null });
    for (const state of ['open', 'completed', 'notPlanned', null]) {
      const other = seed({ status: 'todo', issue: 5, state });
      expect((await call('POST', `/feedback/${other}/link`, { body: { issue: 31 } })).status, String(state)).toBe(409);
    }
  });

  it('answers 400 for a bad body, 503 without the GitHub token, 401 without the board token, 404 for other methods', async () => {
    const id = seed();
    for (const body of [{ issue: 0 }, { issue: '7' }, { issue: 7, reply: 'x'.repeat(MAX_REPLY_CHARS + 1) }, 'x']) {
      expect((await call('POST', `/feedback/${id}/link`, { body })).status, JSON.stringify(body)).toBe(400);
    }
    expect((await call('POST', `/feedback/${id}/link`, { body: { issue: 7 }, env: { GITHUB_TOKEN: undefined } })).status).toBe(503);
    expect((await call('POST', `/feedback/${id}/link`, { body: { issue: 7 }, auth: null })).status).toBe(401);
    expect((await call('GET', `/feedback/${id}/link`)).status).toBe(404);
    expect(row(id)?.status).toBe('open');
  });
});

describe('PATCH /feedback/:id with status todo (ROADMAP 83)', () => {
  it('is refused with 409 no-issue while the row has no issue', async () => {
    const id = seed({ status: 'rejected' });
    const res = await call('PATCH', `/feedback/${id}`, { body: { status: 'todo', reply: 'x' } });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ ok: false, error: 'no-issue' });
    expect(row(id)).toMatchObject({ status: 'rejected', reply: null });
  });

  it('is allowed with an issue and answers the issue state too', async () => {
    const id = seed({ status: 'rejected', issue: 4, state: 'completed', closedDay: '2026-10-05' });
    const res = await call('PATCH', `/feedback/${id}`, { body: { status: 'todo' } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true, status: 'todo', issue: 4, reply: null, doneVersion: null, issueState: 'completed', issueClosedDay: '2026-10-05',
    });
  });

  it('answers 404 for an unknown row', async () => {
    expect((await call('PATCH', '/feedback/42', { body: { status: 'todo' } })).status).toBe(404);
  });
});
