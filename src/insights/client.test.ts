import { describe, expect, it } from 'vitest';
import type { FetchLike } from '../net/api';
import { SCORES_URL } from '../net/api';
import { ALL_RANGE } from '../net/telemetry-types';
import { apiBase, createIssue, createSession, createTesterPass, deleteFeedback, fetchFeedback, fetchStats, isFeedbackList, isInsightsStats, patchFeedback } from './client';
import { sampleFeedback } from './sample-feedback';
import { sampleStats } from './sample-stats';

interface Call {
  url: string;
  headers?: Record<string, string>;
  method?: string;
  body?: string;
}

function fakeFetch(status: number, body: unknown, calls: Call[] = []): FetchLike {
  return async (url, init) => {
    calls.push(init?.method ? { url, headers: init.headers, method: init.method, ...(init.body ? { body: init.body } : {}) } : { url, headers: init?.headers });
    return { ok: status === 200, status, json: async () => body };
  };
}

describe('apiBase', () => {
  it('uses the live worker in production, even with ?api=', () => {
    expect(apiBase({ hostname: 'marvinmai.github.io', search: '?api=https://evil.example' })).toBe(SCORES_URL);
  });
  it('honours ?api= on localhost and 127.0.0.1', () => {
    expect(apiBase({ hostname: 'localhost', search: '?api=http://localhost:8787' })).toBe('http://localhost:8787');
    expect(apiBase({ hostname: '127.0.0.1', search: '?api=http://127.0.0.1:8787/' })).toBe('http://127.0.0.1:8787');
  });
  it('ignores a non-http override', () => {
    expect(apiBase({ hostname: 'localhost', search: '?api=javascript:alert(1)' })).toBe(SCORES_URL);
  });
  it('defaults to the live worker on localhost without override', () => {
    expect(apiBase({ hostname: 'localhost', search: '' })).toBe(SCORES_URL);
  });
});

describe('fetchStats', () => {
  it('sends the bearer token to /stats?days=N', async () => {
    const calls: { url: string; headers?: Record<string, string> }[] = [];
    const result = await fetchStats(fakeFetch(200, sampleStats(30), calls), { base: 'http://x', token: 'abc', days: 30 });
    expect(calls).toEqual([{ url: 'http://x/stats?days=30', headers: { Authorization: 'Bearer abc' } }]);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.stats.days).toBe(30);
  });
  it('asks for and accepts the long ranges 365 and Alles (days=0)', async () => {
    for (const days of [365, ALL_RANGE] as const) {
      const calls: { url: string; headers?: Record<string, string> }[] = [];
      const result = await fetchStats(fakeFetch(200, sampleStats(days), calls), { base: 'http://x', token: 'abc', days });
      expect(calls[0]!.url).toBe(`http://x/stats?days=${days}`);
      expect(result.ok && result.stats.days).toBe(days);
    }
  });
  it('asks for test devices only with testers set, token still only in the header', async () => {
    const calls: { url: string; headers?: Record<string, string> }[] = [];
    await fetchStats(fakeFetch(200, sampleStats(7), calls), { base: 'http://x', token: 'abc', days: 7, testers: true });
    await fetchStats(fakeFetch(200, sampleStats(7), calls), { base: 'http://x', token: 'abc', days: 7, testers: false });
    expect(calls.map((c) => c.url)).toEqual(['http://x/stats?days=7&testers=1', 'http://x/stats?days=7']);
    expect(calls[0]!.headers).toEqual({ Authorization: 'Bearer abc' });
  });
  it('requires the new vs. returning counts', () => {
    const stats = sampleStats(7);
    expect(isInsightsStats(stats)).toBe(true);
    expect(isInsightsStats({ ...stats, visits: undefined })).toBe(false);
    expect(isInsightsStats({ ...stats, visits: { new: 1, returning: -1, unknown: 0 } })).toBe(false);
    const { newPlayers: _, ...oldDay } = stats.perDay[0]!;
    expect(isInsightsStats({ ...stats, perDay: [oldDay] })).toBe(false);
  });
  it('rejects a range outside STATS_RANGES', () => {
    expect(isInsightsStats({ ...sampleStats(30), days: 60 })).toBe(false);
  });
  it('maps 401 to auth', async () => {
    expect(await fetchStats(fakeFetch(401, { error: 'unauthorized' }), { base: 'http://x', token: 'a', days: 7 })).toEqual({
      ok: false,
      error: 'auth',
    });
  });
  it('maps other statuses and malformed bodies to server', async () => {
    expect(await fetchStats(fakeFetch(500, null), { base: 'http://x', token: 'a', days: 7 })).toEqual({ ok: false, error: 'server' });
    expect(await fetchStats(fakeFetch(200, { days: 7 }), { base: 'http://x', token: 'a', days: 7 })).toEqual({ ok: false, error: 'server' });
  });
  it('maps a thrown fetch and a timeout to offline', async () => {
    const throwing: FetchLike = async () => {
      throw new Error('down');
    };
    expect(await fetchStats(throwing, { base: 'http://x', token: 'a', days: 7 })).toEqual({ ok: false, error: 'offline' });
    const hanging: FetchLike = () => new Promise(() => {});
    expect(await fetchStats(hanging, { base: 'http://x', token: 'a', days: 7, timeoutMs: 5 })).toEqual({ ok: false, error: 'offline' });
  });
});

