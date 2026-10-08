import { describe, expect, it } from 'vitest';
import { FLAG_FRAMES, type FlagSpec, PALESTINE_FLAG, TRANS_FLAG, drapeShift, flagColor, flagSpan, foldRow } from './flags';

/** Colours of row y, left to right. */
function row(flag: FlagSpec, y: number): string[] {
  return Array.from({ length: flag.width }, (_, x) => flagColor(flag, x, y));
}

/** Colours of column x, top to bottom. */
function column(flag: FlagSpec, x: number): string[] {
  return Array.from({ length: flag.height }, (_, y) => flagColor(flag, x, y));
}

/** Distinct colours in order, runs collapsed. */
function bands(colors: string[]): string[] {
  return colors.filter((c, i) => i === 0 || colors[i - 1] !== c);
}

describe('both flags hang down from the sill', () => {
  for (const flag of [PALESTINE_FLAG, TRANS_FLAG]) {
    it(`hangs the ${flag.name} flag taller than wide, hoist edge on top`, () => {
      expect(flag.height).toBeGreaterThan(flag.width);
      expect(flag.width % flag.stripes.length).toBe(0);
    });
  }
});

describe('Palestine flag', () => {
  const { black, white, green, red } = PALESTINE_FLAG.colors;

  it('has green, white, black vertical stripes of equal width, left to right (rotated clockwise)', () => {
    const fly = row(PALESTINE_FLAG, PALESTINE_FLAG.height - 1);
    expect(bands(fly)).toEqual([green, white, black]);
    const share = PALESTINE_FLAG.width / 3;
    for (const c of [green, white, black]) expect(fly.filter((f) => f === c)).toHaveLength(share);
  });

  it('has a red triangle along the top edge, deepest in the middle and pointing down', () => {
    expect(row(PALESTINE_FLAG, 0).every((c) => c === red)).toBe(true);
    const depths = Array.from({ length: PALESTINE_FLAG.width }, (_, x) => {
      let d = 0;
      while (flagColor(PALESTINE_FLAG, x, d) === red) d++;
      return d;
    });
    expect(depths).toEqual([...depths].reverse());
    const mid = Math.floor(PALESTINE_FLAG.width / 2);
    expect(depths[mid]).toBeGreaterThan(depths[0]!);
    expect(Math.max(...depths)).toBeLessThan(PALESTINE_FLAG.height / 2);
    for (let x = 0; x < PALESTINE_FLAG.width; x++) expect(column(PALESTINE_FLAG, x).slice(depths[x]).includes(red)).toBe(false);
  });

  it('uses the right colours', () => {
    expect([black, white, green, red].map(hue)).toEqual(['dark', 'light', 'green', 'red']);
  });
});

describe('Trans pride flag', () => {
  const { blue, pink, white } = TRANS_FLAG.colors;

  it('has light blue, pink, white, pink, light blue vertical stripes down the whole height', () => {
    for (let y = 0; y < TRANS_FLAG.height; y++) {
      expect(bands(row(TRANS_FLAG, y))).toEqual([blue, pink, white, pink, blue]);
    }
  });

  it('uses the right colours', () => {
    expect([blue, pink, white].map(hue)).toEqual(['lightBlue', 'pink', 'light']);
  });
});

describe('drape', () => {
  for (const flag of [PALESTINE_FLAG, TRANS_FLAG]) {
    it(`keeps the ${flag.name} flag's top row on the sill and sways the lower part by at most 1 px`, () => {
      for (let f = 0; f < FLAG_FRAMES; f++) {
        expect(drapeShift(flag, 0, f)).toBe(0);
        expect(drapeShift(flag, 1, f)).toBe(0);
        for (let y = 0; y < flag.height; y++) {
          const s = drapeShift(flag, y, f);
          expect(s === 0 || s === 1).toBe(true);
          if (y > 0) expect(s).toBeGreaterThanOrEqual(drapeShift(flag, y - 1, f));
        }
      }
    });

    it(`keeps the ${flag.name} flag's fold in the lower part, off the sill and the hem`, () => {
      for (let f = 0; f < FLAG_FRAMES; f++) {
        const y = foldRow(flag, f);
        expect(y).toBeGreaterThan(flag.height / 3);
        expect(y).toBeLessThan(flag.height - 1);
      }
    });
  }

  it('flutters: the frames differ', () => {
    const looks = new Set(Array.from({ length: FLAG_FRAMES }, (_, f) => `${foldRow(TRANS_FLAG, f)}:${drapeShift(TRANS_FLAG, TRANS_FLAG.height - 1, f)}`));
    expect(looks.size).toBeGreaterThan(1);
  });
});

describe('flagSpan', () => {
  it('spans the flag, its sway and its wall shadow in the house\'s own x', () => {
    expect(flagSpan(PALESTINE_FLAG, 12)).toEqual({ from: 12, to: 12 + PALESTINE_FLAG.width + 2 });
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
