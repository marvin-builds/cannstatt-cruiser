/**
 * Human-sized margins. The solver proves a pattern clearable with
 * frame-perfect input; every pattern additionally leaves room a real player
 * can hit:
 * - every take-off on the way (the first one and each after a landing, also
 *   across the boundary to the previous pattern) has a window of >=
 *   takeoffWindowAt(street) consecutive ticks with one of HUMAN_HOLDS, at
 *   every speed (and chill jump) checked (Solver.fair): wider in the first
 *   ~90 s, while the player is still learning. The window only counts jumps
 *   that land on free street (or a rail), so it also keeps landing room;
 * - a person (moving, as tall as the skater's tuck) always comes alone in its
 *   pattern (lead before, runout after), so with the gap between patterns
 *   there are >= PERSON_ROOM_SECONDS of free street on both sides and nobody
 *   walks into other obstacles.
 * The touch decision delay (core/input.ts, up to 5 ticks) is a constant lag a
 * player learns, not jitter, so it does not narrow the window.
 * src/gameplay/fairness.test.ts and the human bot (human-bot-*.test.ts) hold
 * the spawner to it.
 */
import type { Course, Pace } from './solver';
import { Solver } from './solver';

/** Hold lengths (ticks) a human can repeat on purpose: a tap, a half press, a full press. */
export const HUMAN_HOLDS = [3, 10, 20] as const;

/** Take-off window in ticks in the first ~90 s: a human hitting it +-6 ticks (~100 ms) late or early still clears. */
export const EARLY_TAKEOFF_WINDOW = 14;
/** Take-off window in ticks after that: +-5 ticks (~85 ms). */
export const LATE_TAKEOFF_WINDOW = 12;
/** Street distance of ~90 s of riding at the difficulty speed: where the early window ends. */
export const EARLY_WINDOW_DISTANCE = 9500;

/** The human take-off window (ticks) every pattern starting at this street distance must leave. */
export function takeoffWindowAt(street: number): number {
  return street < EARLY_WINDOW_DISTANCE ? EARLY_TAKEOFF_WINDOW : LATE_TAKEOFF_WINDOW;
}

/** Free street before and after every person, in seconds of riding at the current speed. */
export const PERSON_ROOM_SECONDS = 1;

/** Every take-off on the course (also after landing) leaves a human take-off window of `window` ticks, at every pace. */
export function humanFairAtAll(course: Course, paces: (number | Pace)[], window = LATE_TAKEOFF_WINDOW): boolean {
  return humanFair(
    paces.map((pace) => new Solver(course, pace)),
    window,
  );
}

/** Like humanFairAtAll, with one solver per pace (the caller can reuse their caches afterwards). */
export function humanFair(solvers: Solver[], window = LATE_TAKEOFF_WINDOW): boolean {
  // Fair implies solvable: the cheap frame-perfect check rejects most bad courses first and warms the solvers' caches.
  return solvers.every((s) => s.solvable()) && solvers.every((s) => s.fair(HUMAN_HOLDS, window));
}
