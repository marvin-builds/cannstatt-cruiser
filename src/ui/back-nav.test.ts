import { describe, expect, it } from 'vitest';
import { BackNav, backStep } from './back-nav';
import { fakeHistory } from './back-nav.fake';

describe('back navigation stack (ROADMAP 75)', () => {
  it('keeps exactly one entry while something is open and hands each back press to the game', () => {
    const h = fakeHistory();
    const backs: number[] = [];
    const nav = new BackNav(h.env, () => backs.push(1));
    nav.update(false);
    expect(h.pushes).toBe(0);
    nav.update(true);
    nav.update(true);
    expect([h.pushes, h.extra]).toEqual([1, 1]);
    h.pressBack();
    expect(backs).toHaveLength(1);
    expect(h.extra).toBe(0);
    // Still something open: one entry again, never more.
    nav.update(true);
    nav.update(true);
    expect([h.pushes, h.extra]).toEqual([2, 1]);
    h.pressBack();
    nav.update(false);
    expect(h.extra).toBe(0);
    expect(h.left).toBe(false);
    // On the title back is not intercepted.
    h.pressBack();
    expect(h.left).toBe(true);
    expect(backs).toHaveLength(2);
  });

  it('closing by the ui removes its entry with history.back, whose popstate is not a back press', () => {
    const h = fakeHistory();
    let backs = 0;
    const nav = new BackNav(h.env, () => backs++);
    nav.update(true);
    nav.update(false);
    expect(h.backs).toBe(1);
    // Opened again before the pop arrived: no push until it did.
    nav.update(true);
    expect(h.pushes).toBe(1);
    h.settle();
    expect(backs).toBe(0);
    expect(h.extra).toBe(0);
    nav.update(true);
    expect([h.pushes, h.extra]).toEqual([2, 1]);
  });

  it('a reload on its own entry reuses it instead of stacking another', () => {
    const h = fakeHistory(true);
    let backs = 0;
    const nav = new BackNav(h.env, () => backs++);
    nav.update(true);
    expect([h.pushes, h.extra]).toEqual([0, 1]);
    nav.update(false);
    h.settle();
    expect([h.extra, backs]).toEqual([0, 0]);
  });
});

describe('where back goes (ROADMAP 75)', () => {
  const base = { mode: 'title', whatsNew: false, installGuide: false, settings: false, feedback: false, scores: null } as const;

  it('one level back in menus and dialogs, pause during a run, nothing on the title', () => {
    expect(backStep(base)).toBeNull();
    expect(backStep({ ...base, mode: 'playing' })).toBe('pause');
    expect(backStep({ ...base, mode: 'paused' })).toBe('stay');
    expect(backStep({ ...base, mode: 'gameover' })).toBe('title');
    expect(backStep({ ...base, whatsNew: true })).toBe('whatsNew');
    expect(backStep({ ...base, feedback: true })).toBe('feedback');
    expect(backStep({ ...base, scores: 'list' })).toBe('scores');
    expect(backStep({ ...base, mode: 'gameover', scores: 'entry' })).toBe('scores');
    expect(backStep({ ...base, settings: true })).toBe('settings');
    expect(backStep({ ...base, mode: 'paused', feedback: true })).toBe('feedback');
    // The top-most screen first: install steps over the settings, settings over the rest.
    expect(backStep({ ...base, settings: true, installGuide: true })).toBe('installGuide');
    expect(backStep({ ...base, settings: true, feedback: true })).toBe('settings');
  });
});
