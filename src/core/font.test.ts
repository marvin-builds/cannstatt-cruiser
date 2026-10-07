import { describe, expect, it } from 'vitest';
import { FONT_LINE_HEIGHT, glyphFor, measureText } from './font-data';

describe('pixel font', () => {
  it('has glyphs for German letters, digits and punctuation', () => {
    const required = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyzÄÖÜäöüß0123456789.,:;!?-+/()\'"%*=<>#&_ ';
    for (const ch of required) expect(glyphFor(ch), ch).not.toBeNull();
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
