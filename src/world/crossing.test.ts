import { describe, expect, it } from 'vitest';
import { crossingX } from './crossing';

/** A 40 px vehicle hidden behind covers that end at x 20 (left) and start at x 200 (right). */
const RUN = { period: 9, duration: 7, from: 200, to: 20 - 40 } as const;

describe('crossingX', () => {
  it('starts fully behind the right cover and ends fully behind the left one', () => {
    expect(crossingX(0, RUN)).toBe(200);
    expect(crossingX(7, RUN)).toBe(-20);
  });

  it('moves steadily leftwards at integer x during the run', () => {
    let last = Infinity;
    for (let t = 0; t <= 7; t += 0.05) {
      const x = crossingX(t, RUN)!;
      expect(Number.isInteger(x)).toBe(true);
      expect(x).toBeLessThanOrEqual(last);
      expect(x).toBeGreaterThanOrEqual(-20);
      expect(x).toBeLessThanOrEqual(200);
      last = x;
    }
  });

  it('is absent between runs and repeats every period', () => {
    expect(crossingX(8, RUN)).toBeNull();
    expect(crossingX(9 + 3.5, RUN)).toBe(crossingX(3.5, RUN));
  });
});
