/**
 * The ScoreService as the browser game uses it: the real fetch against the
 * live worker, Date.now, navigator.onLine, and a retry of the offline queue
 * when the page comes online again or becomes visible.
 */
import { BUILD_VERSION } from '../changelog';
import type { Store } from '../core/storage';
import { ScoresApi } from './api';
import { loadDeviceId } from './device';
import { ScoreService } from './service';

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
