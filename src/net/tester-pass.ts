/**
 * The tester pass (ROADMAP 75): the insights board stores a signed pass under
 * TESTER_PASS_KEY on a device the owner marked as a test device (ROADMAP 55).
 * The game only reads it and sends it with `POST /feedback` (feedback.ts), so
 * the worker lifts the per-session feedback limit for it. Read at send time:
 * unmarking the device on the board stops it at once.
 */
import type { Store } from '../core/storage';
import { MAX_TESTER_PASS_CHARS, TESTER_PASS_KEY } from './feedback-types';
import { loadTestDevice } from './telemetry';

/** The stored pass on a marked test device; null when unmarked or without a usable pass. */
export function loadTesterPass(store: Store): string | null {
  if (!loadTestDevice(store)) return null;
  const pass = store.get<unknown>(TESTER_PASS_KEY, null);
  return typeof pass === 'string' && pass.length > 0 && pass.length <= MAX_TESTER_PASS_CHARS ? pass : null;
}