describe('fetchFeedback', () => {
  const list = { entries: sampleFeedback() };
  it('sends the bearer token to /feedback and returns the entries', async () => {
    const calls: { url: string; headers?: Record<string, string> }[] = [];
    const result = await fetchFeedback(fakeFetch(200, list, calls), { base: 'http://x', token: 'abc' });
    expect(calls).toEqual([{ url: 'http://x/feedback', headers: { Authorization: 'Bearer abc' } }]);
    expect(result).toEqual({ ok: true, entries: list.entries });
  });
  it('maps 401 to auth, 404 and 500 to server, a thrown fetch and a timeout to offline', async () => {
    expect(await fetchFeedback(fakeFetch(401, null), { base: 'http://x', token: 'a' })).toEqual({ ok: false, error: 'auth' });
    expect(await fetchFeedback(fakeFetch(404, null), { base: 'http://x', token: 'a' })).toEqual({ ok: false, error: 'server' });
    expect(await fetchFeedback(fakeFetch(500, null), { base: 'http://x', token: 'a' })).toEqual({ ok: false, error: 'server' });
    const throwing: FetchLike = async () => {
      throw new Error('down');
    };
    expect(await fetchFeedback(throwing, { base: 'http://x', token: 'a' })).toEqual({ ok: false, error: 'offline' });
    const hanging: FetchLike = () => new Promise(() => {});
    expect(await fetchFeedback(hanging, { base: 'http://x', token: 'a', timeoutMs: 5 })).toEqual({ ok: false, error: 'offline' });
  });
  it('maps a malformed body to server', async () => {
    expect(await fetchFeedback(fakeFetch(200, { entries: [{ id: 1 }] }), { base: 'http://x', token: 'a' })).toEqual({ ok: false, error: 'server' });
  });
});

describe('isFeedbackList', () => {
  const entry = sampleFeedback()[0]!;
  it('accepts the sample list and an empty list', () => {
    expect(isFeedbackList({ entries: sampleFeedback() })).toBe(true);
    expect(isFeedbackList({ entries: [] })).toBe(true);
  });
  it.each([
    ['no entries array', {}],
    ['a non-integer id', { entries: [{ ...entry, id: 1.5 }] }],
    ['a day with time', { entries: [{ ...entry, day: '2026-10-11T12:00' }] }],
    ['an unknown kind', { entries: [{ ...entry, kind: 'praise' }] }],
    ['a non-string text', { entries: [{ ...entry, text: 5 }] }],
    ['an unknown platform', { entries: [{ ...entry, platform: 'windows' }] }],
    ['an unknown input', { entries: [{ ...entry, input: 'mouse' }] }],
    ['an unknown orientation', { entries: [{ ...entry, orientation: 'flat' }] }],
    ['a non-numeric view width', { entries: [{ ...entry, viewWidth: '390' }] }],
    ['a non-string log line', { entries: [{ ...entry, log: [1] }] }],
    ['a missing log', { entries: [{ ...entry, log: undefined }] }],
  ])('rejects %s', (_, body) => {
    expect(isFeedbackList(body)).toBe(false);
  });
});

