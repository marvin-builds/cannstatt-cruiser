/**
 * Difficulty as pure functions of the distance travelled, so it plays the
 * same on every screen width: scroll speed, the gap between spawn patterns
 * and which pattern tiers are unlocked. The spawner may lay patterns closer
 * than the gap (spawner.ts quiet cap), never further apart. The speed eases out: it picks up
 * noticeably in the first minute and creeps into TOP_SPEED at the end.
 */
import { BASE_SPEED } from '../core/config';

/** Distance (view px) over which the gap between patterns ramps to full density (~2.5 min of riding, ROADMAP 52). */
export const RAMP_DISTANCE = 17400;
/** Distance over which the speed eases from BASE_SPEED to TOP_SPEED (~5.3 min). */
export const SPEED_RAMP_DISTANCE = 46000;
/**
 * The difficulty's top speed and the fastest gameplay ever rides (ROADMAP 23:
 * 160 felt slow, 220 too fast). Fairness checks run up to it.
 */
export const TOP_SPEED = 190;
/** Ease-out exponent of the speed ramp (1 = linear; higher = faster start, softer end). */
const SPEED_EASE = 1.6;
/** Empty pavement between patterns at the start and at full difficulty. */
const GAP_START = 208;
const GAP_END = 73;
/** Street distances at which pattern tiers 1, 2 and 3 unlock (~8 s, ~50 s, ~1.5 min of riding). */
const TIER_DISTANCES = [740, 4800, 9600];

function progress(distance: number, ramp = RAMP_DISTANCE): number {
  return Math.min(1, Math.max(0, distance / ramp));
}

/** Difficulty speed, before the chill slowdown (chillSpeedFactor in chill.ts). */
export function speedAt(distance: number): number {
  const eased = 1 - (1 - progress(distance, SPEED_RAMP_DISTANCE)) ** SPEED_EASE;
  return BASE_SPEED + (TOP_SPEED - BASE_SPEED) * eased;
}

export function gapAt(distance: number): number {
  return Math.round(GAP_START + (GAP_END - GAP_START) * progress(distance));
}

export function tierAt(distance: number): number {
  return TIER_DISTANCES.filter((step) => distance >= step).length;
}
