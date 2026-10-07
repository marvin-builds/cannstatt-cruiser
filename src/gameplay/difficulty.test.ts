import { describe, expect, it } from 'vitest';
import { BASE_SPEED, MAX_SPEED } from '../core/config';
import { gapAt, RAMP_DISTANCE, speedAt, tierAt } from './difficulty';

describe('difficulty ramp (by distance)', () => {
  it('starts at the base speed and reaches the cap at the end of the ramp', () => {
    expect(speedAt(0)).toBe(BASE_SPEED);
    expect(speedAt(RAMP_DISTANCE)).toBe(MAX_SPEED);
    expect(speedAt(RAMP_DISTANCE * 5)).toBe(MAX_SPEED);
  });

  it('speed never decreases and the gaps between patterns never grow', () => {
    for (let d = 0; d < RAMP_DISTANCE * 1.2; d += 500) {
      expect(speedAt(d + 500)).toBeGreaterThanOrEqual(speedAt(d));
      expect(gapAt(d + 500)).toBeLessThanOrEqual(gapAt(d));
    }
    expect(gapAt(RAMP_DISTANCE * 3)).toBeGreaterThan(0);
  });

  it('unlocks harder pattern tiers over time, singles only at first', () => {
    expect(tierAt(0)).toBe(0);
    expect(tierAt(RAMP_DISTANCE)).toBe(3);
    for (let d = 0; d < RAMP_DISTANCE; d += 500) expect(tierAt(d + 500)).toBeGreaterThanOrEqual(tierAt(d));
  });
});
