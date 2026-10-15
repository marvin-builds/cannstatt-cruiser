import { describe, expect, it } from 'vitest';
import type { FetchLike } from './api';
import { ErrorLog, installErrorLog, loggedFetch, stripUrls } from './error-log';
import { MAX_LOG_LINE_CHARS, MAX_LOG_LINES } from './feedback-types';

describe('error log', () => {
  it('keeps only the last MAX_LOG_LINES lines', () => {
    const log = new ErrorLog();
    for (let i = 0; i < MAX_LOG_LINES + 5; i++) log.add(`line ${i}`);
    const lines = log.lines();
    expect(lines).toHaveLength(MAX_LOG_LINES);
    expect(lines[0]).toBe('line 5');
    expect(lines[lines.length - 1]).toBe(`line ${MAX_LOG_LINES + 4}`);
  });

  it('cuts every line to MAX_LOG_LINE_CHARS and keeps it on one line', () => {
    const log = new ErrorLog();
    log.add('x'.repeat(MAX_LOG_LINE_CHARS + 50));
    log.add('two\nlines\r\nhere');
    const [long, joined] = log.lines();
    expect(long).toHaveLength(MAX_LOG_LINE_CHARS);
    expect(joined).toBe('two lines here');
  });

  it('logs an uncaught error with the file basename and line, never the full URL or query', () => {
    const log = new ErrorLog();
    log.error('TypeError: x is undefined', 'https://marvin-builds.github.io/cannstatt-cruiser/assets/index-abc123.js?v=2#top', 42);
    expect(log.lines()).toEqual(['error: TypeError: x is undefined (index-abc123.js:42)']);
  });

  it('strips URLs inside messages down to their file name', () => {
    expect(stripUrls('Failed to load https://example.test/a/b/c.js?token=secret#x now')).toBe('Failed to load c.js now');
    expect(stripUrls('at http://localhost:5173/src/ui/index.ts?t=1:12:3')).toBe('at index.ts');
    expect(stripUrls('no url here')).toBe('no url here');
  });

  it('logs an unhandled rejection with the reason message', () => {
    const log = new ErrorLog();
    log.rejection(new Error('boom'));
    log.rejection('plain reason');
    log.rejection(undefined);
    expect(log.lines()).toEqual(['rejection: boom', 'rejection: plain reason', 'rejection: undefined']);
  });

  it('logs a failed request as endpoint path and status, never the host or query (device ids)', () => {
    const log = new ErrorLog();
    log.request('https://worker.test/top?device=abc-secret', 503);
    log.request('https://worker.test/score', 'offline');
    expect(log.lines()).toEqual(['request: /top 503', 'request: /score offline']);
  });

  it('a snapshot appends one extra line and still keeps MAX_LOG_LINES', () => {
    const log = new ErrorLog();
    expect(log.snapshot('state: title')).toEqual(['state: title']);
    for (let i = 0; i < MAX_LOG_LINES; i++) log.add(`line ${i}`);
    const snap = log.snapshot('state: paused');
    expect(snap).toHaveLength(MAX_LOG_LINES);
    expect(snap[0]).toBe('line 1');
    expect(snap[snap.length - 1]).toBe('state: paused');
    // The snapshot does not change the log itself.
    expect(log.lines()[0]).toBe('line 0');
  });

  it('installs listeners for uncaught errors and unhandled rejections', () => {
    const listeners = new Map<string, (e: Event) => void>();
    const target = { addEventListener: (type: string, fn: (e: Event) => void) => void listeners.set(type, fn) };
    const fire = (type: string, fields: object) => listeners.get(type)!(fields as Event);
    const log = new ErrorLog();
    installErrorLog(target, log);
    fire('error', { message: 'ReferenceError: y', filename: 'https://h.test/assets/game.js?x=1', lineno: 7 });
    fire('unhandledrejection', { reason: new Error('nope') });
    expect(log.lines()).toEqual(['error: ReferenceError: y (game.js:7)', 'rejection: nope']);
  });

  it('a logged fetch records failed answers and network errors, passes everything through, and never logs bodies', async () => {
    const log = new ErrorLog();
    const answers = [500, 200, 429];
    let calls = 0;
    const fetchFn: FetchLike = (url) => {
      calls++;
      if (url.includes('fail')) return Promise.reject(new Error('net down'));
      const status = answers.shift()!;
      return Promise.resolve({ ok: status < 300, status, json: () => Promise.resolve(null) });
    };
    const f = loggedFetch(fetchFn, log);
    expect((await f('https://w.test/top?device=x', { body: '{"name":"Lena"}' })).status).toBe(500);
    expect((await f('https://w.test/top')).status).toBe(200);
    expect((await f('https://w.test/score', { method: 'POST', body: '{"name":"Lena"}' })).status).toBe(429);
    await expect(f('https://w.test/fail')).rejects.toThrow('net down');
    expect(calls).toBe(4);
    expect(log.lines()).toEqual(['request: /top 500', 'request: /score 429', 'request: /fail offline']);
    expect(log.lines().join()).not.toContain('Lena');
  });
});
