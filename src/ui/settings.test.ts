import { describe, expect, it } from 'vitest';
import { TICK_DT } from '../core/config';
import { createInitialState } from '../core/state';
import { createStore } from '../core/storage';
import {
  LONG_PRESS_HINT_DELAY,
  LONG_PRESS_TIME,
  loadKidMode,
  LongPress,
  parentQuestion,
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

describe('parent check question', () => {
  it('multiplies two factors from 6 to 9 and offers the product among three distinct answers', () => {
    for (let seed = 0; seed < 200; seed++) {
      const q = parentQuestion(seed);
      expect(q.a).toBeGreaterThanOrEqual(6);
      expect(q.a).toBeLessThanOrEqual(9);
      expect(q.b).toBeGreaterThanOrEqual(6);
      expect(q.b).toBeLessThanOrEqual(9);
      expect(q.answers).toHaveLength(3);
      expect(new Set(q.answers).size).toBe(3);
      expect(q.answers[q.correct]).toBe(q.a * q.b);
      for (const n of q.answers) expect(n).toBeGreaterThan(0);
    }
  });

  it('is deterministic per seed and varies between seeds', () => {
    expect(parentQuestion(7)).toEqual(parentQuestion(7));
    const texts = new Set(Array.from({ length: 30 }, (_, s) => JSON.stringify(parentQuestion(s))));
    expect(texts.size).toBeGreaterThan(5);
  });
});

describe('kid mode persistence', () => {
  it('saves and loads the flag, defaulting to adult mode', () => {
    const store = memoryStore();
    expect(loadKidMode(store)).toBe(false);
    saveKidMode(store, true);
    expect(loadKidMode(store)).toBe(true);
    saveKidMode(store, false);
    expect(loadKidMode(store)).toBe(false);
  });

  it('falls back to adult mode when storage is unavailable or holds junk', () => {
    expect(loadKidMode(createStore(null))).toBe(false);
    const broken = createStore({
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
    } as unknown as Storage);
    expect(() => saveKidMode(broken, true)).not.toThrow();
    expect(loadKidMode(broken)).toBe(false);
    const junk = memoryStore();
    junk.set('kidMode', 'yes');
    expect(loadKidMode(junk)).toBe(false);
  });
});

describe('SettingsMenu', () => {
  function setup(kidMode = false) {
    const store = memoryStore();
    const state = createInitialState();
    state.kidMode = kidMode;
    const menu = new SettingsMenu(store);
    menu.show();
    return { store, state, menu };
  }

  it('turns kid mode on at once and persists it', () => {
    const { store, state, menu } = setup(false);
    menu.toggle(state, 1);
    expect(state.kidMode).toBe(true);
    expect(loadKidMode(store)).toBe(true);
    expect(menu.screen).toBe('menu');
  });

  it('turning it off asks the parent check; the right answer turns it off', () => {
    const { store, state, menu } = setup(true);
    saveKidMode(store, true);
    menu.toggle(state, 42);
    expect(menu.screen).toBe('check');
    expect(state.kidMode).toBe(true);
    const q = menu.question!;
    expect(q).toEqual(parentQuestion(42));
    menu.answer(state, q.correct);
    expect(state.kidMode).toBe(false);
    expect(loadKidMode(store)).toBe(false);
    expect(menu.screen).toBe('menu');
  });

  it('a wrong answer closes the menu and keeps kid mode on', () => {
    const { store, state, menu } = setup(true);
    saveKidMode(store, true);
    menu.toggle(state, 3);
    const wrong = (menu.question!.correct + 1) % 3;
    menu.answer(state, wrong);
    expect(state.kidMode).toBe(true);
    expect(loadKidMode(store)).toBe(true);
    expect(menu.screen).toBe('closed');
  });

  it('Zurück goes from the check back to the menu and from the menu out', () => {
    const { state, menu } = setup(true);
    menu.toggle(state, 3);
    menu.back();
    expect(menu.screen).toBe('menu');
    expect(state.kidMode).toBe(true);
    menu.back();
    expect(menu.screen).toBe('closed');
  });
});
