/**
 * The owner's test-device marker (ROADMAP 55) under TEST_DEVICE_KEY: true =
 * test device, false = switched off here, absent = never unlocked here. Only the
 * board writes it; it holds a plain flag, never the token or any id.
 */
import type { Store } from '../core/storage';
import { TEST_DEVICE_KEY } from '../net/telemetry-types';

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

/** The board switch 'Dieses Gerät ist ein Testgerät'. */
export function setTestDevice(store: Store, on: boolean): void {
  store.set(TEST_DEVICE_KEY, on);
}
