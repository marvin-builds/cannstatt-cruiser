/**
 * The NorDIY high five (highFive event, ROADMAP 49): the front arm shoots up
 * towards the high fiver's raised hand, holds the slap for the contact and
 * comes back down, HIGH_FIVE_TIME in all. Which way the arm reaches (ahead,
 * straight up, back) is picked once from where the high fiver stands at the
 * event. Looks only: no physics, no hitbox. Pure timeline here;
 * high-five-art.ts has the geometry, render.ts draws it.
 */

/** Seconds of each phase: the arm up, the slap held for the contact, the arm back down. */
export const HIGH_FIVE_RAISE = 0.05;
export const HIGH_FIVE_HOLD = 0.12;
export const HIGH_FIVE_LOWER = 0.13;
export const HIGH_FIVE_TIME = HIGH_FIVE_RAISE + HIGH_FIVE_HOLD + HIGH_FIVE_LOWER;

/** Px the high fiver's middle may be off the skater's x and still get the straight-up arm. */
const OVER_RANGE = 6;

export type HighFiveArm = 'raise' | 'slap' | 'lower';
export type HighFiveSide = 'ahead' | 'over' | 'behind';

/** The running high five: seconds since the event and where the arm reaches. */
export interface HighFiveLook {
  time: number;
  side: HighFiveSide;
}

/** The arm phase `time` seconds after the high five, or null once it is over. */
export function highFiveArm(time: number): HighFiveArm | null {
  if (time < HIGH_FIVE_RAISE) return 'raise';
  if (time < HIGH_FIVE_RAISE + HIGH_FIVE_HOLD) return 'slap';
  return time < HIGH_FIVE_TIME ? 'lower' : null;
}

/** Where to reach for a high fiver whose middle is `ahead` px in front of the skater (null: unknown, up and back). */
export function highFiveSide(ahead: number | null): HighFiveSide {
  if (ahead === null || ahead < -OVER_RANGE) return 'behind';
  return ahead > OVER_RANGE ? 'ahead' : 'over';
}
