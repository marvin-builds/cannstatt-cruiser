import { isFullscreen } from './fullscreen';

/**
 * Frees portrait while the player types (ROADMAP 54). The installed app is held
 * in landscape by the manifest and fullscreen locks landscape, so a form would
 * keep the small landscape keyboard; while a form is open the lock becomes
 * 'any', and 'landscape' again when it closes. Android honours this in an
 * installed app or fullscreen; iOS mostly ignores locks, failures are swallowed.
 */
export interface OrientationEnv {
  /** Whether the game holds the orientation now (installed app or fullscreen). */
  locked(): boolean;
  lock?: (orientation: string) => Promise<void>;
}

export interface OrientationLock {
  /** Call with whether a text form is open (every tick is fine: only changes act). */
  allowPortrait(on: boolean): void;
}

export function createOrientationLock(env: OrientationEnv): OrientationLock {
  let portrait = false;
  return {
    allowPortrait(on) {
      if (on === portrait) return;
      portrait = on;
      if (!env.locked() || !env.lock) return;
      try {
        env.lock(on ? 'any' : 'landscape').catch(() => {});
      } catch {
        // Lock refused synchronously: keep the current orientation.
      }
    },
  };
}

/** The browser's lock: installed (standalone or fullscreen display mode) or in fullscreen. */
export function browserOrientationEnv(): OrientationEnv {
  const orientation = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
  const installed = () =>
    ['standalone', 'fullscreen'].some((mode) => window.matchMedia?.(`(display-mode: ${mode})`).matches);
  return {
    locked: () => installed() || isFullscreen(),
    lock: orientation?.lock ? (o) => orientation.lock!(o) : undefined,
  };
}
