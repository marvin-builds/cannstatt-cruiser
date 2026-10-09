import { describe, expect, it } from 'vitest';
import { createMemoryStore } from '../core/storage';
import { DEVICE_KEY, loadDeviceId, randomDeviceId } from './device';

describe('device id', () => {
  it('is created once and then kept in the store', () => {
    const store = createMemoryStore();
    let made = 0;
    const make = () => `device-${++made}-abcdef`;
    const first = loadDeviceId(store, make);
    expect(first).toBe('device-1-abcdef');
    expect(store.get(DEVICE_KEY, '')).toBe(first);
    expect(loadDeviceId(store, make)).toBe(first);
    expect(made).toBe(1);
  });

  it('replaces a stored id the server would refuse', () => {
    const store = createMemoryStore();
    store.set(DEVICE_KEY, 'bad id!');
    expect(loadDeviceId(store, () => 'fresh-id-123')).toBe('fresh-id-123');
    store.set(DEVICE_KEY, 42);
    expect(loadDeviceId(store, () => 'other-id-456')).toBe('other-id-456');
  });

  it('random ids fit the server rule (8-64 of A-Z a-z 0-9 -)', () => {
    for (let i = 0; i < 20; i++) expect(randomDeviceId()).toMatch(/^[A-Za-z0-9-]{8,64}$/);
    expect(randomDeviceId()).not.toBe(randomDeviceId());
  });
});
