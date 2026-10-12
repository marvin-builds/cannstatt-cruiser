import { describe, expect, it } from 'vitest';
import { ROTATE_ARROW, ROTATE_PHONE, ROTATE_PHONE_ROWS } from './art';
import { rotateButtonPx, rotateScales } from './rotate-sheet';
import { SHEET_STYLE } from './portrait-sheets';

const SIZES = [
  [320, 568],
  [390, 844],
  [820, 1180],
  [1024, 1366],
] as const;

describe('rotate sheet art (ROADMAP 73 polish)', () => {
  it('the arrow is as wide as the phone turns (its square box), so both share one centre line', () => {
    expect(Math.abs(ROTATE_ARROW.width - ROTATE_PHONE.height)).toBeLessThanOrEqual(1);
  });

  it('the phone is symmetric: a 1 px frame all round, every row mirrored, equal bezels above and below the screen', () => {
    const rows = ROTATE_PHONE_ROWS;
    const w = rows[0]!.length;
    for (const row of rows) expect(row.length).toBe(w);
    // Mirrored, except the screen's yellow sun (a picture, not the frame).
    for (const row of rows) {
      const frame = row.slice(0, 2) + row.slice(w - 2);
      expect(frame).toBe([...frame].reverse().join(''));
    }
    expect(rows[0]).toBe(rows[rows.length - 1]);
    expect(new Set(rows.slice(1, -1).map((r) => r[0] + r[w - 1]))).toEqual(new Set(['mm']));
    const screen = rows.map((r, y) => (y > 0 && y < rows.length - 1 && r[2] !== 'w' ? y : -1)).filter((y) => y >= 0);
    expect(screen[0]! - 1).toBe(rows.length - 2 - screen[screen.length - 1]!);
  });

  it.each(SIZES)('at %i x %i the arrow and the turning phone together take at most 40 %% of the height and fit the width', (w, h) => {
    const s = rotateScales(w, h);
    expect((ROTATE_ARROW.height + ROTATE_PHONE.height) * s.phone).toBeLessThanOrEqual(h * 0.4);
    expect(ROTATE_PHONE.height * s.phone).toBeLessThanOrEqual(w * 0.6);
  });

  it('the button keeps the sheet height on phones and grows on tablets', () => {
    expect(rotateButtonPx(568)).toBe(SHEET_STYLE.buttonPx);
    expect(rotateButtonPx(844)).toBe(SHEET_STYLE.buttonPx);
    expect(rotateButtonPx(1180)).toBeGreaterThanOrEqual(72);
    expect(rotateButtonPx(4000)).toBeLessThanOrEqual(96);
  });
});
