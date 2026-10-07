import { describe, expect, it } from 'vitest';
import { parseSprite, rowsFromString } from './sprite-data';

describe('parseSprite', () => {
  const palette = { a: '#ff0000', b: '#00ff00' };

  it('maps characters to palette colours and "." to transparent', () => {
    const s = parseSprite(['ab', '.a'], palette);
    expect(s.width).toBe(2);
    expect(s.height).toBe(2);
    expect(s.pixels).toEqual(['#ff0000', '#00ff00', null, '#ff0000']);
  });

  it('rejects rows of different length', () => {
    expect(() => parseSprite(['ab', 'a'], palette)).toThrow(/row 1/);
  });

  it('rejects characters missing from the palette', () => {
    expect(() => parseSprite(['az'], palette)).toThrow(/"z"/);
  });

  it('treats spaces like transparent pixels', () => {
    expect(parseSprite(['a '], palette).pixels).toEqual(['#ff0000', null]);
  });
});

describe('rowsFromString', () => {
  it('splits a template literal into trimmed non-empty rows', () => {
    expect(rowsFromString(`
      ab
      .a
    `)).toEqual(['ab', '.a']);
  });
});