describe('feedback triage fields', () => {
  const entry = sampleFeedback()[0]!;
  it('accepts status, issue, reply and doneVersion', () => {
    expect(isFeedbackList({ entries: [{ ...entry, status: 'todo', issue: 12, reply: 'Kommt' }] })).toBe(true);
    expect(isFeedbackList({ entries: [{ ...entry, status: 'done', doneVersion: '2026-10-12.1' }] })).toBe(true);
  });
  it.each([
    ['an unknown status', { status: 'later' }],
    ['a non-integer issue', { issue: 1.5 }],
    ['a string issue', { issue: '12' }],
    ['a non-string reply', { reply: 3 }],
    ['a non-string doneVersion', { doneVersion: 20261012 }],
  ])('rejects %s', (_, triage) => {
    expect(isFeedbackList({ entries: [{ ...entry, ...triage }] })).toBe(false);
  });
  it('reads entries of a worker without triage as open, without issue, reply or version', async () => {
    const { status: _s, issue: _i, reply: _r, doneVersion: _v, ...old } = entry;
    const result = await fetchFeedback(fakeFetch(200, { entries: [old] }), { base: 'http://x', token: 'a' });
    expect(result).toEqual({ ok: true, entries: [{ ...old, status: 'open', issue: null, reply: null, doneVersion: null }] });
  });
});

describe('createIssue', () => {
  const draft = { title: 'Idee: Hunde', body: '> Hunde' };
  it('posts the draft as JSON with the bearer token and returns the issue number', async () => {
    const calls: Call[] = [];
    const result = await createIssue(fakeFetch(201, { ok: true, issue: 12 }, calls), { base: 'http://x', token: 'abc', id: 14, draft });
    expect(calls).toEqual([
      { url: 'http://x/feedback/14/issue', method: 'POST', headers: { Authorization: 'Bearer abc', 'Content-Type': 'application/json' }, body: JSON.stringify(draft) },
    ]);
    expect(result).toEqual({ ok: true, issue: 12 });
  });
  it('maps the worker errors', async () => {
    const request = { base: 'http://x', token: 'a', id: 1, draft };
    expect(await createIssue(fakeFetch(401, null), request)).toEqual({ ok: false, error: 'auth' });
    expect(await createIssue(fakeFetch(404, { ok: false, error: 'not-found' }), request)).toEqual({ ok: false, error: 'not-found' });
    expect(await createIssue(fakeFetch(409, { ok: false, error: 'exists', issue: 5 }), request)).toEqual({ ok: false, error: 'exists', issue: 5 });
    expect(await createIssue(fakeFetch(502, { ok: false, error: 'github', status: 403 }), request)).toEqual({ ok: false, error: 'github', status: 403 });
    expect(await createIssue(fakeFetch(503, { ok: false, error: 'github-token-missing' }), request)).toEqual({ ok: false, error: 'github-token-missing' });
    expect(await createIssue(fakeFetch(400, { ok: false, error: 'bad-request' }), request)).toEqual({ ok: false, error: 'bad-request' });
    expect(await createIssue(fakeFetch(500, { error: 'server' }), request)).toEqual({ ok: false, error: 'server' });
    expect(await createIssue(fakeFetch(201, { ok: true }), request)).toEqual({ ok: false, error: 'server' });
    const throwing: FetchLike = async () => {
      throw new Error('down');
    };
    expect(await createIssue(throwing, request)).toEqual({ ok: false, error: 'offline' });
  });
});

describe('patchFeedback', () => {
  it('sends only the given fields and returns the triage fields', async () => {
    const calls: Call[] = [];
    const answer = { ok: true, status: 'rejected', issue: null, reply: 'Zu schwer' };
    const result = await patchFeedback(fakeFetch(200, answer, calls), { base: 'http://x', token: 'abc', id: 3, patch: { status: 'rejected', reply: 'Zu schwer' } });
    expect(calls[0]).toEqual({
      url: 'http://x/feedback/3', method: 'PATCH', headers: { Authorization: 'Bearer abc', 'Content-Type': 'application/json' },
      body: '{"status":"rejected","reply":"Zu schwer"}',
    });
    expect(result).toEqual({ ok: true, triage: { status: 'rejected', issue: null, reply: 'Zu schwer', doneVersion: null } });
  });
  it('sends and returns the done version', async () => {
    const calls: Call[] = [];
    const answer = { ok: true, status: 'done', issue: 4, reply: null, doneVersion: '2026-10-12.1' };
    const patch = { status: 'done' as const, reply: null, doneVersion: '2026-10-12.1' };
    const result = await patchFeedback(fakeFetch(200, answer, calls), { base: 'http://x', token: 'abc', id: 3, patch });
    expect(calls[0]!.body).toBe('{"status":"done","reply":null,"doneVersion":"2026-10-12.1"}');
    expect(result).toEqual({ ok: true, triage: { status: 'done', issue: 4, reply: null, doneVersion: '2026-10-12.1' } });
    expect(await patchFeedback(fakeFetch(200, { ...answer, doneVersion: 7 }), { base: 'http://x', token: 'a', id: 3, patch })).toEqual({ ok: false, error: 'server' });
  });
  it('maps 404 and a malformed answer', async () => {
    const request = { base: 'http://x', token: 'a', id: 3, patch: { status: 'done' as const } };
    expect(await patchFeedback(fakeFetch(404, { ok: false, error: 'not-found' }), request)).toEqual({ ok: false, error: 'not-found' });
    expect(await patchFeedback(fakeFetch(200, { ok: true, status: 'x' }), request)).toEqual({ ok: false, error: 'server' });
  });
});

