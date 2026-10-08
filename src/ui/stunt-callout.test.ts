import { describe, expect, it } from 'vitest';
import { PLAYER_X, VIEW_H } from '../core/config';
import type { Rect } from '../types';
import { itemButtonRect } from './item-button';
import { hudButtons, POPUP_MARGIN, uiMetrics } from './layout';
import { statsLayout } from './stats';
import {
  COMBO_TIME,
  calloutRect,
  calloutScale,
  calloutTop,
  LINE_DONE_TIME,
  placeCallout,
  PUNCH_TIME,
  StuntCallout,
} from './stunt-callout';

const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** The tallest HUD stats plate (chill and drunk rows) with a 9 digit score, the widest it gets. */
const PLATE = statsLayout(9 * 12, true, true).plate;
const CEILING = PLATE.y + PLATE.h + 2;

describe('stunt callout', () => {
  it('shows "Combo xN!" on every stunt step, replacing the last one', () => {
    const c = new StuntCallout();
    expect(c.visible).toBe(false);
    c.step(2);
    expect(c.visible).toBe(true);
    expect(c.lines).toEqual(['Combo x2!']);
    c.update(0.3);
    c.step(3);
    expect(c.lines).toEqual(['Combo x3!']);
    expect(c.multiplier).toBe(3);
  });

  it('a combo fades after COMBO_TIME', () => {
    const c = new StuntCallout();
    c.step(2);
    c.update(COMBO_TIME - 0.01);
    expect(c.visible).toBe(true);
    c.update(0.02);
    expect(c.visible).toBe(false);
  });

  it('punches in: big for PUNCH_TIME after each step, then settles', () => {
    const c = new StuntCallout();
    c.step(2);
    expect(c.punch).toBe(true);
    c.update(PUNCH_TIME + 0.01);
    expect(c.punch).toBe(false);
    c.step(3);
    expect(c.punch).toBe(true);
  });

  it('a completed line shows "Stunt-Linie!" with its points, a bit longer', () => {
    const c = new StuntCallout();
    c.step(2);
    c.end(true, 1250);
    expect(c.lines).toEqual(['Stunt-Linie!', '+1.250']);
    c.update(LINE_DONE_TIME - 0.01);
    expect(c.visible).toBe(true);
    c.update(0.02);
    expect(c.visible).toBe(false);
  });

  it('a completed line without points shows only the title', () => {
    const c = new StuntCallout();
    c.end(true, 0);
    expect(c.lines).toEqual(['Stunt-Linie!']);
  });

  it('a missed line says nothing and clears the combo, so falling off stays quiet', () => {
    const c = new StuntCallout();
    c.step(2);
    c.end(false, 0);
    expect(c.visible).toBe(false);
  });

  it('a line is active from its first step until it ends or a run starts', () => {
    const c = new StuntCallout();
    expect(c.lineActive).toBe(false);
    c.step(1);
    expect(c.lineActive).toBe(true);
    c.update(COMBO_TIME + 1);
    expect(c.lineActive).toBe(true);
    c.end(true, 100);
    expect(c.lineActive).toBe(false);
    c.step(1);
    c.runStarted();
    expect(c.lineActive).toBe(false);
    expect(c.visible).toBe(false);
  });

  it('grows a little with the multiplier, bigger in portrait', () => {
    const landscape = { portrait: false };
    const portrait = { portrait: true };
    expect(calloutScale(landscape, 2)).toBe(2);
    expect(calloutScale(landscape, 5)).toBe(3);
    expect(calloutScale(portrait, 2)).toBe(3);
    expect(calloutScale(portrait, 5)).toBe(4);
    for (const n of [1, 2, 3, 4, 5, 8]) expect(calloutScale(landscape, n + 1)).toBeGreaterThanOrEqual(calloutScale(landscape, n));
  });

  it('a combo takes its size from the multiplier, a completed line the base size', () => {
    const c = new StuntCallout();
    c.step(6);
    expect(c.scale({ portrait: false })).toBe(calloutScale({ portrait: false }, 6));
    c.end(true, 500);
    expect(c.scale({ portrait: true })).toBe(calloutScale({ portrait: true }, 1));
    expect(c.punch).toBe(false);
  });

  it('is placed only while visible and reserves its punched size for the popup column', () => {
    const c = new StuntCallout();
    const display = { portrait: false, viewWidth: 320 };
    expect(placeCallout(c, display, CEILING, false)).toBeNull();
    c.step(2);
    c.update(PUNCH_TIME + 0.01);
    const placed = placeCallout(c, display, CEILING, false)!;
    expect(placed.drawn.y).toBe(CEILING);
    expect(placed.reserved.h).toBeGreaterThan(placed.drawn.h);
    c.end(true, 100);
    const done = placeCallout(c, display, CEILING, true)!;
    expect(done.reserved).toEqual(done.drawn);
  });

  it('sits just below the HUD plate, or below the zone banner while it shows', () => {
    expect(calloutTop(CEILING, false)).toBe(CEILING);
    expect(calloutTop(CEILING, true)).toBeGreaterThanOrEqual(56 + 22);
  });

  describe('layout', () => {
    const displays = [
      { name: 'desktop', touch: false, portrait: false },
      { name: 'phone landscape', touch: true, portrait: false },
      { name: 'phone portrait', touch: true, portrait: true },
    ];
    /** Callouts as the events make them: combos up to x12 and a completed line with big points. */
    const callouts = (): StuntCallout[] => {
      const made = [2, 6, 12].map((n) => {
        const c = new StuntCallout();
        c.step(n);
        return c;
      });
      const done = new StuntCallout();
      done.step(9);
      done.end(true, 12500);
      return [...made, done];
    };
    for (const viewWidth of [320, 384, 427]) {
      for (const d of displays) {
        it(`fits at ${viewWidth} wide (${d.name}), clear of the HUD plate, buttons and the skater`, () => {
          const buttons = hudButtons(viewWidth, true, uiMetrics(d));
          for (const c of callouts()) {
            for (const punch of [false, true]) {
              for (const banner of [false, true]) {
                const r = calloutRect(c.lines, c.scale(d), punch && c.punch, viewWidth, calloutTop(CEILING, banner));
                expect(Number.isInteger(r.x) && Number.isInteger(r.y)).toBe(true);
                expect(r.x).toBeGreaterThanOrEqual(POPUP_MARGIN);
                expect(r.x + r.w).toBeLessThanOrEqual(viewWidth - POPUP_MARGIN);
                expect(r.y + r.h).toBeLessThan(VIEW_H - 40);
                expect(overlaps(r, PLATE)).toBe(false);
                for (const b of [buttons.pause, buttons.mute, buttons.fullscreen!]) expect(overlaps(r, b)).toBe(false);
                if (d.touch) expect(overlaps(r, itemButtonRect(viewWidth, d))).toBe(false);
              }
            }
          }
          // The combo never covers the skater (feet at PLAYER_X, up to ~16 px either side).
          const combo = calloutRect(['Combo x9!'], calloutScale(d, 9), true, viewWidth, CEILING);
          expect(combo.x).toBeGreaterThan(PLAYER_X + 16);
        });
      }
    }

    it('the punch draws bigger than the settled callout when it fits', () => {
      const settled = calloutRect(['Combo x2!'], 2, false, 320, CEILING);
      const punched = calloutRect(['Combo x2!'], 2, true, 320, CEILING);
      expect(punched.w).toBeGreaterThan(settled.w);
      expect(punched.scale).toBe(3);
      expect(settled.scale).toBe(2);
    });
  });
});
