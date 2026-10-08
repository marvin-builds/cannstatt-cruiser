import type { GameState } from '../types';

/** What public/sw.js posts to every window once a changed deploy is fully cached. */
export const UPDATE_READY_MESSAGE = { type: 'updateReady' } as const;

/** Applies a service worker message (`MessageEvent.data`) to the state; unknown messages are ignored. */
export function handleServiceWorkerMessage(state: GameState, data: unknown): void {
  if (typeof data === 'object' && data !== null && (data as { type?: unknown }).type === UPDATE_READY_MESSAGE.type) {
    state.updateReady = true;
  }
}
