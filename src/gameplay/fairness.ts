/**
 * Human-sized margins around people. The solver proves a pattern clearable
 * with frame-perfect input; a person (moving, as tall as the skater's tuck)
 * additionally gets room a real player can hit:
 * - a person always comes alone in its pattern (lead before, runout after), so
 *   with the gap between patterns there are >= PERSON_ROOM_SECONDS of free
 *   street on both sides and nobody walks into other obstacles;
 * - its pattern needs a take-off window of >= MIN_TAKEOFF_WINDOW consecutive
 *   ticks with one of HUMAN_HOLDS, at every speed (and chill jump) checked.
 * src/gameplay/fairness.test.ts and the human bot (human-bot-*.test.ts) hold
 * the spawner to it.
 */
import type { Course, Pace } from './solver';
import { Solver } from './solver';

/** Hold lengths (ticks) a human can repeat on purpose: a tap, a half press, a full press. */
export const HUMAN_HOLDS = [3, 10, 20] as const;

/** Take-off window in ticks: a human hitting it +-4 ticks (~67 ms) late or early still clears. */
export const MIN_TAKEOFF_WINDOW = 9;

/** Free street before and after every person, in seconds of riding at the current speed. */
export const PERSON_ROOM_SECONDS = 1;

/** The course leaves a human take-off window at every pace. */
export function humanWindowAtAll(course: Course, paces: (number | Pace)[]): boolean {
  return paces.every((pace) => new Solver(course, pace).takeoffWindow(HUMAN_HOLDS) >= MIN_TAKEOFF_WINDOW);
}
