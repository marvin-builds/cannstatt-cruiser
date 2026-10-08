import { describe, expect, it } from 'vitest';
import { createInitialState } from './state';
import {
  CHECK_FOR_UPDATE_MESSAGE,
  handleServiceWorkerMessage,
  shouldCheckForUpdate,
  UPDATE_CHECK_INTERVAL_MS,
  UPDATE_READY_MESSAGE,
} from './update';

describe('service worker messages', () => {
  it('flags a pending update on the updateReady message', () => {
    const state = createInitialState();
    handleServiceWorkerMessage(state, { type: 'updateReady' });
    expect(state.updateReady).toBe(true);
  });

  it('matches the message sw.js posts', () => {
    expect(UPDATE_READY_MESSAGE).toEqual({ type: 'updateReady' });
  });

  it.each([null, undefined, 'updateReady', 42, {}, { type: 'other' }, { kind: 'updateReady' }])(
    'ignores the unrelated message %j',
    (data) => {
      const state = createInitialState();
      handleServiceWorkerMessage(state, data);
      expect(state.updateReady).toBe(false);
    },
  );

  it('never clears a pending update', () => {
    const state = createInitialState();
    state.updateReady = true;
    handleServiceWorkerMessage(state, { type: 'other' });
    expect(state.updateReady).toBe(true);
  });
});

describe('update checks while the app stays open', () => {
  it('asks the worker with the message sw.js listens for', () => {
    expect(CHECK_FOR_UPDATE_MESSAGE).toEqual({ type: 'checkForUpdate' });
  });

  it('checks every few minutes', () => {
    expect(UPDATE_CHECK_INTERVAL_MS).toBeGreaterThanOrEqual(2 * 60_000);
    expect(UPDATE_CHECK_INTERVAL_MS).toBeLessThanOrEqual(10 * 60_000);
  });

  it('checks when the interval has passed since the last check', () => {
    expect(shouldCheckForUpdate(0, UPDATE_CHECK_INTERVAL_MS, false)).toBe(true);
    expect(shouldCheckForUpdate(0, UPDATE_CHECK_INTERVAL_MS - 1, false)).toBe(false);
  });

  it('checks on coming back to the foreground, but not twice within a few seconds', () => {
    expect(shouldCheckForUpdate(0, 30_000, true)).toBe(true);
    expect(shouldCheckForUpdate(0, 1_000, true)).toBe(false);
  });
});
