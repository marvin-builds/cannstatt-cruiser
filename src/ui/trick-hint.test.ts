import { describe, expect, it } from 'vitest';
import { GROUND_Y, PLAYER_X, VIEW_H } from '../core/config';
import { createStore, type Store } from '../core/storage';
import type { Rect } from '../types';
import { POPUP_MARGIN } from './layout';
import { TRICK_HINT_GRINDS, TrickHint, trickHintLabel, trickHintRect } from './trick-hint';

function memoryStore(): Store {
  const raw = new Map<string, string>();
  return createStore({
    getItem: (k: string) => raw.get(k) ?? null,
    setItem: (k: string, v: string) => void raw.set(k, v),
  } as unknown as Storage);
}

/** One grind of `ticks` updates, then one update off the rail. */
function grind(hint: TrickHint, ticks = 3, tricking = false): boolean[] {
  const seen: boolean[] = [];
  for (let i = 0; i < ticks; i++) {
    hint.update(true, tricking);
    seen.push(hint.visible);
  }
  hint.update(false, false);
  seen.push(hint.visible);
  return seen;
}

const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

describe('grind trick hint', () => {
  it('shows while grinding and hides when the grind ends', () => {
    const hint = new TrickHint(memoryStore());
    expect(hint.visible).toBe(false);
    hint.update(false, false);
    expect(hint.visible).toBe(false);
    expect(grind(hint)).toEqual([true, true, true, false]);
  });

  it('shows on the first few grinds of a run only, and again in the next run', () => {
    const hint = new TrickHint(memoryStore());
    hint.runStarted();
    for (let i = 0; i < TRICK_HINT_GRINDS; i++) expect(grind(hint)[0]).toBe(true);
    expect(grind(hint)[0]).toBe(false);
    hint.runStarted();
    expect(grind(hint)[0]).toBe(true);
  });

  it('hides while the trick is held', () => {
    const hint = new TrickHint(memoryStore());
    hint.update(true, false);
    expect(hint.visible).toBe(true);
    hint.update(true, true);
    expect(hint.visible).toBe(false);
  });

  it('never shows again once a trick was done, also after a reload', () => {
    const store = memoryStore();
    const hint = new TrickHint(store);
    hint.update(true, false);
    hint.trickDone();
    expect(hint.visible).toBe(false);
    hint.update(false, false);
    hint.runStarted();
    expect(grind(hint)).toEqual([false, false, false, false]);
    const reloaded = new TrickHint(store);
    reloaded.runStarted();
    expect(grind(reloaded)).toEqual([false, false, false, false]);
  });

  it('a new run hides a hint still showing', () => {
    const hint = new TrickHint(memoryStore());
    hint.update(true, false);
    hint.runStarted();
    expect(hint.visible).toBe(false);
  });

  it('labels: key cap text on desktop, swipe on touch', () => {
    expect(trickHintLabel(false)).toBe('= Trick!');
    expect(trickHintLabel(true)).toBe('Wisch runter = Trick!');
  });

  describe('placement', () => {
    // The skater (about 30 px tall, feet at PLAYER_X) on a rail; the zone banner ribbon at the top.
    const skater = (feetY: number): Rect => ({ x: PLAYER_X - 12, y: feetY - 32, w: 24, h: 32 });
    const banner: Rect = { x: 0, y: 56, w: 427, h: 22 };

    for (const [w, h, viewWidth] of [
      [60, 14, 320],
      [100, 14, 427],
      [180, 22, 320],
    ] as const) {
      it(`${w}x${h} in a ${viewWidth} wide view: under the riding line, on screen, clear of skater and banner`, () => {
        const r = trickHintRect(w, h, viewWidth);
        expect(r.y).toBeGreaterThan(GROUND_Y);
        expect(r.y + r.h).toBeLessThanOrEqual(VIEW_H);
        expect(r.x).toBeGreaterThanOrEqual(POPUP_MARGIN);
        expect(r.x + r.w).toBeLessThanOrEqual(viewWidth - POPUP_MARGIN);
        expect(r.x).toBeLessThan(PLAYER_X);
        expect(r.x + r.w).toBeGreaterThan(PLAYER_X);
        for (const feet of [GROUND_Y, GROUND_Y - 12, GROUND_Y - 30]) expect(overlaps(r, skater(feet))).toBe(false);
        expect(overlaps(r, banner)).toBe(false);
      });
    }
  });
});
