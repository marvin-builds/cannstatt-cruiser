/**
 * Air trick start rule (kickflip, down pressed in the air): pure functions so
 * gameplay's scoring can mirror them. The trick runs AIR_TRICK_TICKS ticks
 * and only starts when the remaining air time to the street lets it finish
 * before touching down, so it never makes a landing harder.
 */
import { GROUND_Y, TICK_DT } from '../core/config';
import { AIR_TRICK_HEIGHT, AIR_TRICK_TICKS, GRAVITY, MAX_FALL_SPEED } from './tuning';

/** Upper bound for the prediction (a very long flight is simply "long enough"). */
const MAX_PREDICTED_TICKS = 600;

/**
 * Ticks until the wheels reach the street from (y, vy) after this tick's
 * move, integrated exactly like the fall physics with normal GRAVITY: the
 * landing happens on the tick this many ticks later (0 = on the street).
 * The hold boost only lowers gravity, so the real flight is never shorter.
 */
export function airTicksLeft(y: number, vy: number): number {
  let ticks = 0;
  while (y < GROUND_Y && ticks < MAX_PREDICTED_TICKS) {
    vy = Math.min(MAX_FALL_SPEED, vy + GRAVITY * TICK_DT);
    y += vy * TICK_DT;
    ticks++;
  }
  return ticks;
}

/**
 * Down pressed in the air (after this tick's physics) starts the trick: big
 * air (any kicker launch, or a jump GRAB_HEIGHT above its take-off) or at
 * least AIR_TRICK_HEIGHT above the street, and at least AIR_TRICK_TICKS of
 * air time left, so the trick is over by the landing tick.
 */
export function canStartAirTrick(y: number, vy: number, bigAir: boolean): boolean {
  return (bigAir || GROUND_Y - y >= AIR_TRICK_HEIGHT) && airTicksLeft(y, vy) >= AIR_TRICK_TICKS;
}
