/**
 * Fan crowds (ROADMAP 76, GitHub issue #3): now and then a crowd of VfB fans
 * (red and white, scarves up, a flag) or Wasen visitors (Dirndl and
 * Lederhosen with Lebkuchenherzen, never beer) blocks the street in Bad
 * Cannstatt. It is too wide for one jump; the way across is a jump onto the
 * first heads and plain stomp bounces from head to head (ROADMAP 60; a head
 * jump off a head is a bonus, never needed). Running into it is a normal
 * crash into a person.
 *
 * Built from what the street already has: every fan is a person entity
 * (vfbFan / wasenGuest) standing still (walk and sway 0), tagged
 * `data.crowd` with its theme (CROWD_KEY), `seat` / `seats` in the row and
 * the row's `gap`; one of them carries the flag or the big Lebkuchenherz
 * (`banner`). crowd-art.ts draws them, contacts and stomps treat them like
 * any person. crowd-watch.ts emits `crowdAhead` when a crowd comes on
 * screen (the ui's "VfB-Fans!" / "Wasen!" popup, audio's chant).
 *
 * Rules (crowdDue, spawner.ts):
 * - only in Bad Cannstatt (CROWD_ZONE: the Wasen and the stadium are there),
 *   never in the first CROWD_FIRST_SECONDS of a run, at most once per visit;
 * - rare: CROWD_CHANCE per Cannstatt visit (see there);
 * - alone in its stretch: the previous pattern's runout and gap leave at
 *   least 1.1 s of free street (spawner.ts EFFECT_FREE_SECONDS), then
 *   CROWD_LEAD_SECONDS of run-up, and CROWD_ROOM_SECONDS of free street
 *   after the last head; never while the player may be drunk or chilled,
 *   never right after a stunt line or the park;
 * - always passable: planCrowd checks at every speed of the pattern that
 *   bouncing head to head is human-fair (the take-off window of fairness.ts
 *   with HUMAN_HOLDS), also across the boundary to the previous pattern, and
 *   gives up (null, the spawner plans the street as usual) otherwise;
 * - guide stars (one star arc, star-arcs.ts) follow the solver's human line:
 *   the jump onto the first heads and the bounces over the rest, so a
 *   player sees how to cross, and the run-up keeps something to react to;
 * - too wide for one jump, and for one stomp: by design (CROWD_HEADS,
 *   CROWD_SPACING_SECONDS: fans one plain bounce apart, all heads at the same
 *   height); crowd.test.ts proves it with the solver for every 3 px/s from
 *   100 to 190 px/s (checking it live would cost ~10 times the planning
 *   budget of a pattern), crowd-bot.test.ts in the real game.
 *
 * Kid mode: crowds come too (the street is no less fun), but the smaller
 * row of CROWD_HEADS.kid: four heads is the least that still needs two
 * bounces (three can be crossed with one stomp at every speed).
 */
import type { Rng } from '../core/rng';
import type { ObstacleKind } from '../types';
import { obstacleRect, OBSTACLES, starRect } from './catalogue';
import type { Piece } from './course';
import { CROWD_KEY, type CrowdTheme } from './crowd-tag';
import { LATE_TAKEOFF_WINDOW, HUMAN_HOLDS } from './fairness';
import { groundBody } from './jumpsim';
import { spreadStars } from './line-guide';
import { courseAcross, courseOf, type Pattern } from './patterns';
import { asArc } from './star-arcs';
import { resumable, Solver, type WorkBudget } from './solver';

export { CROWD_KEY, crowdOf, type CrowdTheme } from './crowd-tag';

/** Pattern name of a crowd (the spawner's log and the debug hook's `pattern`). */
export const CROWD_TEMPLATE = 'fanCrowd';
/** Bad Cannstatt: the Cannstatter Wasen and the VfB stadium. */
export const CROWD_ZONE = 2;
/** No crowd in the first minute of a run: first-timers learn the street first. */
export const CROWD_FIRST_SECONDS = 60;
/**
 * Chance per Bad Cannstatt visit (after the first minute) that a crowd comes.
 * A visit comes every fourth zone, about every 75-100 s of riding, and the
 * first one after the first minute at about 1:30-2:00 into a run: 0.4 gives
 * about one crowd per 4 min of riding, so it stays a surprise (a typical
 * 2-4 min run meets one in less than half the runs) and a regular still sees
 * it often enough to learn the bounce.
 */
