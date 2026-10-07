import { describe, expect, it } from 'vitest';
import { createInitialState, resetRun } from './state';

describe('chill effect state', () => {
  it('starts without an active chill effect', () => {
    expect(createInitialState().chillTimer).toBe(0);
  });

  it('clears the chill effect when a new run starts', () => {
    const state = createInitialState();
    state.chillTimer = 3;
    resetRun(state, 7);
    expect(state.chillTimer).toBe(0);
  });
});
