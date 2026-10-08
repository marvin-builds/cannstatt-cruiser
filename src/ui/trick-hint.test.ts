import { describe, expect, it } from 'vitest';
import { GROUND_Y, PLAYER_X, VIEW_H } from '../core/config';
import { createStore, type Store } from '../core/storage';
import type { Rect } from '../types';
import { airTrickHintPlate } from './air-trick-hint';
import { hintPlateSize, hintSpotRect, KEY_DOWN, SWIPE_DOWN } from './hint-plate';
import { kickerHintRect } from './kicker-hint';
import { POPUP_MARGIN, popupScale } from './layout';
import { TRICK_HINT_GRINDS, TrickHint, trickHintPlate } from './trick-hint';

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

  describe('plate', () => {
    it('desktop: a ↓ key cap and "= Trick!"; touch landscape: "Wisch runter = Trick!"', () => {
      const desk = trickHintPlate({ touch: false, portrait: false, viewWidth: 320 });
      expect(desk.rows).toEqual([[KEY_DOWN, '= Trick!']]);
      expect(desk.scale).toBe(1);
      expect(trickHintPlate({ touch: true, portrait: false, viewWidth: 384 }).rows).toEqual([['Wisch runter = Trick!']]);
    });

    it('touch portrait (big font): compact "Wisch ↓ = Trick!", no larger than the kicker and air trick hints', () => {
      for (const viewWidth of [320, 390, 427]) {
        const display = { touch: true, portrait: true, viewWidth };
        const p = trickHintPlate(display);
        expect(p.rows).toEqual([['Wisch', SWIPE_DOWN, '= Trick!']]);
        expect(p.scale).toBe(popupScale(display, false));
        const kicker = kickerHintRect(p.scale, viewWidth);
        const air = airTrickHintPlate(display).rect;
        expect(p.rect.w).toBeLessThanOrEqual(Math.min(kicker.w, air.w));
        expect(p.rect.h).toBeLessThanOrEqual(Math.min(kicker.h, air.h));
        expect(p.rect).toEqual(hintSpotRect(hintPlateSize(p.rows, p.scale).w, hintPlateSize(p.rows, p.scale).h, viewWidth));
      }
    });
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
        const r = hintSpotRect(w, h, viewWidth);
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
