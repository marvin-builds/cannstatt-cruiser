import { describe, expect, it } from 'vitest';
import { FONT_BASELINE, FONT_LINE_HEIGHT, glyphFor, measureText } from './font-data';

describe('pixel font', () => {
  it('has glyphs for German letters, digits and punctuation', () => {
    const required = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyzÄÖÜäöüß0123456789.,:;!?-+/()\'"%*=<>#&_ ';
    for (const ch of required) expect(glyphFor(ch), ch).not.toBeNull();
  });

  it('has a real multiplication sign, centred like the digits and unlike the letter x', () => {
    const times = glyphFor('×')!;
    expect(times.rows).not.toEqual(glyphFor('x')!.rows);
    expect(times.rows[3]).toMatch(/#/);
    expect(times.rows[5]).not.toMatch(/#/);
  });

  it('sits the full stop on the baseline like the digits, so 61.234 never reads as a comma', () => {
    const rowOf = (ch: string) => Math.max(...glyphFor(ch)!.rows.map((r, i) => (r.includes('#') ? i : -1)));
    expect(rowOf('.')).toBe(FONT_BASELINE);
    expect(rowOf('1')).toBe(FONT_BASELINE);
    expect(rowOf(',')).toBeGreaterThan(FONT_BASELINE);
  });

  it('draws e with a hole in its bowl above the bar, so it never reads as an epsilon or "="', () => {
    const rows = glyphFor('e')!.rows;
    expect(rows[3]).toMatch(/^#\.+#/); // first row below the x-height top: left side, counter, right side
    expect(rows[4]).toMatch(/^##/); // the bar leaves the left side
  });

  it('draws umlauts as their base letter plus dots above', () => {
    const a = glyphFor('a')!;
    const ae = glyphFor('ä')!;
    expect(ae.width).toBe(a.width);
    const dotRows = ae.rows.filter((row, i) => row !== a.rows[i]);
    expect(dotRows.length).toBeGreaterThan(0);
  });

  it('measures text as glyph widths plus one pixel spacing', () => {
    const w = glyphFor('A')!.width + 1 + glyphFor('B')!.width;
    expect(measureText('AB')).toBe(w);
    expect(measureText('')).toBe(0);
  });

  it('scales measurement and keeps rows at line height', () => {
    expect(measureText('AB', 2)).toBe(measureText('AB') * 2);
    expect(glyphFor('A')!.rows.length).toBe(FONT_LINE_HEIGHT);
  });

  it('falls back to "?" for unknown characters', () => {
    expect(glyphFor('€')).toBe(glyphFor('?'));
  });
});
