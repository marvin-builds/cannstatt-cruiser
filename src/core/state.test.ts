import { describe, expect, it } from 'vitest';
import { START_ZONE } from './config';
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

describe('carried item state', () => {
  it('starts with empty hands', () => {
    expect(createInitialState().carriedItem).toBeNull();
  });

  it('drops the carried item when a new run starts', () => {
    const state = createInitialState();
    state.carriedItem = 'football';
    resetRun(state, 7);
    expect(state.carriedItem).toBeNull();
  });
});

describe('drunk state', () => {
  it('starts sober', () => {
    expect(createInitialState().drunkTimer).toBe(0);
  });

  it('sobers up when a new run starts', () => {
    const state = createInitialState();
    state.drunkTimer = 4;
    resetRun(state, 7);
    expect(state.drunkTimer).toBe(0);
  });
});

describe('wave 5b contract', () => {
  it('starts a run in the start zone (Bad Cannstatt)', () => {
    expect(START_ZONE).toBe(2);
    const state = createInitialState();
    expect(state.zoneIndex).toBe(START_ZONE);
    state.zoneIndex = 0;
    resetRun(state, 3);
    expect(state.zoneIndex).toBe(START_ZONE);
  });

  it('starts without traffic and without a grind trick', () => {
    const state = createInitialState();
    expect(state.trafficDensity).toBe(0);
    expect(state.player.grindTrick).toBe(false);
  });
});
