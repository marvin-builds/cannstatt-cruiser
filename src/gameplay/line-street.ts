/**
 * The street under a stunt line (ROADMAP 52; not the NorDIY park): a low
 * obstacle under each ledge a kicker launches onto, so skipping the line is
 * no free ride (the line pays the points, the street still has something to
 * jump). Safe for the line by construction:
 * - it lies behind the kicker's latest launch landing (plus STREET_ROOM), so
 *   a skater who launched is on the ledge above it (the deck is higher than
 *   any low obstacle);
 * - only under the ledges before the line's first gap jump: a skater who
 *   misses a gap (the stunt bot too) lands on the street below and rides on
 *   it, so nothing stands there; a drop rolls off onto a kicker, and the
 *   obstacle lies behind every way off the ledges before it
 *   (stuntWorstLanding);
 * - from the street it is fair like any pattern: checked with the solver from
 *   the end of the kicker's launch window (or the farthest fall before it) at
 *   every speed of the line, with the early take-off window.
 * No obstacle fits under a ledge too short for it: then that ledge has none.
 */
import { GROUND_Y } from '../core/config';
import type { ObstacleKind } from '../types';
import { OBSTACLES, obstacleRect } from './catalogue';
import { buildCourse } from './course';
import { EARLY_TAKEOFF_WINDOW, humanFair, soberFairness, solversFor } from './fairness';
import { type Piece, runoutFor } from './patterns';
import { kickerWindow } from './rules';
import { resumable, type WorkBudget } from './solver';
import type { LineBuilder } from './stunt-line';
import { stuntWorstLanding } from './stunt-line';

/** Low obstacles the street under a line gets (no people: they need free street around them). */
export const LINE_STREET_KINDS: ObstacleKind[] = ['curbGap', 'bench', 'planter', 'bin'];
/** Street (px) kept free behind the latest launch landing and before the ledge's end. */
const STREET_ROOM = 8;

/**
 * Plans the obstacles under `b`'s line (see the module comment) into
 * `b.street`; resumable with `budget` like the line itself.
 */
export function* planLineStreet(b: LineBuilder, budget?: WorkBudget): Generator<void> {
  const pieces = b.pieces;
  const margin = soberFairness(EARLY_TAKEOFF_WINDOW);
  for (let i = 0; i < pieces.length; i++) {
    const kicker = pieces[i]!;
    if (kicker.kind !== 'kicker') {
      // A gap jump comes: a skater who misses it rides the street from here on.
      if (pieces[i + 1]?.kind === 'ledge') return;
      continue;
    }
    const ledge = pieces[i + 1]!;
    const earlier = pieces.slice(0, i).filter((p) => p.kind === 'ledge');
    const fallen = earlier.length > 0 ? stuntWorstLanding(earlier, b.fast) : -Infinity;
    const [, landing] = b.launchLandings(kicker, GROUND_Y - ledge.y);
    const kind = b.rng.pick(LINE_STREET_KINDS);
    const from = Math.ceil(Math.max(landing, fallen)) + STREET_ROOM;
    const to = ledge.x + ledge.w - STREET_ROOM - OBSTACLES[kind].w;
    yield* b.spend(budget);
    if (to < from) continue;
    const piece: Piece = { kind, ...obstacleRect(kind, b.rng.int(from, to)) };
    if (kind === 'bin') piece.data = { variant: b.rng.int(0, 2) };
    const origin = Math.max(kickerWindow(kicker, b.fast).end, fallen);
    const solvers = solversFor(
      buildCourse([piece], origin, (goal) => goal + runoutFor(b.fast)),
      b.speeds,
      budget,
    );
    if (yield* resumable(() => humanFair(solvers, margin))) b.street.push(piece);
  }
}
