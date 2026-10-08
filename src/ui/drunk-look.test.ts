import { describe, expect, it } from 'vitest';
import { drunkShown, drunkStrength, DRUNK_EASE_IN, DRUNK_EASE_OUT, swayOffset } from './drunk-look';

describe('drunk look', () => {
  it('shows only while the timer runs, never in kid mode', () => {
    expect(drunkShown({ drunkTimer: 3, kidMode: false })).toBe(true);
    expect(drunkShown({ drunkTimer: 0, kidMode: false })).toBe(false);
    expect(drunkShown({ drunkTimer: 3, kidMode: true })).toBe(false);
  });

  it('eases in after drinking and out at the end', () => {
    const d = 6;
    expect(drunkStrength(d, d)).toBe(0);
    expect(drunkStrength(d - DRUNK_EASE_IN / 2, d)).toBeCloseTo(0.5, 5);
    expect(drunkStrength(d / 2, d)).toBe(1);
    expect(drunkStrength(DRUNK_EASE_OUT / 2, d)).toBeCloseTo(0.5, 5);
    expect(drunkStrength(0, d)).toBe(0);
  });

  it('sways by whole pixels, at most 3, and not at all when sober', () => {
    for (let t = 0; t < 5; t += 0.05) {
      const s = swayOffset(t, 1);
      expect(Number.isInteger(s)).toBe(true);
      expect(Math.abs(s)).toBeLessThanOrEqual(3);
      expect(swayOffset(t, 0)).toBe(0);
    }
  });
});
