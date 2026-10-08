import { describe, expect, it } from 'vitest';
import { BASE_SPEED, MAX_SPEED, TICK_DT } from '../core/config';
import { gapAt, RAMP_DISTANCE, SPEED_RAMP_DISTANCE, speedAt, tierAt, TOP_SPEED } from './difficulty';

/** Street ridden after `seconds` from the run start at the difficulty speed. */
function distanceAfter(seconds: number): number {
  let d = 0;
  for (let t = 0; t < seconds / TICK_DT; t++) d += speedAt(d) * TICK_DT;
  return d;
}

describe('difficulty ramp (by distance)', () => {
  it('tops out at TOP_SPEED, a little under the 165 px/s cap', () => {
    expect(MAX_SPEED).toBe(165);
    expect(TOP_SPEED).toBeGreaterThanOrEqual(155);
    expect(TOP_SPEED).toBeLessThanOrEqual(MAX_SPEED);
    for (let d = 0; d < SPEED_RAMP_DISTANCE * 3; d += 250) expect(speedAt(d)).toBeLessThanOrEqual(TOP_SPEED);
  });

  it('starts at the base speed and reaches the top at the end of the speed ramp', () => {
    expect(speedAt(0)).toBe(BASE_SPEED);
    expect(speedAt(SPEED_RAMP_DISTANCE)).toBe(TOP_SPEED);
    expect(speedAt(SPEED_RAMP_DISTANCE * 5)).toBe(TOP_SPEED);
  });

  it('gets going in the first minute and a half: about 100 px/s at 30 s, 110 at 60 s, 118 at 90 s', () => {
    expect(speedAt(distanceAfter(30))).toBeGreaterThanOrEqual(99);
    expect(speedAt(distanceAfter(60))).toBeGreaterThanOrEqual(108);
    expect(speedAt(distanceAfter(90))).toBeGreaterThanOrEqual(116);
  });

  it('eases into the top speed: the last quarter of the ramp adds far less than the first', () => {
    const q = SPEED_RAMP_DISTANCE / 4;
    expect(speedAt(SPEED_RAMP_DISTANCE) - speedAt(3 * q)).toBeLessThan((speedAt(q) - speedAt(0)) / 3);
  });

  it('ramps the speed smoothly: at most 3.5 px/s more per 1000 px of street', () => {
    for (let d = 0; d < SPEED_RAMP_DISTANCE; d += 1000) expect(speedAt(d + 1000) - speedAt(d)).toBeLessThanOrEqual(3.5);
  });

  it('brings pairs within ~15 s and every pattern tier within ~1.5 min', () => {
    expect(tierAt(distanceAfter(15))).toBeGreaterThanOrEqual(1);
    expect(tierAt(distanceAfter(95))).toBe(3);
  });

  it('keeps the difficulty growing through density and pattern mix before the speed tops out', () => {
    expect(RAMP_DISTANCE).toBeLessThan(SPEED_RAMP_DISTANCE);
    expect(gapAt(RAMP_DISTANCE)).toBeLessThan(gapAt(0) / 2.5);
    expect(tierAt(RAMP_DISTANCE)).toBe(3);
  });

  it('leaves breathing room between patterns at full density', () => {
    expect(gapAt(RAMP_DISTANCE * 3)).toBeGreaterThanOrEqual(55);
  });

  it('speed never decreases and the gaps between patterns never grow', () => {
    for (let d = 0; d < SPEED_RAMP_DISTANCE * 1.2; d += 500) {
      expect(speedAt(d + 500)).toBeGreaterThanOrEqual(speedAt(d));
      expect(gapAt(d + 500)).toBeLessThanOrEqual(gapAt(d));
    }
  });

  it('unlocks harder pattern tiers over time, singles only at first', () => {
    expect(tierAt(0)).toBe(0);
    expect(tierAt(RAMP_DISTANCE)).toBe(3);
    for (let d = 0; d < RAMP_DISTANCE; d += 500) expect(tierAt(d + 500)).toBeGreaterThanOrEqual(tierAt(d));
  });
});
