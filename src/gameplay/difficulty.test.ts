import { describe, expect, it } from 'vitest';
import { BASE_SPEED, MAX_SPEED } from '../core/config';
import { gapAt, RAMP_DISTANCE, SPEED_RAMP_DISTANCE, speedAt, tierAt } from './difficulty';

describe('difficulty ramp (by distance)', () => {
  it('caps the top speed at 165 px/s', () => {
    expect(MAX_SPEED).toBe(165);
    for (let d = 0; d < SPEED_RAMP_DISTANCE * 3; d += 250) expect(speedAt(d)).toBeLessThanOrEqual(MAX_SPEED);
  });

  it('starts at the base speed and reaches the cap at the end of the speed ramp', () => {
    expect(speedAt(0)).toBe(BASE_SPEED);
    expect(speedAt(SPEED_RAMP_DISTANCE)).toBe(MAX_SPEED);
    expect(speedAt(SPEED_RAMP_DISTANCE * 5)).toBe(MAX_SPEED);
  });

  it('ramps the speed gently: at most 2.5 px/s more per 1000 px of street', () => {
    for (let d = 0; d < SPEED_RAMP_DISTANCE; d += 1000) expect(speedAt(d + 1000) - speedAt(d)).toBeLessThanOrEqual(2.5);
  });

  it('keeps the difficulty growing through density and pattern mix before the speed tops out', () => {
    expect(RAMP_DISTANCE).toBeLessThan(SPEED_RAMP_DISTANCE);
    expect(gapAt(RAMP_DISTANCE)).toBeLessThan(gapAt(0) / 3);
    expect(tierAt(RAMP_DISTANCE)).toBe(3);
  });

  it('speed never decreases and the gaps between patterns never grow', () => {
    for (let d = 0; d < SPEED_RAMP_DISTANCE * 1.2; d += 500) {
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
