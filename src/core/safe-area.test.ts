import { describe, expect, it } from 'vitest';
import { computeLayout, type ViewBounds } from './scaling';
import { insetsInView, NO_INSETS, safeAreaCss } from './safe-area';

const BOUNDS: ViewBounds = { minWidth: 320, maxWidth: 427, height: 180 };
const sides = (left: number, right: number, top = 0, bottom = 0) => ({ top, right, bottom, left });

describe('insetsInView', () => {
  it('is zero without insets (desktop)', () => {
    const l = computeLayout(1280, 720, 1, BOUNDS);
    expect(insetsInView(NO_INSETS, l, 1280, 720)).toEqual(NO_INSETS);
  });

  it('converts CSS px to view px on a phone in landscape (2 CSS px per view px)', () => {
    const l = computeLayout(844, 390, 3, BOUNDS);
    expect(insetsInView(sides(40, 40), l, 844, 390)).toEqual(sides(20, 20));
  });

  it('rounds a partial view pixel up, so nothing is left under the cutout', () => {
    const l = computeLayout(844, 390, 3, BOUNDS);
    expect(insetsInView(sides(41, 3), l, 844, 390)).toEqual(sides(21, 2));
  });

  it('subtracts the letterbox margin beside the canvas, which the cutout covers first', () => {
    // 21:9 cap: the view is 427 wide (854 CSS px) with 23 CSS px of letterbox on each side.
    const l = computeLayout(900, 390, 3, BOUNDS);
    expect(l.offsetX).toBe(23);
    expect(insetsInView(sides(40, 20), l, 900, 390)).toEqual(sides(9, 0));
  });

  it('is zero at the top in portrait, where the 180 px strip sits far below the cutout', () => {
    const l = computeLayout(390, 844, 3, BOUNDS);
    expect(insetsInView(sides(0, 0, 47, 34), l, 390, 844)).toEqual(NO_INSETS);
  });

  it('gives whole, non-negative view pixels', () => {
    const l = computeLayout(1512, 982, 2, BOUNDS);
    const v = insetsInView(sides(13.5, 7.25, 0.4, 0), l, 1512, 982);
    for (const n of Object.values(v)) {
      expect(Number.isInteger(n)).toBe(true);
      expect(n).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('safeAreaCss', () => {
  it('reads the playtest override before the browser inset', () => {
    expect(safeAreaCss('left')).toBe('var(--cc-safe-left, env(safe-area-inset-left, 0px))');
  });
});
