import { afterEach, describe, expect, it, vi } from 'vitest';
import { type FetchLike, REQUEST_TIMEOUT_MS, SCORES_URL, ScoresApi, type ScoreSubmission } from './api';

const ENTRY = { rank: 1, name: 'Flinker Fuchs 42', score: 4200, distance: 800, date: '2026-10-09T10:00:00.000Z' };
const RUN: ScoreSubmission = { name: 'Max', score: 1200, distance: 300, duration: 45, version: '2026-10-09.3', device: 'abcdef12-3456' };

/** A fake fetch answering every request with `status` and `body`, recording the requests. */
function answer(status: number, body: unknown) {
  const calls: { url: string; init?: Parameters<FetchLike>[1] }[] = [];
  const fetch: FetchLike = async (url, init) => {
    calls.push({ url, init });
    return { status, ok: status >= 200 && status < 300, json: async () => body };
  };
  return { fetch, calls };
}

afterEach(() => vi.useRealTimers());

describe('ScoresApi.top', () => {
  it('fetches the top list from the worker', async () => {
    const { fetch, calls } = answer(200, { entries: [ENTRY] });
    const result = await new ScoresApi(fetch).top();
    expect(result).toEqual({ ok: true, entries: [ENTRY] });
    expect(calls[0]!.url).toBe(`${SCORES_URL}/top`);
  });

  it('drops malformed entries', async () => {
    const { fetch } = answer(200, { entries: [ENTRY, { rank: 'x' }, null, { ...ENTRY, score: 1.5 }] });
    expect(await new ScoresApi(fetch).top()).toEqual({ ok: true, entries: [ENTRY] });
  });

  it('maps a network failure to offline and a broken answer to server', async () => {
    const down: FetchLike = () => Promise.reject(new TypeError('Failed to fetch'));
    expect(await new ScoresApi(down).top()).toEqual({ ok: false, error: 'offline' });
    expect(await new ScoresApi(answer(500, {}).fetch).top()).toEqual({ ok: false, error: 'server' });
    expect(await new ScoresApi(answer(200, { nope: 1 }).fetch).top()).toEqual({ ok: false, error: 'server' });
    const notJson: FetchLike = async () => ({ ok: true, status: 200, json: () => Promise.reject(new SyntaxError('bad')) });
    expect(await new ScoresApi(notJson).top()).toEqual({ ok: false, error: 'server' });
  });

  it('gives up after the timeout as offline and aborts the request', async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    const hang: FetchLike = (_url, init) => {
      signal = init?.signal;
      return new Promise(() => {});
    };
    const pending = new ScoresApi(hang).top();
    await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS - 1);
    let done = false;
    void pending.then(() => (done = true));
    await Promise.resolve();
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await pending).toEqual({ ok: false, error: 'offline' });
    expect(signal?.aborted).toBe(true);
  });
});

describe('ScoresApi.submit', () => {
  it('posts the run as JSON and returns rank and list', async () => {
    const { fetch, calls } = answer(200, { ok: true, rank: 3, entries: [ENTRY] });
    expect(await new ScoresApi(fetch).submit(RUN)).toEqual({ ok: true, rank: 3, entries: [ENTRY] });
    expect(calls[0]!.url).toBe(`${SCORES_URL}/score`);
    expect(calls[0]!.init?.method).toBe('POST');
    expect(calls[0]!.init?.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(JSON.parse(calls[0]!.init!.body!)).toEqual(RUN);
  });

  it('keeps a null rank (stored outside the top 20)', async () => {
    const { fetch } = answer(200, { ok: true, rank: null, entries: [] });
    expect(await new ScoresApi(fetch).submit(RUN)).toEqual({ ok: true, rank: null, entries: [] });
  });

  it.each([
    [422, { ok: false, error: 'name' }, 'name'],
    [422, { ok: false, error: 'implausible' }, 'implausible'],
    [429, { ok: false, error: 'rate' }, 'rate'],
    [400, { ok: false, error: 'bad-request' }, 'bad-request'],
    [404, { ok: false, error: 'not-found' }, 'server'],
    [500, null, 'server'],
    [502, { whatever: true }, 'server'],
    [422, { ok: false, error: 'something' }, 'server'],
    [200, { ok: true }, 'server'],
  ])('maps status %i %j to %s', async (status, body, error) => {
    expect(await new ScoresApi(answer(status, body).fetch).submit(RUN)).toEqual({ ok: false, error });
  });

  it('maps a network failure and a timeout to offline', async () => {
    const down: FetchLike = () => Promise.reject(new TypeError('Failed to fetch'));
    expect(await new ScoresApi(down).submit(RUN)).toEqual({ ok: false, error: 'offline' });
    vi.useFakeTimers();
    const pending = new ScoresApi(() => new Promise(() => {})).submit(RUN);
    await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS);
    expect(await pending).toEqual({ ok: false, error: 'offline' });
  });

  it('uses another base URL when given', async () => {
    const { fetch, calls } = answer(200, { entries: [] });
    await new ScoresApi(fetch, { baseUrl: 'http://localhost:8787' }).top();
    expect(calls[0]!.url).toBe('http://localhost:8787/top');
  });
});
