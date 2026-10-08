import { describe, expect, it } from 'vitest';
import { FLAG_FRAMES, type FlagSpec, PALESTINE_FLAG, TRANS_FLAG, drapeShift, flagColor, foldColumn } from './flags';

/** Colours of column x, top to bottom. */
function column(flag: FlagSpec, x: number): string[] {
  return Array.from({ length: flag.height }, (_, y) => flagColor(flag, x, y));
}

/** Distinct colours top to bottom, runs collapsed. */
function bands(colors: string[]): string[] {
  return colors.filter((c, i) => i === 0 || colors[i - 1] !== c);
}

describe('Palestine flag', () => {
  const { black, white, green, red } = PALESTINE_FLAG.colors;

  it('has black, white, green horizontal stripes of equal height', () => {
    const fly = column(PALESTINE_FLAG, PALESTINE_FLAG.width - 1);
    expect(bands(fly)).toEqual([black, white, green]);
    const share = PALESTINE_FLAG.height / 3;
    expect(fly.filter((c) => c === black)).toHaveLength(share);
    expect(fly.filter((c) => c === white)).toHaveLength(share);
  });

  it('has a red triangle at the hoist, widest in the middle and pointing into the fly', () => {
    expect(column(PALESTINE_FLAG, 0).every((c) => c === red)).toBe(true);
    const widths = Array.from({ length: PALESTINE_FLAG.height }, (_, y) => {
      let w = 0;
      while (flagColor(PALESTINE_FLAG, w, y) === red) w++;
      return w;
    });
    expect(widths).toEqual([...widths].reverse());
    const mid = Math.floor(PALESTINE_FLAG.height / 2);
    expect(widths[mid]).toBeGreaterThan(widths[0]!);
    expect(Math.max(...widths)).toBeLessThan(PALESTINE_FLAG.width / 2);
  });

  it('uses the right colours', () => {
    expect([black, white, green, red].map(hue)).toEqual(['dark', 'light', 'green', 'red']);
  });
});

describe('Trans pride flag', () => {
  const { blue, pink, white } = TRANS_FLAG.colors;

  it('has light blue, pink, white, pink, light blue stripes across the whole width', () => {
    for (let x = 0; x < TRANS_FLAG.width; x++) {
      expect(bands(column(TRANS_FLAG, x))).toEqual([blue, pink, white, pink, blue]);
    }
  });

  it('uses the right colours', () => {
    expect([blue, pink, white].map(hue)).toEqual(['lightBlue', 'pink', 'light']);
  });
});

describe('drape', () => {
  for (const flag of [PALESTINE_FLAG, TRANS_FLAG]) {
    it(`keeps the ${flag.name} flag's top row on the sill and sways the hem by at most 1 px`, () => {
      for (let f = 0; f < FLAG_FRAMES; f++) {
        expect(drapeShift(flag, 0, f)).toBe(0);
        for (let y = 0; y < flag.height; y++) {
          const s = drapeShift(flag, y, f);
          expect(s === 0 || s === 1).toBe(true);
          if (y > 0) expect(s).toBeGreaterThanOrEqual(drapeShift(flag, y - 1, f));
        }
      }
    });

    it(`keeps the ${flag.name} flag's fold inside the flag, off the hoist`, () => {
      for (let f = 0; f < FLAG_FRAMES; f++) {
        const x = foldColumn(flag, f);
        expect(x).toBeGreaterThan(flag.width / 3);
        expect(x).toBeLessThan(flag.width - 1);
      }
    });
  }

  it('flutters: the frames differ', () => {
    const looks = new Set(Array.from({ length: FLAG_FRAMES }, (_, f) => `${foldColumn(TRANS_FLAG, f)}:${drapeShift(TRANS_FLAG, TRANS_FLAG.height - 1, f)}`));
    expect(looks.size).toBeGreaterThan(1);
  });
});

/** Rough colour class of a `#rrggbb` colour. */
function hue(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
  if (r < 60 && g < 60 && b < 60) return 'dark';
  if (r > 225 && g > 225 && b > 225) return 'light';
  if (g > r + 40 && g > b + 20) return 'green';
  if (r > 180 && g < 90 && b < 90) return 'red';
  if (b > 200 && g > 160 && r < 140) return 'lightBlue';
  if (r > 220 && g > 140 && g < 200 && b > 160 && b < 210) return 'pink';
  return 'other';
}
