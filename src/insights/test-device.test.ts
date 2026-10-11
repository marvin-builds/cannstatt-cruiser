import { describe, expect, it } from 'vitest';
import { createMemoryStore } from '../core/storage';
import { TEST_DEVICE_KEY } from '../net/telemetry-types';
import { markOnUnlock, setTestDevice, testDeviceState } from './test-device';

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
