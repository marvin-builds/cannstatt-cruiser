import { describe, expect, it } from 'vitest';
import { firstTileX } from './tiling';

/** Every x a tile is drawn at, the way the world loops over them. */
function starts(scroll: number, period: number, viewWidth: number): number[] {
  const list: number[] = [];
  for (let x = firstTileX(scroll, period); x < viewWidth; x += period) list.push(x);
  return list;
}

describe('firstTileX', () => {
  it('covers the whole view without gaps for every width and offset', () => {
    for (const viewWidth of [320, 336, 360, 422, 427]) {
      for (const scroll of [0, 1, 63, 64, 1000.7, 98765]) {
        const list = starts(scroll, 64, viewWidth);
        expect(list[0]).toBeLessThanOrEqual(0);
        expect(list[0]).toBeGreaterThan(-64);
        expect(list.at(-1)! + 64).toBeGreaterThanOrEqual(viewWidth);
      }
    }
  });

  it('uses integer positions that move left as the scroll grows', () => {
    expect(firstTileX(10.6, 64)).toBe(-10);
    expect(firstTileX(70, 64)).toBe(-6);
  });
});
