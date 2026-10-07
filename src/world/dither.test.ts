import { describe, expect, it } from 'vitest';
import { DITHER_LEVELS, ditherCovers } from './dither';

function covered(level: number): number {
  let n = 0;
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) if (ditherCovers(level, x, y)) n++;
  return n;
}

describe('ditherCovers', () => {
  it('covers exactly `level` pixels of each 4x4 cell', () => {
    for (let level = 0; level <= DITHER_LEVELS; level++) expect(covered(level)).toBe(level);
  });

  it('keeps pixels covered as the level rises', () => {
    for (let level = 0; level < DITHER_LEVELS; level++) {
      for (let y = 0; y < 8; y++) {
        for (let x = 0; x < 8; x++) if (ditherCovers(level, x, y)) expect(ditherCovers(level + 1, x, y)).toBe(true);
      }
    }
  });

  it('repeats every 4 pixels', () => {
    expect(ditherCovers(5, 1, 2)).toBe(ditherCovers(5, 9, 6));
  });
});