export const CROWD_CHANCE = 0.4;
/** The crowd stands this much street (at random) after the first pattern of the visit that may hold it. */
export const CROWD_SPREAD = 1600;
/** Heads in a row: adults a big crowd, kid mode the smallest that still needs two bounces. */
export const CROWD_HEADS = { adult: [5, 6] as [number, number], kid: [4, 4] as [number, number] };
/**
 * Street between two heads in seconds of riding: a plain bounce (150 px/s up
 * at gravity 1300) is back at head height after ~0.23 s, so a skater who
 * just lets it bounce comes down on the next head. Measured with the solver:
 * 0.215 s is fair for 4-6 heads at every speed from 100 to 190 px/s
 * (crowd.test.ts; it needs the solver to stomp a head the bounce comes down
 * on instead of crashing on the safety rim above it, solver.ts overHead).
 */
export const CROWD_SPACING_SECONDS = 0.215;
/**
 * Run-up before the first head, after the previous pattern's free street:
 * room for every approach (a full jump onto the heads takes off ~0.5 s
 * before them) while the street keeps something to react to every
 * QUIET_SECONDS (spawner.ts).
 */
export const CROWD_LEAD_SECONDS = 0.6;
/** Free street after the last head (the last bounce, a head jump, then the next pattern's lead). */
export const CROWD_ROOM_SECONDS = 1.2;
/** Most guide stars along the bounce line, and their least spacing (patterns.ts uses the same for its lines). */
const MAX_STARS = 9;
const STAR_SPACING = 13;
/** Street kept between the crowd and its zone's gateways. */
export const CROWD_ZONE_MARGIN = 128;

const KIND: Record<CrowdTheme, ObstacleKind> = { vfb: 'vfbFan', wasen: 'wasenGuest' };

/** The crowd schedule on the spawner's planning cursor. */
export interface CrowdCursor {
  /** No draw yet in this Bad Cannstatt visit (set by a pattern in another zone). */
  crowdArmed: boolean;
  /** This visit's crowd comes at the first pattern from this street distance on; null: none (any more) in this visit. */
  crowdAt: number | null;
}

/**
 * Moves the schedule on for the pattern at `street` in `zone` and says
 * whether the crowd is due there (the spawner lays it if the street allows
 * and then sets `crowdAt` to null). `first` is the street distance of the
 * run's first minute. The draw (CROWD_CHANCE, where in the visit) happens at
 * the visit's first pattern after the first minute, from the spawner's rng.
 */
export function crowdDue(c: CrowdCursor, zone: number, street: number, first: number, rng: Rng): boolean {
  if (zone !== CROWD_ZONE) {
    c.crowdArmed = true;
    c.crowdAt = null;
    return false;
  }
  if (street < first) return false;
  if (c.crowdArmed) {
    c.crowdArmed = false;
    const comes = rng.chance(CROWD_CHANCE);
    const at = street + rng.int(0, CROWD_SPREAD);
    c.crowdAt = comes ? at : null;
  }
  return c.crowdAt !== null && street >= c.crowdAt;
}

/** The widest street a crowd planned for `fast` px/s can take (the spawner checks it fits in the zone). */
export function crowdReach(fast: number): number {
  const gap = Math.ceil(CROWD_SPACING_SECONDS * fast);
  const lead = Math.round(CROWD_LEAD_SECONDS * fast);
  return lead + (CROWD_HEADS.adult[1] - 1) * gap + OBSTACLES.wasenGuest.w + Math.round(CROWD_ROOM_SECONDS * fast);
}

export interface CrowdOptions {
  kidMode?: boolean;
  /** Human take-off window (fairness.ts takeoffWindowAt). Default LATE_TAKEOFF_WINDOW. */
  window?: number;
  /** The previous pattern's pieces in this pattern's space (x < 0): fair across the boundary too. */
  before?: Piece[];
  budget?: WorkBudget;
}

