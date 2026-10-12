/**
 * Plausibility of a submitted run, derived from the game's tuning (keep in
 * sync when the game changes):
 * - top scroll speed TOP_SPEED = 190 px/s (src/gameplay/difficulty.ts) at
 *   PX_PER_METRE = 10 (src/ui/layout.ts), so at most 19 m/s;
 * - points: obstacles 60-150 x multiplier 5 (catalogue.ts, scoring.ts),
 *   items 200 x 5, kickflips 100-150 x flips, stunt lines up to 100 x 6 per
 *   piece plus 150 per piece (stunts.ts), park sessions up to 500 (park.ts),
 *   stars 10 x 5 each plus 50 x 5 per whole star arc (star-arcs.ts; the
 *   street lays about 0.9 stars and 0.16 arcs per 10 m, so taking every one
 *   at x5 adds at most about 9 points per metre).
 *   Since the combo grace (combo-grace.ts) the multiplier survives street
 *   touches of up to 0.3 s, so a skilled player can hold x5 from obstacle to
 *   obstacle: one 150-point obstacle every 8-10 m is about 75-95 points per
 *   metre, plus every star.
 *   The best recorded playtest run made about 7 points per metre; a dense
 *   stunt line earns much more for a moment, which SCORE_ALLOWANCE covers.
 *   The rates below allow x5 on every obstacle plus every star.
 * Not cheat-proof (the game runs on the client), it only stops absurd entries.
 */
export const MAX_SPEED_M_PER_S = 190 / 10;
/** Factor on the top speed for timing and rounding noise. */
const SPEED_MARGIN = 1.1;
/** Extra metres for rounding a very short run. */
const DISTANCE_SLACK = 10;
/** Points any run may have regardless of its length (one big stunt line). */
const SCORE_ALLOWANCE = 5000;
const MAX_POINTS_PER_METRE = 120;
const MAX_POINTS_PER_SECOND = 1500;
/** Four hours of skating. */
const MAX_DURATION_S = 4 * 60 * 60;

export interface Run {
  /** Points. */
  score: number;
  /** Metres. */
  distance: number;
  /** Seconds of play. */
  duration: number;
}

export function isPlausible({ score, distance, duration }: Run): boolean {
  if (duration <= 0 || duration > MAX_DURATION_S || score < 0 || distance < 0) return false;
  if (distance > duration * MAX_SPEED_M_PER_S * SPEED_MARGIN + DISTANCE_SLACK) return false;
  return score <= SCORE_ALLOWANCE + MAX_POINTS_PER_METRE * distance && score <= SCORE_ALLOWANCE + MAX_POINTS_PER_SECOND * duration;
}
