/**
 * The NorDIY park line (ROADMAP 36): the guaranteed stunt line through the
 * park, one spawn pattern (name 'park') built with the stunt-line machinery
 * (stunt-line.ts LineBuilder) and its fairness rules:
 *
 *   high fiver -> bank -> container -> (gap jump | drop + bank) -> container
 *   -> (gap jump up | drop + bank) -> crane boom
 *
 * - concrete banks are the kickers (`data.park = 'bank'`);
 * - two containers side by side are ledges of one height (CONTAINER_HEIGHT,
 *   inside the ledge range), CONTAINER_LENGTH long or longer when the speed
 *   needs the grind room; a level gap that needs a jump (rolling off falls
 *   past the second one), or a drop to the street onto a second bank;
 * - the crane boom is the last and highest ledge (CRANE_STEP_UP above the
 *   containers, within STUNT_APEX_MAX reach), about 1.5 container lengths,
 *   with stars along it;
 * - the high fiver stands on the street at HIGH_FIVER_X, before the first
 *   bank (PARK_ENTRY), under no ledge.
 *
 * Pattern x 0 is the park's start (ParkPlan.start), so a piece at pattern x
 * `x` lies at run distance `start + x`, which is on screen at
 * `PLAYER_X + start + x - state.distance` (parkPiecesOf).
 */
import { BASE_SPEED, GROUND_Y } from '../core/config';
import type { Rng } from '../core/rng';
import type { ParkPiece } from '../types';
import { highFiverRect, LEDGE } from './catalogue';
import type { Pattern, Piece } from './patterns';
import type { WorkBudget } from './solver';
import { clampLength, FINAL_GRIND_SECONDS, GAP_LANDING_SECONDS, GAP_RUNUP_SECONDS, LineBuilder } from './stunt-line';

/** The park's zone (Bad Cannstatt): the ledge art falls back to its look should the park lines ever draw one. */
const PARK_ZONE = 2;
/** Where the high fiver stands, from the park's start (pattern x). */
export const HIGH_FIVER_X = 24;
/** The first bank's left edge from the park's start: room for the high five and the scenery's entrance. */
export const PARK_ENTRY = 120;
/** Base length of a container roof (longer when the speed needs more grind)... */
export const CONTAINER_LENGTH: [number, number] = [80, 100];
/** ...and its height range: low enough that the crane can stand CRANE_STEP_UP higher within the ledge range. */
const CONTAINER_HEIGHT: [number, number] = [LEDGE.minHeight, 50];
/** The crane boom over the containers (px). */
const CRANE_STEP_UP: [number, number] = [6, 8];
/** The crane boom is about this many container lengths. */
const CRANE_SCALE = 1.5;
/**
 * The longest a park pattern gets (PARK_ENTRY plus the line and its runout),
 * at any speed up to TOP_SPEED...
 */
export const PARK_MAX_LENGTH = 1150;

/**
 * The slowest speed a park line is laid for: the ramp's start. Slower (a
 * pinned crawl or standstill) the line for this speed is planned instead (the
 * line's flights never end at 0 px/s), and the spawner plans no park then.
 */
export const PARK_MIN_SPEED = BASE_SPEED;

/** ...and at `speed` (the line grows with the speed): the spawner keeps this much of Bad Cannstatt free for it. */
export function parkMaxLength(speed: number): number {
  return Math.min(PARK_MAX_LENGTH, Math.ceil(440 + 3.6 * speed));
}

type Structure = ParkPiece['kind'];

function mark(piece: Piece, kind: Structure): Piece {
  piece.data!.park = kind;
  return piece;
}

/**
 * The park line for the speeds `speeds` (inside the park the speed ramp
 * pauses, so usually one; at least PARK_MIN_SPEED), its pieces carrying line id `line`. Resumable like
 * planStuntLine: with a work budget it yields when the budget is used up.
 */
export function* planParkLine(rng: Rng, speeds: number[], line: number, budget?: WorkBudget): Generator<void, Pattern> {
  const b = new LineBuilder(rng, speeds.map((speed) => Math.max(PARK_MIN_SPEED, speed)), PARK_ZONE, line);
  const height = rng.int(...CONTAINER_HEIGHT);
  const craneHeight = height + rng.int(...CRANE_STEP_UP);
  const length = clampLength(Math.max(rng.int(...CONTAINER_LENGTH), (GAP_LANDING_SECONDS + GAP_RUNUP_SECONDS) * b.fast));

  const first = mark(b.launchLedge(mark(b.kicker(PARK_ENTRY, height), 'bank'), height, GAP_RUNUP_SECONDS, length), 'container');
  yield* b.spend(budget);
  const level = b.stepDownLedge(first, height, first.w);
  yield* b.spend(budget);
  let second: Piece;
  if (level) {
    b.gapTrail(first, level);
    second = b.ledge(level);
  } else {
    second = b.launchLedge(mark(b.dropKicker(first, height), 'bank'), height, GAP_RUNUP_SECONDS, first.w);
  }
  mark(second, 'container');
  yield* b.spend(budget);

  const craneLength = clampLength(Math.max(CRANE_SCALE * length, (GAP_LANDING_SECONDS + FINAL_GRIND_SECONDS) * b.fast));
  const boom = b.stepUpLedge(second, craneHeight - height, craneLength);
  yield* b.spend(budget);
  if (boom) {
    b.gapTrail(second, boom);
    mark(b.ledge(boom), 'crane');
  } else {
    mark(b.launchLedge(mark(b.dropKicker(second, craneHeight), 'bank'), craneHeight, FINAL_GRIND_SECONDS, craneLength), 'crane');
  }
  yield* b.spend(budget);
  return b.finish('park', [{ kind: 'highFiver', ...highFiverRect(HIGH_FIVER_X) }]);
}

/** The park line's structures (its kickers and ledges in order) as ParkPieces in run distances, for a park starting at `start`. */
export function parkPiecesOf(pattern: Pattern, start: number): ParkPiece[] {
  const pieces: ParkPiece[] = [];
  for (const p of pattern.pieces) {
    const kind = p.data?.park;
    if (kind !== 'bank' && kind !== 'container' && kind !== 'crane') continue;
    pieces.push({ kind, from: start + p.x, to: start + p.x + p.w, height: GROUND_Y - p.y });
  }
  return pieces;
}
