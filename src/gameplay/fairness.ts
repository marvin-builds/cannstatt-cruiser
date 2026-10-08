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
 * - while the player may be drunk (spawner.ts) patterns come only from
 *   DRUNK_TEMPLATES (no people, nothing overhead, no rails) with a longer
 *   run-up, and must stay fair for the worst-case drunk
 *   input (drunkFairness: the window grows by the press delay range, and the
 *   player holds on long enough that every hold wobble still gives a full
 *   jump).
 * The touch decision delay (core/input.ts, up to 5 ticks) is a constant lag a
 * player learns, not jitter, so it does not narrow the window.
 * src/gameplay/fairness.test.ts and the human bot (human-bot-*.test.ts) hold
 * the spawner to it.
 */
import { drunkWindow } from '../core/drunk';
import type { Course, Pace, WorkBudget } from './solver';
import { Solver } from './solver';
import { groundBody } from './jumpsim';

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

/** The only templates (patterns.ts) planned while the player may be drunk: lone or paired ground obstacles (no empty star patterns: drunk streets still have something to jump). */
export const DRUNK_TEMPLATES = ['single', 'pair'] as const;


/** A full press in ticks: holding longer adds no height (player/tuning.ts MAX_JUMP_HOLD). */
export const FULL_PRESS = HUMAN_HOLDS[HUMAN_HOLDS.length - 1];

/**
 * How long a drunk player holds the button: so long that even the shortest
 * outcome of drunkWindow (release delay and hold wobble, core/drunk.ts) is a
 * full press. Hold lengths are a lottery while drunk, so a player who knows it
 * holds on (~0.7 s) and always gets the full jump.
 */
export const DRUNK_HOLD = drunkHoldFor(FULL_PRESS);

function drunkHoldFor(full: number): number {
  let hold = full;
  while (drunkWindow(hold).holdMin < full) hold++;
  return hold;
}

/** A human margin for the solver (Solver.fair): take-off window, the holds a player uses and how far each may be off. */
export interface Margin {
  window: number;
  holds: readonly number[];
  spread: number;
}

/** The sober margin: the human take-off window with HUMAN_HOLDS, holds exact. */
export function soberFairness(window: number): Margin {
  return { window, holds: HUMAN_HOLDS, spread: 0 };
}

/**
 * The margin a drunk player needs on top of the human `window`: every press
 * arrives drunkWindow's pressMin..pressMax ticks late (a constant lag the
 * player learns plus jitter that widens the window), and the player holds
 * DRUNK_HOLD, whose every outcome (DRUNK_HOLD +- spread) is a full jump.
 */
export function drunkFairness(window: number): Margin {
  const w = drunkWindow(DRUNK_HOLD);
  return { window: window + w.pressMax - w.pressMin, holds: [DRUNK_HOLD], spread: w.holdMax - DRUNK_HOLD };
}

/** Every take-off on the course (also after landing) leaves a human take-off window of `window` ticks, at every pace. */
export function humanFairAtAll(course: Course, paces: (number | Pace)[], window = LATE_TAKEOFF_WINDOW): boolean {
  return humanFair(
    paces.map((pace) => new Solver(course, pace)),
    soberFairness(window),
  );
}

/** One solver per pace sharing `budget` (see Solver: resumable). */
export function solversFor(course: Course, paces: readonly (number | Pace)[], budget?: WorkBudget): Solver[] {
  return paces.map((pace) => new Solver(course, pace, { budget }));
}

/** Like humanFairAtAll, with one solver per pace (the caller can reuse their caches afterwards) and any margin (drunk: drunkFairness). */
export function humanFair(solvers: Solver[], margin: Margin = soberFairness(LATE_TAKEOFF_WINDOW)): boolean {
  // Fair implies solvable: the cheap frame-perfect check rejects most bad courses first and warms the solvers' caches.
  return solvers.every((s) => s.solvable()) && solvers.every((s) => s.fair(margin.holds, margin.window, groundBody(), margin.spread));
}
