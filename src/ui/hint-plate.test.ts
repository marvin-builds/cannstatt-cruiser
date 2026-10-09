import { describe, expect, it } from 'vitest';
import { GROUND_Y, PLAYER_X, VIEW_H } from '../core/config';
import { measureText } from '../core/font';
import type { Rect } from '../types';
import {
  fitHintRows,
  type HintRow,
  hintPlateRect,
  hintPlateSize,
  hintRowWidth,
  hintSpotRect,
  KEY_DOWN,
  KEY_E,
  KEYCAP_W,
  shownHint,
  SWIPE_DOWN,
  SWIPE_DOWN_W,
} from './hint-plate';
import { POPUP_MARGIN } from './layout';

const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

describe('hint plate', () => {
  it('a row is its texts side by side, a key cap counts as one piece', () => {
    expect(hintRowWidth(['Hallo'], 1)).toBe(measureText('Hallo', 1));
    expect(hintRowWidth(['Hallo'], 2)).toBe(measureText('Hallo', 2));
    expect(hintRowWidth(['In der Luft', KEY_DOWN, '= Trick!'], 1)).toBe(
      measureText('In der Luft', 1) + KEYCAP_W + measureText('= Trick!', 1) + 2 * 3,
    );
  });

  it('an E key cap is one key cap, a swipe arrow scales with the font', () => {
    expect(hintRowWidth([KEY_E, '= High Five!'], 2)).toBe(KEYCAP_W + 3 + measureText('= High Five!', 2));
    expect(hintRowWidth([SWIPE_DOWN, 'wischen = Trick!'], 2)).toBe(
      SWIPE_DOWN_W * 2 + measureText('wischen = Trick!', 2) + 3,
    );
  });

  it('a plate is its widest row plus padding, its rows stacked', () => {
    const one = hintPlateSize([['Hallo']], 1);
    const two = hintPlateSize([['Hallo'], ['Welt, hallo']], 1);
    expect(one.w).toBe(measureText('Hallo', 1) + 8);
    expect(two.w).toBe(measureText('Welt, hallo', 1) + 8);
    expect(two.h).toBeGreaterThan(one.h + 8);
    expect(hintPlateSize([['Hallo']], 2).h).toBe(2 * 8 + 6);
    // A key cap (10 px) makes a scale 1 row taller than the 8 px glyphs.
    expect(hintPlateSize([[KEY_DOWN, '= Trick!']], 1).h).toBe(10 + 6);
  });

  it('sits at the hint spot under the skater', () => {
    const rows: HintRow[] = [['Auf der Rampe tippen!']];
    const size = hintPlateSize(rows, 1);
    expect(hintPlateRect(rows, 1, 320)).toEqual(hintSpotRect(size.w, size.h, 320));
  });

  it('fitHintRows picks the first variant that fits under the riding line and in the view', () => {
    const long: HintRow[] = [['In der Luft'], ['runterwischen = Trick!']];
    const short: HintRow[] = [['Runterwischen = Trick!']];
    expect(fitHintRows([long, short], 1, 320)).toBe(long);
    // Two scale-2 rows are taller than the street below the riding line.
    expect(fitHintRows([long, short], 2, 320)).toBe(short);
    // Nothing fits: the last (shortest) variant.
    expect(fitHintRows([long, short], 4, 320)).toBe(short);
  });

  for (const viewWidth of [320, 384, 427]) {
    for (const scale of [1, 2]) {
      it(`fitted plates at scale ${scale}, ${viewWidth} wide: on screen, under the riding line, clear of the skater`, () => {
        const variants: HintRow[][] = [[['In der Luft'], ['runterwischen = Trick!']], [['Runterwischen = Trick!']]];
        const r = hintPlateRect(fitHintRows(variants, scale, viewWidth), scale, viewWidth);
        expect(r.y).toBeGreaterThan(GROUND_Y);
        expect(r.y + r.h).toBeLessThanOrEqual(VIEW_H);
        expect(r.x).toBeGreaterThanOrEqual(POPUP_MARGIN);
        expect(r.x + r.w).toBeLessThanOrEqual(viewWidth - POPUP_MARGIN);
        for (const feet of [GROUND_Y, GROUND_Y - 40, GROUND_Y - 80]) {
          expect(overlaps(r, { x: PLAYER_X - 12, y: feet - 32, w: 24, h: 32 })).toBe(false);
        }
      });
    }
  }
});

describe('shownHint: one hint plate at a time at the hint spot', () => {
  it('nothing when no hint wants to show', () => {
    expect(shownHint({ highFive: false, trick: false, air: false, kicker: false })).toBeNull();
  });

  it('each alone shows', () => {
    expect(shownHint({ highFive: false, trick: true, air: false, kicker: false })).toBe('trick');
    expect(shownHint({ highFive: false, trick: false, air: true, kicker: false })).toBe('air');
    expect(shownHint({ highFive: false, trick: false, air: false, kicker: true })).toBe('kicker');
  });

  it('the air trick hint wins over the kicker hint (never both), the grind trick hint over both', () => {
    expect(shownHint({ highFive: false, trick: false, air: true, kicker: true })).toBe('air');
    expect(shownHint({ highFive: false, trick: true, air: true, kicker: true })).toBe('trick');
    expect(shownHint({ highFive: false, trick: true, air: false, kicker: true })).toBe('trick');
  });

  it('the one-time high five hint (keyboard) wins over all: its window is short', () => {
    expect(shownHint({ highFive: true, trick: false, air: false, kicker: false })).toBe('highFive');
    expect(shownHint({ highFive: true, trick: true, air: true, kicker: true })).toBe('highFive');
  });
});
