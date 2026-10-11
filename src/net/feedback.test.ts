import { describe, expect, it } from 'vitest';
import { type FetchLike, SCORES_URL } from './api';
import { feedbackBaseUrl, feedbackBody, type FeedbackInput, FeedbackSender, stateLine } from './feedback';
import { MAX_FEEDBACK_TEXT, MAX_LOG_LINES, MAX_VIEW_WIDTH, MIN_VIEW_WIDTH } from './feedback-types';
import { PRODUCTION_HOST } from './telemetry';

const SESSION = 'b'.repeat(32);

const INPUT: FeedbackInput = {
  session: SESSION,
  kind: 'bug',
  text: '  Der Skater bleibt hängen  ',
  version: '2026-10-11.4',
  platform: 'android',
  touch: true,
  portrait: false,
  viewWidth: 422,
  log: ['error: boom (index.js:1)'],
};

describe('feedback body', () => {
  it('builds the contract body: trimmed text, input and orientation from the display', () => {
    expect(feedbackBody(INPUT)).toEqual({
      session: SESSION,
      kind: 'bug',
      text: 'Der Skater bleibt hängen',
      version: '2026-10-11.4',
      platform: 'android',
      input: 'touch',
      orientation: 'landscape',
      viewWidth: 422,
      log: ['error: boom (index.js:1)'],
    });
    const keys = feedbackBody({ ...INPUT, touch: false, portrait: true });
    expect(keys.input).toBe('keys');
    expect(keys.orientation).toBe('portrait');
  });

  it('never sends a log with an idea', () => {
    expect(feedbackBody({ ...INPUT, kind: 'idea' }).log).toEqual([]);
  });

  it('keeps text, log and view width inside the contract limits', () => {
    const body = feedbackBody({
      ...INPUT,
      text: 'ä'.repeat(MAX_FEEDBACK_TEXT + 20),
      viewWidth: 900.7,
      log: Array.from({ length: MAX_LOG_LINES + 3 }, (_, i) => `l${i}`),
    });
    expect(body.text).toHaveLength(MAX_FEEDBACK_TEXT);
    expect(body.viewWidth).toBe(MAX_VIEW_WIDTH);
    expect(body.log).toHaveLength(MAX_LOG_LINES);
    expect(body.log[0]).toBe('l3');
    expect(feedbackBody({ ...INPUT, viewWidth: 100 }).viewWidth).toBe(MIN_VIEW_WIDTH);
    expect(feedbackBody({ ...INPUT, viewWidth: 333.6 }).viewWidth).toBe(333);
  });

  it('has no name, device id or time in it', () => {
    expect(Object.keys(feedbackBody(INPUT)).sort()).toEqual(
      ['kind', 'input', 'log', 'orientation', 'platform', 'session', 'text', 'version', 'viewWidth'].sort(),
    );
  });

  it('describes the game state in one log line', () => {
    expect(stateLine({ mode: 'paused', version: '2026-10-11.4', viewWidth: 320, viewHeight: 180 })).toBe(
      'state: mode paused, version 2026-10-11.4, view 320x180',
    );
  });
});

describe('feedback base URL', () => {
  it('uses the live worker only on the production host in a production build', () => {
    expect(feedbackBaseUrl({ hostname: PRODUCTION_HOST, dev: false })).toBe(SCORES_URL);
    expect(feedbackBaseUrl({ hostname: PRODUCTION_HOST, dev: true })).toBeNull();
    expect(feedbackBaseUrl({ hostname: 'localhost', dev: false })).toBeNull();
    expect(feedbackBaseUrl({ hostname: '127.0.0.1', dev: true })).toBeNull();
  });

  it('an injected test URL wins (any host), without a trailing slash; never a fallback to the live worker', () => {
    expect(feedbackBaseUrl({ hostname: 'localhost', dev: true, baseUrl: 'https://fb.test/' })).toBe('https://fb.test');
    expect(feedbackBaseUrl({ hostname: PRODUCTION_HOST, dev: false, baseUrl: 'https://fb.test' })).toBe('https://fb.test');
    expect(feedbackBaseUrl({ hostname: 'localhost', dev: true, baseUrl: '' })).toBeNull();
  });
});

interface Call {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body: unknown;
}

function fakeFetch(answer: number | 'reject' | 'hang') {
  const calls: Call[] = [];
  const fetchFn: FetchLike = (url, init) => {
    calls.push({ url, method: init?.method, headers: init?.headers, body: JSON.parse(init?.body ?? 'null') });
    if (answer === 'reject') return Promise.reject(new Error('offline'));
    if (answer === 'hang') return new Promise(() => {});
    return Promise.resolve({ ok: answer < 300, status: answer, json: () => Promise.resolve({}) });
  };
  return { calls, fetchFn };
}

const DRAFT = { kind: 'bug', text: 'Hängt beim Grinden', withLog: true } as const;
const CONTEXT = { platform: 'ios', touch: true, portrait: true, viewWidth: 390, mode: 'paused' } as const;

