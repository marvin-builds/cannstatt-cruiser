import { describe, expect, it } from 'vitest';
import { CHILL_DURATION, CHILL_EASE_IN, CHILL_EASE_OUT, chillStrength } from './chill';

describe('chill effect strength', () => {
  it('is off without a chill timer and full in the middle of the effect', () => {
    expect(chillStrength(0)).toBe(0);
    expect(chillStrength(CHILL_DURATION / 2)).toBe(1);
  });

  it('eases in over CHILL_EASE_IN after the pickup and out over the last CHILL_EASE_OUT', () => {
    expect(chillStrength(CHILL_DURATION)).toBe(0);
    expect(chillStrength(CHILL_DURATION - CHILL_EASE_IN)).toBe(1);
    expect(chillStrength(CHILL_EASE_OUT)).toBe(1);
    const easingIn = chillStrength(CHILL_DURATION - CHILL_EASE_IN / 2);
    const easingOut = chillStrength(CHILL_EASE_OUT / 2);
    for (const v of [easingIn, easingOut]) {
      expect(v).toBeGreaterThan(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('changes smoothly (no jumps between ticks)', () => {
    let last = chillStrength(CHILL_DURATION);
    for (let t = CHILL_DURATION; t >= 0; t -= 1 / 60) {
      const v = chillStrength(t);
      expect(Math.abs(v - last)).toBeLessThan(0.06);
      last = v;
    }
  });
});
