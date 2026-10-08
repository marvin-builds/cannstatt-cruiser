import { describe, expect, it } from 'vitest';
import { createInitialState } from './state';
import { handleServiceWorkerMessage, UPDATE_READY_MESSAGE } from './update';

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
