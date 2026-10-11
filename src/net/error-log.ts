/**
 * The game's error log for bug reports (ROADMAP 50): an in-memory ring buffer
 * of the last MAX_LOG_LINES lines, each cut to MAX_LOG_LINE_CHARS. It holds
 * uncaught errors (message and file basename:line), unhandled rejections
 * (the reason's message) and failed requests of the game's own net clients
 * (endpoint path and status, or 'offline'). URLs are cut down to their file
 * name and queries never get in (`/top?device=...` carries the device id);
 * request bodies (player names) are never logged. Nothing is stored or sent
 * unless the player ticks "Fehlerprotokoll mitsenden" on a bug report.
 */
import type { FetchLike } from './api';
import { MAX_LOG_LINE_CHARS, MAX_LOG_LINES } from './feedback-types';

/** A URL in free text: scheme, then everything up to whitespace or a quote or bracket. */
const URL_IN_TEXT = /\b[a-z][a-z0-9+.-]*:\/\/[^\s'"()<>]+/gi;

/** The last path segment of `url` without query or hash ('' for a bare host). */
function fileName(url: string): string {
  const path = url.replace(/[?#].*$/, '').replace(/^[a-z][a-z0-9+.-]*:\/\/[^/]*/i, '');
  return path.slice(path.lastIndexOf('/') + 1);
}

/** The path of `url` without host, query or hash. */
function endpointPath(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return url.replace(/[?#].*$/, '');
  }
}

/** Every URL in `text` replaced by its file name: no hosts, paths or queries. */
export function stripUrls(text: string): string {
  return text.replace(URL_IN_TEXT, (url) => fileName(url)).replace(/ {2,}/g, ' ');
}

function reasonText(reason: unknown): string {
  if (reason instanceof Error) return reason.message;
  if (typeof reason === 'object' && reason !== null && typeof (reason as { message?: unknown }).message === 'string') {
    return (reason as { message: string }).message;
  }
  return String(reason);
}

/** The part of an error log the feedback sender reads. */
export interface ErrorLogLike {
  /** A copy of the recorded lines (empty: nothing to send). */
  lines(): string[];
  /** A copy of the lines plus `extra` as the last one, at most MAX_LOG_LINES. */
  snapshot(extra: string): string[];
}

export class ErrorLog implements ErrorLogLike {
  private readonly buffer: string[] = [];

  /** Adds one line (on one line, cut to MAX_LOG_LINE_CHARS); the oldest goes beyond MAX_LOG_LINES. */
  add(line: string): void {
    this.buffer.push(oneLine(line));
    if (this.buffer.length > MAX_LOG_LINES) this.buffer.shift();
  }

  /** An uncaught error: its message and where it came from (file basename and line only). */
  error(message: string, source?: string, line?: number): void {
    const file = source ? fileName(source) : '';
    const where = file ? ` (${file}${line ? `:${line}` : ''})` : '';
    this.add(`error: ${stripUrls(message)}${where}`);
  }

  /** An unhandled promise rejection: the reason's message. */
  rejection(reason: unknown): void {
    this.add(`rejection: ${stripUrls(reasonText(reason))}`);
  }

  /** A failed request of the game's own clients: endpoint path and status, or 'offline'. */
  request(url: string, status: number | 'offline'): void {
    this.add(`request: ${endpointPath(url)} ${status}`);
  }

  lines(): string[] {
    return [...this.buffer];
  }

  snapshot(extra: string): string[] {
    return [...this.buffer, oneLine(extra)].slice(-MAX_LOG_LINES);
  }
}

function oneLine(line: string): string {
  return line.replace(/\s*[\r\n]+\s*/g, ' ').slice(0, MAX_LOG_LINE_CHARS);
}

/** What installErrorLog listens on (window). */
export interface ErrorEventTarget {
  addEventListener(type: string, listener: (event: Event) => void): void;
}

/** Logs the target's uncaught errors and unhandled rejections into `log`. */
export function installErrorLog(target: ErrorEventTarget, log: ErrorLog): void {
  target.addEventListener('error', (event) => {
    const e = event as Partial<ErrorEvent>;
    log.error(e.message || 'unknown error', e.filename, e.lineno);
  });
  target.addEventListener('unhandledrejection', (event) => log.rejection((event as Partial<PromiseRejectionEvent>).reason));
}

/** `fetch` that logs failed answers (status >= 400) and network errors into `log`; answers and errors pass through. */
export function loggedFetch(fetchFn: FetchLike, log: ErrorLog): FetchLike {
  return async (url, init) => {
    try {
      const response = await fetchFn(url, init);
      if (response.status >= 400) log.request(url, response.status);
      return response;
    } catch (error) {
      log.request(url, 'offline');
      throw error;
    }
  };
}