describe('deleteFeedback', () => {
  it('sends DELETE with the bearer token; 204 is success', async () => {
    const calls: Call[] = [];
    expect(await deleteFeedback(fakeFetch(204, null, calls), { base: 'http://x', token: 'abc', id: 7 })).toEqual({ ok: true });
    expect(calls).toEqual([{ url: 'http://x/feedback/7', method: 'DELETE', headers: { Authorization: 'Bearer abc' } }]);
  });
  it('maps 401 and 404', async () => {
    expect(await deleteFeedback(fakeFetch(401, null), { base: 'http://x', token: 'a', id: 7 })).toEqual({ ok: false, error: 'auth' });
    expect(await deleteFeedback(fakeFetch(404, { ok: false, error: 'not-found' }), { base: 'http://x', token: 'a', id: 7 })).toEqual({ ok: false, error: 'not-found' });
  });
});

describe('createSession', () => {
  it('posts the real token as bearer to /board/session and returns the session', async () => {
    const calls: Call[] = [];
    const answer = { token: 'v1.1760799441000.abc', expiresAt: 1_760_799_441_000 };
    const result = await createSession(fakeFetch(200, answer, calls), { base: 'http://x', token: 'abc' });
    expect(calls).toEqual([{ url: 'http://x/board/session', method: 'POST', headers: { Authorization: 'Bearer abc' } }]);
    expect(result).toEqual({ ok: true, session: answer });
  });
  it('maps 401 to auth and a missing key (503), an older worker (404) or a broken answer to server', async () => {
    expect(await createSession(fakeFetch(401, { error: 'unauthorized' }), { base: 'http://x', token: 'abc' })).toEqual({ ok: false, error: 'auth' });
    for (const [status, body] of [[503, { error: 'session-key-missing' }], [404, null], [200, { token: 5, expiresAt: 1 }], [200, { token: 'v1.1.a' }]] as const) {
      expect(await createSession(fakeFetch(status, body), { base: 'http://x', token: 'abc' }), String(status)).toEqual({ ok: false, error: 'server' });
    }
  });
  it('maps a network error to offline', async () => {
    const failing: FetchLike = async () => {
      throw new Error('offline');
    };
    expect(await createSession(failing, { base: 'http://x', token: 'abc' })).toEqual({ ok: false, error: 'offline' });
  });
});

describe('createTesterPass', () => {
  const answer = { pass: 'tester.v1.1776000000000.abc', scope: 'tester', expiresAt: 1_776_000_000_000 };
  it('posts the bearer to /board/tester-pass and returns the pass with its expiry', async () => {
    const calls: Call[] = [];
    const result = await createTesterPass(fakeFetch(200, answer, calls), { base: 'http://x', token: 'abc' });
    expect(calls).toEqual([{ url: 'http://x/board/tester-pass', method: 'POST', headers: { Authorization: 'Bearer abc' } }]);
    expect(result).toEqual({ ok: true, pass: { pass: answer.pass, expiresAt: answer.expiresAt } });
  });
  it('maps 401 to auth and a missing key (503), an older worker (404) or a broken answer to server', async () => {
    expect(await createTesterPass(fakeFetch(401, null), { base: 'http://x', token: 'abc' })).toEqual({ ok: false, error: 'auth' });
    const broken = [
      [503, { error: 'session-key-missing' }], [404, null], [200, { ...answer, scope: 'board' }], [200, { ...answer, pass: '' }],
      [200, { ...answer, pass: 'x'.repeat(513) }], [200, { ...answer, expiresAt: 'bald' }],
    ] as const;
    for (const [status, body] of broken) {
      expect(await createTesterPass(fakeFetch(status, body), { base: 'http://x', token: 'abc' }), JSON.stringify(body)).toEqual({ ok: false, error: 'server' });
    }
  });
});
