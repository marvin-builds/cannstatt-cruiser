import { describe, expect, it } from 'vitest';
import { BD, BOARD_ANCHOR_X, BOARD_DECK_ROW, BOARD_FRAMES, BOARD_H } from './art';

const WHEEL = /[oO]/;
/** Columns of `frame` holding any pixel. */
const span = (frame: string[]) => {
  const cols = frame.flatMap((row) => [...row].flatMap((c, x) => (c === '.' ? [] : [x])));
  return { min: Math.min(...cols), max: Math.max(...cols) };
};
const wheelCols = (frame: string[]) => frame.flatMap((row) => [...row].flatMap((c, x) => (WHEEL.test(c) ? [x] : [])));

describe('boardslide board frames', () => {
  const flat = BOARD_FRAMES[BD.flat]!;
  const endOn = BOARD_FRAMES[BD.endOn]!;
  const halfTurn = BOARD_FRAMES[BD.halfTurn]!;

  it('keep the frame size, the grip tape row under the feet and the wheel bottom on the rail line', () => {
    for (const frame of [endOn, halfTurn]) {
      expect(frame).toHaveLength(BOARD_H);
      expect(frame[BOARD_DECK_ROW]).toContain('g');
      expect(frame[BOARD_H - 1]).toMatch(WHEEL);
      // Nothing above the deck but a kicktail lip.
      for (const row of frame.slice(0, BOARD_DECK_ROW - 1)) expect(row).toMatch(/^\.+$/);
    }
  });

  it('end-on: short and wide, centred on the anchor, wheels at both sides of the deck', () => {
    const { min, max } = span(endOn);
    expect(max - min).toBeLessThan(span(flat).max - span(flat).min);
    expect(BOARD_ANCHOR_X - min).toBe(max - BOARD_ANCHOR_X);
    const deck = span([endOn[BOARD_DECK_ROW]!]);
    const wheels = wheelCols(endOn);
    expect(Math.min(...wheels)).toBeLessThan(deck.min + 2);
    expect(Math.max(...wheels)).toBeGreaterThan(deck.max - 2);
    // Seen from the nose: the rows mirror each other.
    for (const row of endOn) expect(row.slice(min, max + 1).replace(/O/g, 'o')).toBe([...row.slice(min, max + 1)].reverse().join('').replace(/O/g, 'o'));
  });

  it('half-turned: foreshortened between the side view and the end-on view', () => {
    const width = (f: string[]) => span(f).max - span(f).min;
    expect(width(halfTurn)).toBeLessThan(width(flat));
    expect(width(halfTurn)).toBeGreaterThan(width(endOn) - 1);
    expect(halfTurn.join('')).not.toBe(flat.join(''));
  });
});
