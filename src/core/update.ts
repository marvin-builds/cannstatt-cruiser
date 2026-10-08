import type { GameState } from '../types';

/** What public/sw.js posts to every window once a changed deploy is fully cached. */
export const UPDATE_READY_MESSAGE = { type: 'updateReady' } as const;

/** Applies a service worker message (`MessageEvent.data`) to the state; unknown messages are ignored. */
export function handleServiceWorkerMessage(state: GameState, data: unknown): void {
  if (typeof data === 'object' && data !== null && (data as { type?: unknown }).type === UPDATE_READY_MESSAGE.type) {
    state.updateReady = true;
  }
}

/** What a window posts to the worker to re-check the deploy while the app stays open (public/sw.js). */
export const CHECK_FOR_UPDATE_MESSAGE = { type: 'checkForUpdate' } as const;
/** How often an open app re-checks for a new deploy. */
export const UPDATE_CHECK_INTERVAL_MS = 5 * 60_000;
/** Minimum time between two checks, so quick app switches do not refetch the page. */
const RESUME_CHECK_GAP_MS = 10_000;

/** Whether to re-check now: on coming back to the foreground (`resumed`) or once the interval has passed. */
export function shouldCheckForUpdate(lastCheckMs: number, nowMs: number, resumed: boolean): boolean {
  const since = nowMs - lastCheckMs;
  return since >= UPDATE_CHECK_INTERVAL_MS || (resumed && since >= RESUME_CHECK_GAP_MS);
}
