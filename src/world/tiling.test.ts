import { describe, expect, it } from 'vitest';
import { tileStarts } from './tiling';

describe('tileStarts', () => {
  it('covers the whole view without gaps for every width and offset', () => {
    for (const viewWidth of [320, 336, 360, 422, 427]) {
      for (const scroll of [0, 1, 63, 64, 1000.7, 98765]) {
        const starts = tileStarts(scroll, 64, viewWidth);
        expect(starts[0]).toBeLessThanOrEqual(0);
        expect(starts[0]).toBeGreaterThan(-64);
        for (let i = 1; i < starts.length; i++) expect(starts[i]! - starts[i - 1]!).toBe(64);
        expect(starts.at(-1)! + 64).toBeGreaterThanOrEqual(viewWidth);
        expect(starts.at(-1)!).toBeLessThan(viewWidth);
      }
    }
  });

  it('uses integer positions that move left as the scroll grows', () => {
    expect(tileStarts(10.6, 64, 320)[0]).toBe(-10);
    expect(tileStarts(70, 64, 320)[0]).toBe(-6);
  });
});
