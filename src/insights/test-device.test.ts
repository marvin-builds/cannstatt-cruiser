import { describe, expect, it } from 'vitest';
import { createMemoryStore, createStore } from '../core/storage';
import { TESTER_PASS_KEY } from '../net/feedback-types';
import { TEST_DEVICE_KEY } from '../net/telemetry-types';
import type { TesterPassResult } from './client';
import { markOnUnlock, refreshTesterPass, setTestDevice, storedTesterPass, switchTestDevice, testDeviceState, testerPassNote } from './test-device';

const PASS = 'tester.v1.1791800000000.c2lnbmF0dXJlLW9mLXRoZS10ZXN0ZXItcGFzcy0wMQ';
const EXPIRES = Date.parse('2027-04-10T09:15:00Z');
const granted = async (): Promise<TesterPassResult> => ({ ok: true, pass: { pass: PASS, expiresAt: EXPIRES } });
const failing = async (): Promise<TesterPassResult> => ({ ok: false, error: 'server' });
const never = async (): Promise<TesterPassResult> => {
  throw new Error('no pass may be fetched');
};

describe('test device marker', () => {
  it('reads absent as null and only real booleans as set', () => {
    const store = createMemoryStore();
    expect(testDeviceState(store)).toBeNull();
    store.set(TEST_DEVICE_KEY, 'yes');
    expect(testDeviceState(store)).toBeNull();
    store.set(TEST_DEVICE_KEY, false);
    expect(testDeviceState(store)).toBe(false);
  });
  it('marks a device on its first unlock', () => {
    const store = createMemoryStore();
    expect(markOnUnlock(store)).toBe(true);
    expect(store.get(TEST_DEVICE_KEY, null)).toBe(true);
  });
  it('never touches a marker that was switched off or on', () => {
    const off = createMemoryStore();
    off.set(TEST_DEVICE_KEY, false);
    expect(markOnUnlock(off)).toBe(false);
    expect(off.get(TEST_DEVICE_KEY, null)).toBe(false);
    const on = createMemoryStore();
    on.set(TEST_DEVICE_KEY, true);
    expect(markOnUnlock(on)).toBe(true);
  });
  it('the board switch writes true and false', () => {
    const store = createMemoryStore();
    setTestDevice(store, false);
    expect(store.get(TEST_DEVICE_KEY, null)).toBe(false);
    setTestDevice(store, true);
    expect(testDeviceState(store)).toBe(true);
  });
});

describe('tester pass (ROADMAP 75)', () => {
  it('switching on stores a fetched pass as the game reads it, switching off drops it', async () => {
    const store = createMemoryStore();
    expect(await switchTestDevice(store, true, granted)).toEqual({ ok: true, pass: { pass: PASS, expiresAt: EXPIRES } });
    expect(testDeviceState(store)).toBe(true);
    expect(storedTesterPass(store)).toBe(PASS);
    expect(store.get(TESTER_PASS_KEY, null)).toBe(PASS);
    expect(await switchTestDevice(store, false, never)).toBeNull();
    expect(testDeviceState(store)).toBe(false);
    expect(storedTesterPass(store)).toBeNull();
  });

  it('writes the plain pass as JSON under the game prefix, like the test-device marker', async () => {
    const backend = new Map<string, string>();
    const storage = { getItem: (k: string) => backend.get(k) ?? null, setItem: (k: string, v: string) => void backend.set(k, v) } as Storage;
    await switchTestDevice(createStore(storage), true, granted);
    expect(backend.get(`cannstatt-cruiser:${TEST_DEVICE_KEY}`)).toBe('true');
    expect(backend.get(`cannstatt-cruiser:${TESTER_PASS_KEY}`)).toBe(JSON.stringify(PASS));
  });

  it('refreshes the pass on unlock only on a marked device', async () => {
    const marked = createMemoryStore();
    marked.set(TEST_DEVICE_KEY, true);
    marked.set(TESTER_PASS_KEY, 'tester.v1.1.old');
    expect((await refreshTesterPass(marked, granted))?.ok).toBe(true);
    expect(storedTesterPass(marked)).toBe(PASS);
    const unmarked = createMemoryStore();
    unmarked.set(TEST_DEVICE_KEY, false);
    unmarked.set(TESTER_PASS_KEY, PASS);
    expect(await refreshTesterPass(unmarked, never)).toBeNull();
    expect(storedTesterPass(unmarked)).toBeNull();
  });

  it('keeps an older pass when a new one cannot be fetched', async () => {
    const store = createMemoryStore();
    store.set(TESTER_PASS_KEY, PASS);
    expect(await switchTestDevice(store, true, failing)).toEqual({ ok: false, error: 'server' });
    expect(storedTesterPass(store)).toBe(PASS);
  });

  it('stores no pass that arrives after the switch was turned off again', async () => {
    const store = createMemoryStore();
    let answer: (r: TesterPassResult) => void = () => {};
    const pending = switchTestDevice(store, true, () => new Promise((resolve) => (answer = resolve)));
    await switchTestDevice(store, false, never);
    answer({ ok: true, pass: { pass: PASS, expiresAt: EXPIRES } });
    await pending;
    expect(storedTesterPass(store)).toBeNull();
  });

  it('reads anything but a non-empty string as no pass', () => {
    const store = createMemoryStore();
    for (const value of [null, 5, '', { pass: PASS }]) {
      store.set(TESTER_PASS_KEY, value);
      expect(storedTesterPass(store), JSON.stringify(value)).toBeNull();
    }
  });

  it('describes the outcome under the switch', () => {
    expect(testerPassNote(null)).toBeNull();
    expect(testerPassNote({ ok: true, pass: { pass: PASS, expiresAt: EXPIRES } })).toBe('Feedback ohne Tageslimit bis 10.4.2027');
    expect(testerPassNote({ ok: false, error: 'offline' })).toBe('Testerpass gerade nicht abrufbar, das Feedback-Limit gilt weiter');
  });
});
