/**
 * The browser side of src/net: the ScoreService with the real fetch against
 * the live worker, Date.now, navigator.onLine, and a retry of the offline
 * queue when the page comes online again or becomes visible; and the
 * anonymous statistics (Telemetry) with the real gate, fetch and beacon,
 * sending `end` whenever the page is hidden or left.
 */
import { BUILD_VERSION } from '../changelog';
import type { Store } from '../core/storage';
import { ScoresApi } from './api';
import { loadDeviceId } from './device';
import { ScoreService } from './service';
import { Telemetry, telemetryBaseUrl } from './telemetry';

declare global {
  interface Window {
    /**
     * An explicit statistics endpoint for manual or play tests (set before the game loads, e.g. by
     * a Playwright init script); unset, only the production host sends to the live worker.
     */
    __telemetryUrl?: string;
  }
  interface Navigator {
    /** Global Privacy Control (not in every TS lib yet). */
    globalPrivacyControl?: boolean;
  }
}

export function createBrowserScoreService(store: Store): ScoreService {
  const service = new ScoreService({
    api: new ScoresApi((url, init) => fetch(url, init)),
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
  const telemetry = new Telemetry({ baseUrl, fetch: (url, init) => fetch(url, init), beacon, store, version: BUILD_VERSION });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') telemetry.end();
  });
  window.addEventListener('pagehide', () => telemetry.end());
  return telemetry;
}
