import { describe, expect, it } from 'vitest';
import { composeFrame, shearColumns } from './compose';

describe('composeFrame', () => {
  it('stacks parts at offsets onto a transparent frame, later parts on top', () => {
    const rows = composeFrame(4, 3, [
      { art: ['aa', 'aa'], x: 0, y: 0 },
      { art: ['b.', '.b'], x: 1, y: 1 },
    ]);
    expect(rows).toEqual(['aa..', 'ab..', '..b.']);
  });

  it('clips parts that reach outside the frame', () => {
    expect(composeFrame(2, 2, [{ art: ['ccc', 'ccc', 'ccc'], x: 1, y: -1 }])).toEqual(['.c', '.c']);
  });

  it('accepts indented template literals and mirrors parts', () => {
    const art = `
      ab
      ..
    `;
    expect(composeFrame(3, 1, [{ art, x: 1, y: 0, flip: true }])).toEqual(['.ba']);
  });
});

describe('shearColumns', () => {
  it('lifts each column by slope * distance from the pivot, bottom-aligned in a taller frame', () => {
    expect(shearColumns(['ab', 'cd'], 1, 0, 3)).toEqual(['.b', 'ad', 'c.']);
  });

  it('lowers columns left of the pivot and clips at the frame edge', () => {
    expect(shearColumns(['ab', 'cd'], 1, 1, 2)).toEqual(['.b', 'ad']);
  });
});
