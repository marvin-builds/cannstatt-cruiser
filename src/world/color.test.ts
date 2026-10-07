import { describe, expect, it } from 'vitest';
import { gradientColor, mixColor } from './color';

describe('mixColor', () => {
  it('blends two hex colours linearly per channel', () => {
    expect(mixColor('#000000', '#ffffff', 0)).toBe('#000000');
    expect(mixColor('#000000', '#ffffff', 1)).toBe('#ffffff');
    expect(mixColor('#000000', '#ff8040', 0.5)).toBe('#804020');
  });
});

describe('gradientColor', () => {
  const stops = ['#000000', '#ff0000', '#ffff00'];

  it('hits each stop at its centre and blends smoothly between them', () => {
    // 3 stops over 30 rows: centres at rows 5, 15, 25.
    expect(gradientColor(stops, 5, 30)).toBe('#000000');
    expect(gradientColor(stops, 15, 30)).toBe('#ff0000');
    expect(gradientColor(stops, 10, 30)).toBe('#800000');
    expect(gradientColor(stops, 0, 30)).toBe('#000000');
    expect(gradientColor(stops, 29, 30)).toBe('#ffff00');
  });

  it('never steps back, so there are no bands', () => {
    let last = -1;
    for (let y = 0; y < 30; y++) {
      const red = parseInt(gradientColor(stops, y, 30).slice(1, 3), 16);
      expect(red).toBeGreaterThanOrEqual(last);
      last = red;
    }
  });
});
