import { CHANGELOG, type ChangelogEntry, changesSince } from '../changelog';
import type { GameState } from '../types';
import type { Store } from './storage';

/** Store key of the newest version whose changes the player has seen. */
export const LAST_SEEN_VERSION_KEY = 'lastSeenVersion';

/**
 * At startup: the changes since the stored last-seen version (for
 * `state.whatsNew`). On a first visit (nothing or junk stored) it stores the
 * running build right away, so first-timers never see the screen.
 */
export function loadWhatsNew(store: Store, log: readonly ChangelogEntry[] = CHANGELOG): ChangelogEntry[] {
  const lastSeen = store.get<unknown>(LAST_SEEN_VERSION_KEY, null);
  if (typeof lastSeen !== 'string') {
    store.set(LAST_SEEN_VERSION_KEY, log[0]!.version);
    return [];
  }
  return changesSince(lastSeen, log);
}

/** The player closed the "what's new" screen: remember the running build and empty `state.whatsNew`. */
export function markVersionSeen(state: GameState, store: Store, log: readonly ChangelogEntry[] = CHANGELOG): void {
  store.set(LAST_SEEN_VERSION_KEY, log[0]!.version);
  state.whatsNew = [];
}
