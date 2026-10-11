import { describe, expect, it } from 'vitest';
import type { FetchLike } from '../net/api';
import { SCORES_URL } from '../net/api';
import { ALL_RANGE } from '../net/telemetry-types';
import { apiBase, fetchStats, isInsightsStats } from './client';
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
