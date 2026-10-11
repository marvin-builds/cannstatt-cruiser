/**
 * New vs. returning player (ROADMAP 55): whether the game had its own stored
 * data on this device before this page load. No id, no fingerprint: only the
 * presence of the game's localStorage keys (core/storage's `cannstatt-cruiser:`
 * prefix, which src/net may not import), apart from the keys only the insights
 * board writes. Read once before anything in this page load writes (see
 * browser.ts); never throws.
 */
import { TEST_DEVICE_KEY } from './telemetry-types';

/** core/storage's NAMESPACE: every key the game stores starts with it. */
const GAME_KEY_PREFIX = 'cannstatt-cruiser:';
/** Keys under the prefix that only the insights board writes, so they say nothing about playing. */
const BOARD_ONLY_KEYS: readonly string[] = [TEST_DEVICE_KEY];

/** The part of localStorage this reads. */
export type StorageKeys = Pick<Storage, 'length' | 'key'>;

/** True with any game key stored, false without; undefined (unknown) without storage or when it throws. */
export function hadGameData(storage: StorageKeys | null): boolean | undefined {
  if (!storage) return undefined;
  try {
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key?.startsWith(GAME_KEY_PREFIX) && !BOARD_ONLY_KEYS.includes(key.slice(GAME_KEY_PREFIX.length))) return true;
    }
    return false;
  } catch {
    return undefined;
  }
}
