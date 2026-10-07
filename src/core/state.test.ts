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

describe('kid mode state', () => {
  it('starts in adult mode', () => {
    expect(createInitialState().kidMode).toBe(false);
  });

  it('keeps the kid mode setting when a new run starts', () => {
    const state = createInitialState();
    state.kidMode = true;
    resetRun(state, 7);
    expect(state.kidMode).toBe(true);
  });
});
