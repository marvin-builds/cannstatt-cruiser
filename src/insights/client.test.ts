import { describe, expect, it } from 'vitest';
import type { FetchLike } from '../net/api';
import { SCORES_URL } from '../net/api';
import { ALL_RANGE } from '../net/telemetry-types';
import { apiBase, fetchFeedback, fetchStats, isFeedbackList, isInsightsStats } from './client';
import { sampleFeedback } from './sample-feedback';
import { sampleStats } from './sample-stats';

function fakeFetch(status: number, body: unknown, calls: { url: string; headers?: Record<string, string> }[] = []): FetchLike {
  return async (url, init) => {
    calls.push({ url, headers: init?.headers });
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
