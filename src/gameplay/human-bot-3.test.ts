import { describe, expect, it } from 'vitest';
import { RAMP_DISTANCE, SPEED_RAMP_DISTANCE } from './difficulty';
import { rideHuman } from './human-run';

// Acceptance for the late game: past both ramps (top speed, full density, every
// pattern tier) a sloppy human (take-off +-4 ticks, three hold lengths) crashes
// at most once per 45 s, since every take-off leaves a human window (fairness.ts).
describe('human bot at full difficulty', () => {
  it('crashes at most once per 45 s of riding (3 seeds x 1 min)', () => {
    const from = Math.max(RAMP_DISTANCE, SPEED_RAMP_DISTANCE) + 1000;
    const crashes = [1, 2, 3].flatMap((seed) => rideHuman(seed, 60, from).crashes);
    expect(crashes.length, JSON.stringify(crashes)).toBeLessThanOrEqual(180 / 45);
  }, 120_000);
});