/** How a crowd looks, drawn once per plan (so the result never depends on the work budget). */
export interface Looks {
  theme: CrowdTheme;
  /** Outfit per seat (Wasen: Lederhosen / Dirndl; fans: scarf colours). */
  variants: number[];
  /** Seat of the flag (fans) or the big Lebkuchenherz (Wasen). */
  banner: number;
}

/**
 * Plans a crowd for the street ridden at `speeds` (see the module comment
 * for what it guarantees), or null when bouncing across would not be fair
 * there (a pinned crawl). A resumable generator like patterns.ts planSteps;
 * its rng draws never depend on the work budget.
 */
export function* planCrowd(rng: Rng, speeds: number[], options: CrowdOptions = {}): Generator<void, Pattern | null> {
  const fast = Math.max(...speeds);
  const [least, most] = options.kidMode ? CROWD_HEADS.kid : CROWD_HEADS.adult;
  const heads = rng.int(least, most);
  const looks: Looks = {
    theme: rng.chance(0.5) ? 'vfb' : 'wasen',
    variants: Array.from({ length: heads }, () => rng.int(0, 1)),
    banner: rng.int(1, heads - 2),
  };
  const gap = Math.round(CROWD_SPACING_SECONDS * ((Math.min(...speeds) + fast) / 2));
  const pattern = crowdRow(looks, heads, gap, fast);
  if (!(yield* bouncesFair(pattern, speeds, options))) return null;
  yield* addGuideStars(pattern, Math.min(...speeds), options);
  return pattern;
}

/** Stars along the human line across the crowd at `slow` px/s: the approach jump and every bounce until the landing. */
function* addGuideStars(pattern: Pattern, slow: number, options: CrowdOptions): Generator<void, void> {
  const solver = new Solver(courseOf(pattern), slow, { stomps: true, budget: options.budget });
  const jump = yield* resumable(() => solver.bestJump(groundBody(), HUMAN_HOLDS, options.window ?? LATE_TAKEOFF_WINDOW));
  if (!jump) return;
  const path = jump.path.slice(Math.floor(jump.path.length * 0.1), Math.ceil(jump.path.length * 0.9));
  const stars = spreadStars(path, STAR_SPACING, MAX_STARS).map((p): Piece => ({ kind: 'star', ...starRect(p.x, p.y) }));
  pattern.pieces.push(...asArc(stars, 'arc'));
  for (const star of stars) pattern.length = Math.max(pattern.length, star.x + STAR_SPACING);
}

/** A row of `n` fans `gap` apart after the crowd's run-up (at `fast` px/s), with the free street after it. */
export function crowdRow(looks: Looks, n: number, gap: number, fast: number): Pattern {
  const lead = Math.round(CROWD_LEAD_SECONDS * fast);
  const kind = KIND[looks.theme];
  const pieces: Piece[] = [];
  for (let seat = 0; seat < n; seat++) {
    const rect = obstacleRect(kind, lead + seat * gap);
    const data: Piece['data'] = { walk: 0, sway: 0, phase: 0, ax: rect.x, variant: looks.variants[seat] ?? 0, [CROWD_KEY]: looks.theme, seat, seats: n, gap };
    if (seat === looks.banner) data.banner = true;
    pieces.push({ kind, ...rect, data });
  }
  const last = pieces[n - 1]!;
  return { name: CROWD_TEMPLATE, pieces, length: last.x + last.w + Math.round(CROWD_ROOM_SECONDS * fast) };
}

/** Bouncing head to head is human-fair at every speed, also after the previous pattern's end. */
function* bouncesFair(pattern: Pattern, speeds: number[], options: CrowdOptions): Generator<void, boolean> {
  const budget = options.budget;
  const window = options.window ?? LATE_TAKEOFF_WINDOW;
  const before = options.before ?? [];
  const courses = [courseOf(pattern)];
  if (before.length > 0) courses.push(courseAcross(pattern, before, Math.round(CROWD_LEAD_SECONDS * Math.max(...speeds))));
  for (const course of courses) {
    for (const v of speeds) {
      const bounce = new Solver(course, v, { stomps: true, budget });
      if (!(yield* resumable(() => bounce.fair(HUMAN_HOLDS, window)))) return false;
    }
  }
  return true;
}
