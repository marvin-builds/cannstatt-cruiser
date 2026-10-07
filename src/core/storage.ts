const NAMESPACE = 'cannstatt-cruiser:';

export interface Store {
  get<T>(key: string, fallback: T): T;
  set(key: string, value: unknown): void;
}

/**
 * JSON key/value store over localStorage that never throws (private mode,
 * disabled storage, quota) and falls back to defaults instead.
 */
export function createStore(backend: Storage | null): Store {
  return {
    get<T>(key: string, fallback: T): T {
      try {
        const raw = backend?.getItem(NAMESPACE + key);
        return raw == null ? fallback : (JSON.parse(raw) as T);
      } catch {
        return fallback;
      }
    },
    set(key: string, value: unknown): void {
      try {
        backend?.setItem(NAMESPACE + key, JSON.stringify(value));
      } catch {
        // Persistence is best effort.
      }
    },
  };
}

function browserStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** Shared store for highscore, star total, mute flag, ... */
export const store: Store = createStore(browserStorage());
