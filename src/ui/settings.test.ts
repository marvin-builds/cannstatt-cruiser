import { describe, expect, it } from 'vitest';
import { TICK_DT } from '../core/config';
import { createInitialState } from '../core/state';
import { createStore } from '../core/storage';
import {
  LONG_PRESS_HINT_DELAY,
  LONG_PRESS_TIME,
  loadKidMode,
  LongPress,
  saveKidMode,
  SettingsMenu,
} from './settings';

function memoryStore() {
  const raw = new Map<string, string>();
  return createStore({
    getItem: (k: string) => raw.get(k) ?? null,
    setItem: (k: string, v: string) => void raw.set(k, v),
  } as unknown as Storage);
}

const ticks = (press: LongPress, n: number) => {
  let fired = false;
  for (let i = 0; i < n; i++) fired = press.update(TICK_DT) || fired;
  return fired;
};

describe('LongPress', () => {
  it('fires once after LONG_PRESS_TIME (3 s) of holding', () => {
    expect(LONG_PRESS_TIME).toBe(3);
    const press = new LongPress();
    press.start('pointer');
    expect(ticks(press, 179)).toBe(false);
    expect(ticks(press, 1)).toBe(true);
    expect(ticks(press, 60)).toBe(false);
    expect(press.end('pointer')).toBe(false); // not a short press any more
  });

  it('a shorter hold does not fire and its release counts as a short press', () => {
    const press = new LongPress();
    press.start('pointer');
    expect(ticks(press, 170)).toBe(false);
    expect(press.end('pointer')).toBe(true);
    expect(ticks(press, 60)).toBe(false);
  });

  it('shows progress only after the hint delay, so a normal tap gives nothing away', () => {
    const press = new LongPress();
    press.start('key');
    ticks(press, Math.round(LONG_PRESS_HINT_DELAY * 60) - 1);
    expect(press.progress).toBe(0);
    ticks(press, 61);
    expect(press.progress).toBeGreaterThan(0.45);
    expect(press.progress).toBeLessThan(0.55);
  });

  it('starts over with every new press and keeps going while any source holds', () => {
    const press = new LongPress();
    press.start('pointer');
    ticks(press, 100);
    press.start('key');
    expect(press.end('pointer')).toBe(false);
    ticks(press, 80);
    expect(press.progress).toBe(1);
    press.end('key');
    press.start('key');
    expect(ticks(press, 100)).toBe(false);
  });
});

describe('kid mode persistence', () => {
  it('saves and loads the flag, defaulting to kid mode (ROADMAP 39)', () => {
    const store = memoryStore();
    expect(loadKidMode(store)).toBe(true);
    saveKidMode(store, false);
    expect(loadKidMode(store)).toBe(false);
    saveKidMode(store, true);
    expect(loadKidMode(store)).toBe(true);
    saveKidMode(store, false);
    expect(loadKidMode(store)).toBe(false);
  });

  it('falls back to kid mode when storage is unavailable or holds junk: only a stored false is adult mode', () => {
    expect(loadKidMode(createStore(null))).toBe(true);
    const broken = createStore({
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
    } as unknown as Storage);
    expect(() => saveKidMode(broken, true)).not.toThrow();
    expect(loadKidMode(broken)).toBe(true);
    const junk = memoryStore();
    junk.set('kidMode', 'no');
    expect(loadKidMode(junk)).toBe(true);
  });
});

describe('SettingsMenu', () => {
  function setup(kidMode = false) {
    const store = memoryStore();
    const state = createInitialState();
    state.kidMode = kidMode;
    const closed: boolean[] = [];
    const menu = new SettingsMenu(store, (switched) => closed.push(switched));
    menu.openMenu(state.kidMode);
    return { store, state, menu, closed };
  }

  it('tells on close whether kid mode was switched since it opened (a run restarts then)', () => {
    const on = setup(false);
    on.menu.toggle(on.state);
    expect(on.menu.switched).toBe(true);
    on.menu.close();
    expect(on.closed).toEqual([true]);

    const unchanged = setup(false);
    unchanged.menu.close();
    expect(unchanged.closed).toEqual([false]);
  });

  it('switching on and back off counts as no switch', () => {
    const { state, menu, closed } = setup(false);
    menu.toggle(state);
    menu.toggle(state);
    expect(state.kidMode).toBe(false);
    expect(menu.switched).toBe(false);
    menu.close();
    expect(closed).toEqual([false]);
  });

  it('turns kid mode on at once and persists it', () => {
    const { store, state, menu } = setup(false);
    menu.toggle(state);
    expect(state.kidMode).toBe(true);
    expect(loadKidMode(store)).toBe(true);
    expect(menu.screen).toBe('menu');
  });

  it('turns kid mode off at once too, without a question, and persists it', () => {
    const { store, state, menu, closed } = setup(true);
    saveKidMode(store, true);
    menu.toggle(state);
    expect(state.kidMode).toBe(false);
    expect(loadKidMode(store)).toBe(false);
    expect(menu.screen).toBe('menu');
    expect(menu.switched).toBe(true);
    menu.close();
    expect(closed).toEqual([true]);
  });

  it('toggling does nothing while the menu is closed', () => {
    const { state, menu } = setup(true);
    menu.close();
    menu.toggle(state);
    expect(state.kidMode).toBe(true);
  });

  it('Zurück closes the menu', () => {
    const { state, menu } = setup(true);
    menu.close();
    expect(menu.screen).toBe('closed');
    expect(state.kidMode).toBe(true);
  });
});
