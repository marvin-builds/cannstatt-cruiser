/**
 * The owner's test-device marker (ROADMAP 55) under TEST_DEVICE_KEY: true =
 * test device, false = switched off here, absent = never unlocked here. Only the
 * board writes it; it holds a plain flag, never the token or any id.
 * A marked device also holds a tester pass (ROADMAP 75) under TESTER_PASS_KEY: the plain pass string,
 * which the game sends with its feedback to skip the per-session limit. It is fetched when the switch is
 * turned on and on every unlock of a marked device, and dropped (stored as null) when the switch is turned off.
 */
import type { Store } from '../core/storage';
import { TESTER_PASS_KEY } from '../net/feedback-types';
import { TEST_DEVICE_KEY } from '../net/telemetry-types';
import type { TesterPassResult } from './client';
import { formatDate } from './format';

/** Asks the worker for a new tester pass with the board's current bearer. */
export type FetchTesterPass = () => Promise<TesterPassResult>;

/** true / false as stored, null when absent (anything that is not a boolean counts as absent). */
export function testDeviceState(store: Store): boolean | null {
  const value = store.get<unknown>(TEST_DEVICE_KEY, null);
  return typeof value === 'boolean' ? value : null;
}

/** After a successful unlock: marks the device only if it was never marked; returns the marker. */
export function markOnUnlock(store: Store): boolean {
  const state = testDeviceState(store);
  if (state !== null) return state;
  store.set(TEST_DEVICE_KEY, true);
  return true;
}

/** Writes the marker only; switchTestDevice also fetches or drops the tester pass. */
export function setTestDevice(store: Store, on: boolean): void {
  store.set(TEST_DEVICE_KEY, on);
}

/** The stored tester pass, or null (anything but a non-empty string counts as none). */
export function storedTesterPass(store: Store): string | null {
  const value = store.get<unknown>(TESTER_PASS_KEY, null);
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function dropTesterPass(store: Store): void {
  if (store.get<unknown>(TESTER_PASS_KEY, null) !== null) store.set(TESTER_PASS_KEY, null);
}

/**
 * On a marked device fetches a new pass and stores it (unless the device was unmarked meanwhile); a failure
 * keeps an older pass, which the worker simply ignores once expired. On an unmarked device drops the pass and
 * returns null without asking the worker.
 */
export async function refreshTesterPass(store: Store, fetchPass: FetchTesterPass): Promise<TesterPassResult | null> {
  if (testDeviceState(store) !== true) {
    dropTesterPass(store);
    return null;
  }
  const result = await fetchPass();
  if (result.ok && testDeviceState(store) === true) store.set(TESTER_PASS_KEY, result.pass.pass);
  return result;
}

/** The board switch 'Dieses Gerät ist ein Testgerät': on fetches a tester pass, off drops it. */
export function switchTestDevice(store: Store, on: boolean, fetchPass: FetchTesterPass): Promise<TesterPassResult | null> {
  setTestDevice(store, on);
  return refreshTesterPass(store, fetchPass);
}

/** The line under the switch after a refresh, or null when nothing was asked. */
export function testerPassNote(result: TesterPassResult | null): string | null {
  if (!result) return null;
  if (!result.ok) return 'Testerpass gerade nicht abrufbar, das Feedback-Limit gilt weiter';
  return `Feedback ohne Tageslimit bis ${formatDate(new Date(result.pass.expiresAt).toISOString().slice(0, 10))}`;
}