function sender(net: ReturnType<typeof fakeFetch>, baseUrl: string | null = 'https://fb.test', lines: string[] = ['error: x (a.js:1)']) {
  return new FeedbackSender({
    baseUrl,
    fetch: net.fetchFn,
    session: SESSION,
    version: '2026-10-11.4',
    log: { snapshot: (extra) => [...lines, extra] },
    timeoutMs: 20,
  });
}

describe('feedback sender', () => {
  it('posts the body as text/plain JSON to /feedback and answers sent', async () => {
    const net = fakeFetch(201);
    expect(await sender(net).send(DRAFT, CONTEXT)).toBe('sent');
    expect(net.calls).toHaveLength(1);
    const [call] = net.calls;
    expect(call!.url).toBe('https://fb.test/feedback');
    expect(call!.method).toBe('POST');
    expect(call!.headers).toEqual({ 'Content-Type': 'text/plain' });
    expect(call!.body).toMatchObject({
      session: SESSION,
      kind: 'bug',
      text: 'Hängt beim Grinden',
      platform: 'ios',
      input: 'touch',
      orientation: 'portrait',
      viewWidth: 390,
      log: ['error: x (a.js:1)', 'state: mode paused, version 2026-10-11.4, view 390x180'],
    });
  });

  it('sends no log when the box is not ticked or for an idea', async () => {
    const off = fakeFetch(204);
    await sender(off).send({ ...DRAFT, withLog: false }, CONTEXT);
    expect((off.calls[0]!.body as { log: string[] }).log).toEqual([]);
    const idea = fakeFetch(204);
    await sender(idea).send({ ...DRAFT, kind: 'idea' }, CONTEXT);
    expect((idea.calls[0]!.body as { log: string[] }).log).toEqual([]);
  });

  it('maps the answers: 429 rate, 400 invalid, 5xx / network / timeout offline', async () => {
    expect(await sender(fakeFetch(429)).send(DRAFT, CONTEXT)).toBe('rate');
    expect(await sender(fakeFetch(400)).send(DRAFT, CONTEXT)).toBe('invalid');
    expect(await sender(fakeFetch(503)).send(DRAFT, CONTEXT)).toBe('offline');
    expect(await sender(fakeFetch('reject')).send(DRAFT, CONTEXT)).toBe('offline');
    expect(await sender(fakeFetch('hang')).send(DRAFT, CONTEXT)).toBe('offline');
  });

  it('without a base URL nothing goes out and the answer is offline', async () => {
    const net = fakeFetch(204);
    expect(await sender(net, null).send(DRAFT, CONTEXT)).toBe('offline');
    expect(net.calls).toHaveLength(0);
  });

  it('a fetch that throws at once counts as offline', async () => {
    const throwing = new FeedbackSender({
      baseUrl: 'https://fb.test',
      fetch: () => {
        throw new Error('sync');
      },
      session: SESSION,
      version: 'v',
      log: null,
    });
    expect(await throwing.send(DRAFT, CONTEXT)).toBe('offline');
  });
});

describe('feedback sender keeps the new id', () => {
  function answering(status: number, body: unknown) {
    const fetchFn: FetchLike = () => Promise.resolve({ ok: status < 300, status, json: () => Promise.resolve(body) });
    return fetchFn;
  }
  function keeping(fetchFn: FetchLike) {
    const kept: number[] = [];
    const s = new FeedbackSender({ baseUrl: 'https://fb.test', fetch: fetchFn, session: SESSION, version: 'v', log: null, onSent: (id) => kept.push(id) });
    return { s, kept };
  }

  it('passes the id of {ok: true, id} on', async () => {
    const { s, kept } = keeping(answering(201, { ok: true, id: 42 }));
    expect(await s.send(DRAFT, CONTEXT)).toBe('sent');
    expect(kept).toEqual([42]);
  });

  it('still counts as sent without a valid id (older worker, junk), but keeps nothing', async () => {
    for (const body of [{ ok: true }, { ok: true, id: 0 }, { ok: true, id: '7' }, { ok: true, id: 1.5 }, null]) {
      const { s, kept } = keeping(answering(201, body));
      expect(await s.send(DRAFT, CONTEXT)).toBe('sent');
      expect(kept, JSON.stringify(body)).toEqual([]);
    }
    const broken = keeping(() => Promise.resolve({ ok: true, status: 201, json: () => Promise.reject(new Error('not json')) }));
    expect(await broken.s.send(DRAFT, CONTEXT)).toBe('sent');
    expect(broken.kept).toEqual([]);
  });

  it('keeps nothing when the report was refused', async () => {
    const { s, kept } = keeping(answering(429, { ok: false, error: 'rate', id: 5 }));
    expect(await s.send(DRAFT, CONTEXT)).toBe('rate');
    expect(kept).toEqual([]);
  });
});
