/**
 * The browser side of src/net: the ScoreService with the real fetch against
 * the live worker, Date.now, navigator.onLine, and a retry of the offline
 * queue when the page comes online again or becomes visible; and the
 * anonymous statistics (Telemetry) with the real gate, fetch and beacon,
 * sending `end` whenever the page is hidden or left; and the feedback sender
 * (ROADMAP 50). The error log (error-log.ts) is installed once on the window
 * here and records the failed requests of all three; statistics and feedback
 * share this page load's session id (memory only, never stored).
 */
import { BUILD_VERSION } from '../changelog';
import type { Store } from '../core/storage';
import { type FetchLike, ScoresApi } from './api';
import { loadDeviceId } from './device';
import { ErrorLog, installErrorLog, loggedFetch } from './error-log';
import { feedbackBaseUrl, FeedbackSender } from './feedback';
import { ScoreService } from './service';
import { newSessionId, Telemetry, telemetryBaseUrl } from './telemetry';

declare global {
  interface Window {
    /**
     * An explicit statistics endpoint for manual or play tests (set before the game loads, e.g. by
     * a Playwright init script); unset, only the production host sends to the live worker.
     */
    __telemetryUrl?: string;
    /** The same for feedback (POST /feedback); unset, only the production host sends to the live worker. */
    __feedbackUrl?: string;
  }
  interface Navigator {
    /** Global Privacy Control (not in every TS lib yet). */
    globalPrivacyControl?: boolean;
  }
}

let pageLog: ErrorLog | null = null;
let pageSession: string | null = null;

/** The page's error log, installed on the window on first use. */
export function browserErrorLog(): ErrorLog {
  if (!pageLog) {
    pageLog = new ErrorLog();
    installErrorLog(window, pageLog);
  }
  return pageLog;
}

/** The session id of this page load (statistics and the feedback rate limit). */
function browserSession(): string {
  pageSession ??= newSessionId();
  return pageSession;
}

/** The real fetch, logging failed requests into the page's error log. */
function netFetch(): FetchLike {
  return loggedFetch((url, init) => fetch(url, init), browserErrorLog());
}

export function createBrowserScoreService(store: Store): ScoreService {
  const service = new ScoreService({
    api: new ScoresApi(netFetch()),
    store,
    version: BUILD_VERSION,
    device: loadDeviceId(store),
    now: () => Date.now(),
    online: () => navigator.onLine !== false,
    schedule: (fn, ms) => void setTimeout(fn, ms),
  });
  window.addEventListener('online', () => void service.retryPending());
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) void service.retryPending();
  });
  return service;
}

export function createBrowserTelemetry(store: Store): Telemetry {
  const baseUrl = telemetryBaseUrl({
    hostname: location.hostname,
    dev: import.meta.env.DEV,
    gpc: navigator.globalPrivacyControl === true,
    baseUrl: window.__telemetryUrl,
  });
  const beacon =
    typeof navigator.sendBeacon === 'function'
      ? (url: string, body: string) => navigator.sendBeacon(url, new Blob([body], { type: 'text/plain' }))
      : null;
  const telemetry = new Telemetry({ baseUrl, fetch: netFetch(), beacon, store, version: BUILD_VERSION, session: browserSession() });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') telemetry.end();
  });
  window.addEventListener('pagehide', () => telemetry.end());
  return telemetry;
}

export function createBrowserFeedback(): FeedbackSender {
  const baseUrl = feedbackBaseUrl({ hostname: location.hostname, dev: import.meta.env.DEV, baseUrl: window.__feedbackUrl });
  return new FeedbackSender({ baseUrl, fetch: netFetch(), session: browserSession(), version: BUILD_VERSION, log: browserErrorLog() });
}
