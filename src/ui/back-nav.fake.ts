/** A test double of the browser history for back-nav.ts (ROADMAP 75). */
import type { HistoryEnv } from './back-nav';

/** A fake session history: our entries on top of the page's own, popstate delivered by `pressBack` / `settle`. */
export function fakeHistory(onOurEntry = false) {
  const fake = {
    /** Entries above the page's own one (ours). */
    extra: onOurEntry ? 1 : 0,
    pushes: 0,
    backs: 0,
    /** history.back() calls whose popstate has not arrived yet. */
    pending: 0,
    listener: null as (() => void) | null,
    env: null as unknown as HistoryEnv,
    /** The player's back button / gesture: leaves the app when there is no entry of ours. */
    left: false,
    pressBack() {
      if (fake.extra === 0) {
        fake.left = true;
        return;
      }
      fake.extra--;
      fake.listener?.();
    },
    /** Delivers the popstate of the game's own history.back() calls. */
    settle() {
      while (fake.pending > 0) {
        fake.pending--;
        fake.extra--;
        fake.listener?.();
      }
    },
  };
  fake.env = {
    onOurEntry: () => onOurEntry,
    push: () => void (fake.pushes++, fake.extra++),
    back: () => void (fake.backs++, fake.pending++),
    onPop: (listener) => void (fake.listener = listener),
  };
  return fake;
}
