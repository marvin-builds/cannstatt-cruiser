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

  it('starts without traffic, grind trick or air trick', () => {
    const state = createInitialState();
    expect(state.trafficDensity).toBe(0);
    expect(state.player.grindTrick).toBe(false);
    expect(state.player.airTrick).toBe(false);
  });
});

describe('update-ready state', () => {
  it('starts without a pending update', () => {
    expect(createInitialState().updateReady).toBe(false);
  });

  it('keeps a pending update when a new run starts', () => {
    const state = createInitialState();
    state.updateReady = true;
    resetRun(state, 7);
    expect(state.updateReady).toBe(true);
  });
});

describe('changelog and install state', () => {
  it('starts with nothing new and a plain, uninstalled browser', () => {
    const state = createInitialState();
    expect(state.whatsNew).toEqual([]);
    expect(state.install).toEqual({
      standalone: false,
      platform: 'other',
      canPrompt: false,
      installed: false,
      visits: 0,
      dismissed: false,
    });
  });

  it('keeps whatsNew and install when a new run starts', () => {
    const state = createInitialState();
    const whatsNew = [{ version: '2026-10-08.1', date: '2026-10-08', items: ['x'] }];
    state.whatsNew = whatsNew;
    state.install.canPrompt = true;
    const install = state.install;
    resetRun(state, 7);
    expect(state.whatsNew).toBe(whatsNew);
    expect(state.install).toBe(install);
  });
});
