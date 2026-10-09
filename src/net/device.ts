/**
 * The random device id the server rate-limits by (it stores only its hash).
 * Made once per install and kept in the store (key `deviceId`).
 */
import type { Store } from '../core/storage';

export const DEVICE_KEY = 'deviceId';
/** The server's rule for `device`. */
const DEVICE_RULE = /^[A-Za-z0-9-]{8,64}$/;

/** A fresh random id: crypto.randomUUID where available (older iOS lacks it), else random hex. */
export function randomDeviceId(): string {
  const c = typeof crypto === 'undefined' ? undefined : crypto;
  if (c?.randomUUID) return c.randomUUID();
  const bytes = new Uint8Array(16);
  if (c?.getRandomValues) c.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** The stored device id, or a new one (stored at once) when none or an invalid one is stored. */
export function loadDeviceId(store: Store, generate: () => string = randomDeviceId): string {
  const stored = store.get<unknown>(DEVICE_KEY, null);
  if (typeof stored === 'string' && DEVICE_RULE.test(stored)) return stored;
  const id = generate();
  store.set(DEVICE_KEY, id);
  return id;
}
