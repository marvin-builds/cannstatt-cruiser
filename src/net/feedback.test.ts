import { describe, expect, it } from 'vitest';
import { type FetchLike, SCORES_URL } from './api';
import { feedbackBaseUrl, feedbackBody, type FeedbackDraft, type FeedbackInput, FeedbackSender, stateLine } from './feedback';
import { type SentReport, sentReport } from './feedback-reports';
import { FEEDBACK_KEY_PATTERN, MAX_FEEDBACK_TEXT, MAX_LOG_LINES, MAX_VIEW_WIDTH, MIN_VIEW_WIDTH } from './feedback-types';
import { PRODUCTION_HOST } from './telemetry';

const SESSION = 'b'.repeat(32);
const KEY = 'c'.repeat(32);

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
  key: KEY,
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
      key: KEY,
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
      ['key', 'kind', 'input', 'log', 'orientation', 'platform', 'session', 'text', 'version', 'viewWidth'].sort(),
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

function fakeFetch(answer: number | 'reject' | 'hang', reply: unknown = {}) {
  const calls: Call[] = [];
  const fetchFn: FetchLike = (url, init) => {
    calls.push({ url, method: init?.method, headers: init?.headers, body: JSON.parse(init?.body ?? 'null') });
    if (answer === 'reject') return Promise.reject(new Error('offline'));
    if (answer === 'hang') return new Promise(() => {});
    return Promise.resolve({ ok: answer < 300, status: answer, json: () => Promise.resolve(reply) });
  };
  return { calls, fetchFn };
}

const DRAFT = { kind: 'bug', text: 'Hängt beim Grinden', withLog: true } as const;
const CONTEXT = { platform: 'ios', touch: true, portrait: true, viewWidth: 390, mode: 'paused' } as const;
const NOON = Date.parse('2026-10-11T12:00:00Z');

function sender(
  net: { fetchFn: FetchLike },
  { baseUrl = 'https://fb.test' as string | null, lines = ['error: x (a.js:1)'], kept = [] as SentReport[] } = {},
) {
  let keys = 0;
  return new FeedbackSender({
    baseUrl,
    fetch: net.fetchFn,
    session: SESSION,
    version: '2026-10-11.4',
    log: { lines: () => [...lines], snapshot: (extra) => [...lines, extra] },
    timeoutMs: 20,
    newKey: () => String(++keys).padStart(32, '0'),
    now: () => NOON,
    onSent: (report) => kept.push(report),
  });
}

/** Prepares and sends `draft` like the form does. */
const prepareAndSend = (s: FeedbackSender, draft: FeedbackDraft = DRAFT) => s.send(s.prepare(draft, CONTEXT));

describe('feedback sender', () => {
  it('prepares the whole body: a new key per report, the log snapshot with the state line', () => {
    const s = sender(fakeFetch(201));
    const body = s.prepare(DRAFT, CONTEXT);
    expect(body).toEqual({
      session: SESSION,
      kind: 'bug',
      text: 'Hängt beim Grinden',
      version: '2026-10-11.4',
      platform: 'ios',
      input: 'touch',
      orientation: 'portrait',
      viewWidth: 390,
      log: ['error: x (a.js:1)', 'state: mode paused, version 2026-10-11.4, view 390x180'],
      key: '0'.repeat(31) + '1',
    });
    expect(s.prepare(DRAFT, CONTEXT).key).toBe('0'.repeat(31) + '2');
  });

  it('makes a 32 hex key with crypto.getRandomValues by default', () => {
    const s = new FeedbackSender({ baseUrl: null, fetch: fakeFetch(201).fetchFn, session: SESSION, version: 'v', log: null });
    expect(s.prepare(DRAFT, CONTEXT).key).toMatch(FEEDBACK_KEY_PATTERN);
  });

  it('posts exactly the prepared body as text/plain JSON to /feedback, even when the log changed since', async () => {
    const net = fakeFetch(201, { ok: true, id: 9 });
    const lines = ['error: x (a.js:1)'];
    const s = sender(net, { lines });
    const snapshot = s.prepare(DRAFT, CONTEXT);
    lines.push('error: later (b.js:2)');
    expect(await s.send(snapshot)).toBe('sent');
    expect(net.calls).toEqual([{ url: 'https://fb.test/feedback', method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: snapshot }]);
  });

  it('sends no log when the box is not ticked, for an idea, or when nothing was recorded', async () => {
    expect(sender(fakeFetch(204)).prepare({ ...DRAFT, withLog: false }, CONTEXT).log).toEqual([]);
    expect(sender(fakeFetch(204)).prepare({ ...DRAFT, kind: 'idea' }, CONTEXT).log).toEqual([]);
    const empty = sender(fakeFetch(204), { lines: [] });
    expect(empty.hasLog).toBe(false);
    expect(empty.prepare(DRAFT, CONTEXT).log).toEqual([]);
    expect(sender(fakeFetch(204)).hasLog).toBe(true);
    expect(new FeedbackSender({ baseUrl: null, fetch: fakeFetch(201).fetchFn, session: SESSION, version: 'v', log: null }).hasLog).toBe(false);
  });

  it('maps the answers: 429 rate, 400 invalid, 5xx / network / timeout offline', async () => {
    expect(await prepareAndSend(sender(fakeFetch(429)))).toBe('rate');
    expect(await prepareAndSend(sender(fakeFetch(400)))).toBe('invalid');
    expect(await prepareAndSend(sender(fakeFetch(503)))).toBe('offline');
    expect(await prepareAndSend(sender(fakeFetch('reject')))).toBe('offline');
    expect(await prepareAndSend(sender(fakeFetch('hang')))).toBe('offline');
  });

  it('without a base URL nothing goes out and the answer is offline', async () => {
    const net = fakeFetch(204);
    expect(await prepareAndSend(sender(net, { baseUrl: null }))).toBe('offline');
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
    expect(await prepareAndSend(throwing)).toBe('offline');
  });
});

describe('feedback sender keeps the sent report', () => {
  it('passes what was sent with the new id and the UTC day on, without the session id', async () => {
    const kept: SentReport[] = [];
    const s = sender(fakeFetch(201, { ok: true, id: 42 }), { kept });
    const body = s.prepare(DRAFT, CONTEXT);
    expect(await s.send(body)).toBe('sent');
    expect(kept).toEqual([sentReport(body, 42, '2026-10-11')]);
  });

  it('still counts as sent without a valid id (older worker, junk), but keeps nothing', async () => {
    for (const reply of [{ ok: true }, { ok: true, id: 0 }, { ok: true, id: '7' }, { ok: true, id: 1.5 }, null]) {
      const kept: SentReport[] = [];
      expect(await prepareAndSend(sender(fakeFetch(201, reply), { kept }))).toBe('sent');
      expect(kept, JSON.stringify(reply)).toEqual([]);
    }
    const kept: SentReport[] = [];
    const broken = sender({ fetchFn: () => Promise.resolve({ ok: true, status: 201, json: () => Promise.reject(new Error('not json')) }) }, { kept });
    expect(await prepareAndSend(broken)).toBe('sent');
    expect(kept).toEqual([]);
  });

  it('keeps nothing when the report was refused', async () => {
    const kept: SentReport[] = [];
    expect(await prepareAndSend(sender(fakeFetch(429, { ok: false, error: 'rate', id: 5 }), { kept }))).toBe('rate');
    expect(kept).toEqual([]);
  });
});
