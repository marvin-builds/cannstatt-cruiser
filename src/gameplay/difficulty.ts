/**
 * Difficulty as pure functions of the distance travelled, so it plays the
 * same on every screen width: scroll speed, the gap between spawn patterns
 * and which pattern tiers are unlocked.
 */
import { BASE_SPEED, MAX_SPEED } from '../core/config';

/** Distance (view px) over which density and pattern tiers ramp to full difficulty (~3 min of riding). */
export const RAMP_DISTANCE = 24000;
/** Distance over which the speed creeps from BASE_SPEED to MAX_SPEED (~4 min), gentler than the density ramp. */
export const SPEED_RAMP_DISTANCE = 32000;
/** Empty pavement between patterns at the start and at full difficulty. */
const GAP_START = 200;
const GAP_END = 40;
/** Ramp progress at which pattern tiers 1, 2 and 3 unlock. */
const TIER_STEPS = [0.08, 0.25, 0.5];

function progress(distance: number, ramp = RAMP_DISTANCE): number {
  return Math.min(1, Math.max(0, distance / ramp));
}

/** Difficulty speed, before the chill slowdown (chillSpeedFactor in chill.ts). */
export function speedAt(distance: number): number {
  return BASE_SPEED + (MAX_SPEED - BASE_SPEED) * progress(distance, SPEED_RAMP_DISTANCE);
}

export function gapAt(distance: number): number {
  return Math.round(GAP_START + (GAP_END - GAP_START) * progress(distance));
}

export function tierAt(distance: number): number {
  const p = progress(distance);
  return TIER_STEPS.filter((step) => p >= step).length;
}
