import { describe, expect, it } from 'vitest';
import { createInstallState, type InstallState } from '../core/install';
import { createStore, type Store } from '../core/storage';
import {
  CALM_RUN_SECONDS,
  installable,
  InstallOffer,
  MAX_SNOOZES,
  SNOOZE_DAYS,
  SNOOZE_KEY,
  SNOOZE_VISITS,
} from './install-offer';

const DAY = 24 * 60 * 60 * 1000;

function memoryStore(): Store {
  const raw = new Map<string, string>();
  return createStore({ getItem: (k: string) => raw.get(k) ?? null, setItem: (k: string, v: string) => void raw.set(k, v) } as unknown as Storage);
}

const install = (fields: Partial<InstallState> = {}): InstallState => ({ ...createInstallState(), platform: 'android', visits: 1, ...fields });

function offer(store = memoryStore(), state = install()) {
  let now = 1_000 * DAY;
  const o = new InstallOffer(store, () => now);
  o.load(state);
  return { o, store, state, later: (ms: number) => (now += ms) };
}

describe('install offer: where it applies', () => {
  it('only while not installed and not running installed', () => {
    expect(installable(install())).toBe(true);
    expect(installable(install({ standalone: true }))).toBe(false);
    expect(installable(install({ installed: true }))).toBe(false);
  });

  it('the card: touch devices after a calm run (a decent one or a beaten record), Android and iOS always, others only with a kept prompt', () => {
    const { o, state } = offer();
    expect(o.cardShown(state, true)).toBe(false); // no run yet
    o.runEnded({ seconds: CALM_RUN_SECONDS - 1, newRecord: false, previousHighscore: 0 });
    expect(o.cardShown(state, true)).toBe(false); // too short
    o.runEnded({ seconds: CALM_RUN_SECONDS, newRecord: false, previousHighscore: 0 });
    expect(o.cardShown(state, true)).toBe(true);
    expect(o.cardShown(state, false)).toBe(false); // desktop: the settings entry only
    o.runEnded({ seconds: 5, newRecord: true, previousHighscore: 300 });
    expect(o.cardShown(state, true)).toBe(true);
    // The first run always sets a record: that alone is no calm moment.
    o.runEnded({ seconds: 5, newRecord: true, previousHighscore: 0 });
    expect(o.cardShown(state, true)).toBe(false);
    o.runEnded({ seconds: CALM_RUN_SECONDS, newRecord: false, previousHighscore: 0 });
    expect(o.cardShown(install({ platform: 'ios' }), true)).toBe(true);
    expect(o.cardShown(install({ platform: 'other' }), true)).toBe(false);
    expect(o.cardShown(install({ platform: 'other', canPrompt: true }), true)).toBe(true);
    expect(o.cardShown(install({ installed: true }), true)).toBe(false);
    o.runStarted();
    expect(o.cardShown(state, true)).toBe(false);
  });
});

describe('install offer: × snoozes', () => {
  const calm = { seconds: CALM_RUN_SECONDS, newRecord: false, previousHighscore: 0 };

  it(`comes back after ${SNOOZE_DAYS} days`, () => {
    const { o, state, later } = offer();
    o.runEnded(calm);
    o.snooze(state);
    expect(o.cardShown(state, true)).toBe(false);
    later(SNOOZE_DAYS * DAY - 1);
    expect(o.cardShown(state, true)).toBe(false);
    later(1);
    expect(o.cardShown(state, true)).toBe(true);
  });

  it(`comes back after ${SNOOZE_VISITS} more visits (page loads)`, () => {
    const { o, state } = offer();
    o.runEnded(calm);
    o.snooze(state);
    state.visits += SNOOZE_VISITS - 1;
    expect(o.cardShown(state, true)).toBe(false);
    state.visits += 1;
    expect(o.cardShown(state, true)).toBe(true);
  });

  it(`comes back at most ${MAX_SNOOZES} times: the next × hides the card for good (the settings entry stays)`, () => {
    const { o, state, later } = offer();
    o.runEnded(calm);
    for (let i = 0; i < MAX_SNOOZES; i++) {
      o.snooze(state);
      later(SNOOZE_DAYS * DAY);
      expect(o.cardShown(state, true)).toBe(true);
    }
    o.snooze(state);
    later(100 * SNOOZE_DAYS * DAY);
    state.visits += 100;
    expect(o.cardShown(state, true)).toBe(false);
    expect(installable(state)).toBe(true);
  });

  it('is kept across page loads (ui store key), junk storage counts as never snoozed', () => {
    const store = memoryStore();
    const a = offer(store);
    a.o.snooze(a.state);
    const b = offer(store, install({ visits: 2 }));
    b.o.runEnded(calm);
    expect(b.o.cardShown(b.state, true)).toBe(false);
    expect(store.get(SNOOZE_KEY, null)).toMatchObject({ count: 1 });

    store.set(SNOOZE_KEY, 'junk');
    const c = offer(store);
    c.o.runEnded(calm);
    expect(c.o.cardShown(c.state, true)).toBe(true);
  });

  it('migrates the old "never again" (core dismissed): one snooze used, counted from this load', () => {
    const { o, state, store, later } = offer(memoryStore(), install({ dismissed: true, visits: 7 }));
    o.runEnded(calm);
    expect(o.cardShown(state, true)).toBe(false);
    expect(store.get(SNOOZE_KEY, null)).toMatchObject({ count: 1, visits: 7 });
    later(SNOOZE_DAYS * DAY);
    expect(o.cardShown(state, true)).toBe(true);
  });
});

describe('install offer: the button', () => {
  it('shows the kept browser prompt when there is one, else opens the manual steps', () => {
    const { o } = offer();
    const prompts: number[] = [];
    const commands = { promptInstall: () => void prompts.push(1) };
    o.press(install({ canPrompt: true }), commands);
    expect(prompts).toHaveLength(1);
    expect(o.guideOpen).toBe(false);
    // Refused, used up or never offered: the manual steps instead of nothing.
    o.press(install({ canPrompt: false }), commands);
    expect(prompts).toHaveLength(1);
    expect(o.guideOpen).toBe(true);
    o.closeGuide();
    expect(o.guideOpen).toBe(false);
  });
});
