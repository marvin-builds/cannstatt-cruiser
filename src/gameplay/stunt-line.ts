/**
 * Designed stunt lines (ROADMAP 27): a kicker on the street launches the
 * skater onto a ledge of the upper level, then the line goes on with gap
 * jumps from ledge to ledge and drops back to the street onto the next
 * kicker, 3-6 pieces in all, with a star trail. A line is one spawn pattern
 * (patterns.ts Pattern, name 'stunt') whose street holds nothing but its
 * kickers: the street path below is always free, and every way off the line
 * (missing a ledge, rolling off, a full jump off the last ledge end) lands
 * before the pattern ends, with the usual runout after it.
 *
 * Generous by construction, checked with the flight simulation (stunt-sim.ts):
 * - each kicker's launch (velocity for the next ledge's height) comes down
 *   onto that ledge at every speed of the range and any tick phase;
 * - each gap needs a jump (it climbs to a higher ledge, or rolling off the
 *   end falls past the lower next one), only with human holds whose arc stays
 *   on screen (gapHolds), and has a human take-off window of >= STUNT_TAKEOFF_WINDOW ticks with one
 *   of the human holds, from 40 % into the ledge on, at the slowest, middle
 *   and fastest speed (else the line drops to the street there instead);
 * - a drop rolls off the ledge end onto the street well before the kicker.
 *
 * planStuntLine is a resumable generator like patterns.ts planSteps: with a
 * work budget it yields when the simulated ticks used it up.
 */
import { GROUND_Y } from '../core/config';
import type { Rng } from '../core/rng';
import type { Rect } from '../types';
import { kickerRect, LEDGE, ledgeRect, starRect, STAR_SIZE } from './catalogue';
import { HUMAN_HOLDS } from './fairness';
import { leadFor, type Pattern, type Piece, runoutFor } from './patterns';
import { KICKER_LIP, launchVelocityFor } from './rules';
import type { WorkBudget } from './solver';
import { copyBody, railBody, stepBodyInto } from './jumpsim';
import { flightPath, fly, jumpWindow, launched, onLedge, stepOf, type Window, windowMiddle, windowTicks } from './stunt-sim';

/** Ticks of take-off a gap jump leaves a human, with one hold (street patterns: 12-14). */
export const STUNT_TAKEOFF_WINDOW = 16;
/** Gap windows are measured from this share into the ledge (launch and gap landings come down before it). */
const ARRIVAL_SHARE = 0.4;
/**
 * Highest the feet may get above the street on a gap jump (px): the skater's
 * head then stays below the HUD plate on every screen. Launches stay lower
 * (ledge height + LAUNCH_CLEARANCE).
 */
export const STUNT_APEX_MAX = 78;

/** Apex (px above the street) of a jump off a ledge `height` up with `hold`, cached. */
const apexes = new Map<number, number>();
function hopApex(height: number, hold: number): number {
  const key = height * 64 + hold;
  let apex = apexes.get(key);
  if (apex === undefined) {
    const b = copyBody(railBody(GROUND_Y - height, Infinity));
    apex = height;
    for (let t = 0; t < 120 && !b.grounded; t++) {
      stepBodyInto(b, b, 0, t === 0, t < hold);
      apex = Math.max(apex, GROUND_Y - b.y);
    }
    apexes.set(key, apex);
  }
  return apex;
}

/**
 * The human holds a gap jump off `ledge` may use: those whose apex stays
 * within STUNT_APEX_MAX (in practice the tap; the half hold off low ledges).
 * The half hold first: the yes/no window check stops at the first that fits.
 */
export function gapHolds(ledge: Rect): number[] {
  const height = GROUND_Y - Math.round(ledge.y);
  return [HUMAN_HOLDS[1]!, HUMAN_HOLDS[2]!, HUMAN_HOLDS[0]!].filter((hold) => hopApex(height, hold) <= STUNT_APEX_MAX);
}
/** Ledge before the earliest launch landing (looks: the skater comes down onto the deck, not its corner). */
const FRONT_ROOM = 12;
/** Seconds of grind on a ledge before a gap (room for the take-off window)... */
const GAP_RUNUP_SECONDS = 0.55;
/** ...seconds of ledge a gap jump lands on... */
const GAP_LANDING_SECONDS = 0.35;
/** ...and seconds of grind on a ledge before a drop or the line's end. */
const FINAL_GRIND_SECONDS = 0.3;
/** A gap usually climbs: the next ledge this much higher (px)... */
const GAP_STEP_UP: [number, number] = [6, 8];
/** ...across this much air (px). */
const GAP_UP_PX: [number, number] = [8, 14];
/** At the top of the level it steps down this much (px)... */
const GAP_STEP_DOWN: [number, number] = [4, 8];
/** ...across a gap of this many seconds of riding, widened by GAP_WIDEN_PX until rolling off the end misses the next ledge. */
const GAP_DOWN_SECONDS: [number, number] = [0.14, 0.22];
const GAP_WIDEN_PX = 4;
/** Street between the drop landing and the next kicker, in seconds of riding (at least KICKER_RUNUP_MIN). */
const KICKER_RUNUP_SECONDS = 0.3;
const KICKER_RUNUP_MIN = 24;
/** The player still jumps this many ticks after rolling off an end (COYOTE_TIME): counted for the worst landing. */
const COYOTE_TICKS = 5;
/** Ticks of the longest hold (a full jump) for the worst landing. */
const FULL_HOLD = 20;
/** Pieces of the longest line. */
const MAX_PIECES = 6;
const MAX_TRAIL_STARS = 3;
const STAR_SPACING = 14;
/** Stars along a ledge: at most this many, from this share of its length to that one (after the launch landings). */
const MAX_LEDGE_STARS = 3;
const LEDGE_STARS_FROM = 0.35;
const LEDGE_STARS_TO = 0.85;
/** Star centres this far above the feet: the middle of the tucked body (also on a grind). */
const STAR_BODY_Y = 13;

/** What follows a ledge: a gap jump to the next ledge, or a drop to the street onto a kicker and its ledge. */
type Segment = 'gap' | 'drop';

/**
 * Line shapes, each with its designs after the opening kicker and ledge
 * (3-6 pieces in all): `stairs` climbs from ledge to ledge with gap jumps
 * only; `hops` drops to the street onto a second kicker right after the first
 * ledge; `mixed` jumps a gap first and then drops onto a kicker. (Three gaps
 * in a row never came out fair within the level's 42-58 px, so stairs stop
 * at two.)
 */
export type StuntShape = 'stairs' | 'hops' | 'mixed';
const DESIGNS: Record<StuntShape, Segment[][]> = {
  stairs: [['gap'], ['gap', 'gap']],
  hops: [['drop'], ['drop', 'gap'], ['drop', 'gap', 'gap']],
  mixed: [['gap', 'drop'], ['gap', 'drop', 'gap']],
};
export const STUNT_SHAPES = Object.keys(DESIGNS) as StuntShape[];

/** The shape of a planned line from its stunt pieces in order (stars are ignored). */
export function shapeOf(pieces: readonly { kind: string }[]): StuntShape {
  const kinds = pieces.filter((p) => p.kind === 'kicker' || p.kind === 'ledge').map((p) => p.kind);
  if (kinds.lastIndexOf('kicker') === 0) return 'stairs';
  return kinds[2] === 'kicker' ? 'hops' : 'mixed';
}

/**
 * The next line shape from a shuffle bag (spawner.ts keeps it per run): an
 * empty `bag` is refilled with every shape in random order, never starting
 * with the `last` one, so the shapes come evenly and never twice in a row.
 */
export function drawShape(rng: Rng, bag: readonly StuntShape[], last: StuntShape | null): { shape: StuntShape; bag: readonly StuntShape[] } {
  let next = bag;
  if (next.length === 0) {
    const round = [...STUNT_SHAPES];
    for (let i = round.length - 1; i > 0; i--) {
      const j = rng.int(0, i);
      [round[i], round[j]] = [round[j]!, round[i]!];
    }
    if (round[0] === last) [round[0], round[1]] = [round[1]!, round[0]!];
    next = round;
  }
  return { shape: next[0]!, bag: next.slice(1) };
}

const clampLength = (w: number): number => Math.max(LEDGE.minLength, Math.min(LEDGE.maxLength, Math.round(w)));
const endOf = (r: Rect): number => r.x + r.w;

class LineBuilder {
  readonly pieces: Piece[] = [];
  readonly stars: Piece[] = [];
  readonly slow: number;
  readonly fast: number;
  readonly mid: number;
  /** Simulated ticks since the last budget check. */
  work = 0;

  constructor(
    readonly rng: Rng,
    speeds: number[],
    private readonly zone: number,
    private readonly line: number,
  ) {
    this.slow = Math.min(...speeds);
    this.fast = Math.max(...speeds);
    this.mid = (this.slow + this.fast) / 2;
  }

  get speeds(): number[] {
    return [this.slow, this.mid, this.fast];
  }

  private readonly count = (ticks: number) => void (this.work += ticks);

  kicker(x: number, ledgeHeight: number): Piece {
    const piece: Piece = { kind: 'kicker', ...kickerRect(Math.round(x)), data: { line: this.line, velocity: launchVelocityFor(ledgeHeight) } };
    this.pieces.push(piece);
    return piece;
  }

  ledge(rect: Rect): Piece {
    const piece: Piece = { kind: 'ledge', ...rect, data: { line: this.line, zone: this.zone, variant: this.rng.int(0, 1) } };
    this.pieces.push(piece);
    return piece;
  }

  /** Earliest and latest x where `kicker`'s launch comes down to `height`, over the speeds and tick phases. */
  launchLandings(kicker: Piece, height: number): [number, number] {
    const deck = ledgeRect(-1e6, height, 2e6);
    let lo = Infinity;
    let hi = -Infinity;
    for (const speed of this.speeds) {
      const step = stepOf(speed);
      for (const phase of [0, 0.25, 0.5, 0.75, 0.999]) {
        const at = kicker.x + kicker.w * KICKER_LIP + phase * step;
        const landing = fly(launched(Number(kicker.data!.velocity)), at, step, [deck]);
        this.count(landing.ticks);
        lo = Math.min(lo, landing.x);
        hi = Math.max(hi, landing.x);
      }
    }
    return [lo, hi];
  }

  /** The ledge a kicker launches onto, long enough for `runup` seconds of grind after the latest landing. */
  launchLedge(kicker: Piece, height: number, runup: number): Piece {
    const [lo, hi] = this.launchLandings(kicker, height);
    const x = Math.floor(lo) - FRONT_ROOM;
    return this.ledge(ledgeRect(x, height, clampLength(hi - x + runup * this.fast)));
  }

  /** The widest take-off window from `from` (arriving ARRIVAL_SHARE into it) onto `to` at `speed` (or the first `enough` long). */
  window(from: Rect, to: Rect, speed: number, enough = Infinity): Window | null {
    return jumpWindow(from, from.x + Math.round(from.w * ARRIVAL_SHARE), stepOf(speed), to, gapHolds(from), this.count, enough);
  }

  /** Whether the gap jump from `from` onto `to` leaves the human window at every speed. */
  fairGap(from: Rect, to: Rect): boolean {
    return this.speeds.every((speed) => windowTicks(this.window(from, to, speed, STUNT_TAKEOFF_WINDOW)) >= STUNT_TAKEOFF_WINDOW);
  }

  /**
   * The ledge after a gap from `from` (`height` up), or null if none is fair:
   * a step up (rolling off can never reach it, so the gap stays short and the
   * tap's window wide) while there is headroom, else a step down across a gap
   * wide enough that rolling off falls past it.
   */
  gapLedge(from: Rect, height: number, runup: number): Rect | null {
    const length = clampLength((GAP_LANDING_SECONDS + runup) * this.fast);
    const up = this.rng.int(...GAP_STEP_UP);
    if (height + up <= LEDGE.maxHeight) {
      const next = ledgeRect(endOf(from) + this.rng.int(...GAP_UP_PX), height + up, length);
      return this.fairGap(from, next) ? next : null;
    }
    const lower = Math.max(LEDGE.minHeight, height - this.rng.int(...GAP_STEP_DOWN));
    let gap = Math.round(this.rng.range(...GAP_DOWN_SECONDS) * this.mid);
    while (this.rollsOnto(from, ledgeRect(endOf(from) + gap, lower, length))) gap += GAP_WIDEN_PX;
    const next = ledgeRect(endOf(from) + gap, lower, length);
    return this.fairGap(from, next) ? next : null;
  }

  /** Whether rolling off the end of `from` (no jump) still comes down onto `to` at some speed. */
  rollsOnto(from: Rect, to: Rect): boolean {
    return this.speeds.some((speed) => {
      const landing = fly(onLedge(from), endOf(from) - 1, stepOf(speed), [to]);
      this.count(landing.ticks);
      return landing.ledge === 0;
    });
  }

  /** Where the skater rolling off `ledge` lands on the street at the fastest speed. */
  dropLanding(ledge: Rect): number {
    const landing = fly(onLedge(ledge), endOf(ledge) - 1, stepOf(this.fast), []);
    this.count(landing.ticks);
    return landing.x;
  }

  /** Stars along a path (pattern x, feet y), at the middle of the tucked body. */
  trail(path: { x: number; y: number }[]): void {
    let lastX = -Infinity;
    let added = 0;
    const middle = path.slice(Math.floor(path.length * 0.2), Math.ceil(path.length * 0.8));
    for (const p of middle) {
      if (added >= MAX_TRAIL_STARS || p.x - lastX < STAR_SPACING) continue;
      const cy = p.y - STAR_BODY_Y;
      if (cy > GROUND_Y - STAR_SIZE) continue;
      lastX = p.x;
      added++;
      this.stars.push({ kind: 'star', ...starRect(p.x, cy) });
    }
  }

  /** Stars along `ledge` where the grinding skater passes, apart from the trail stars already there. */
  ledgeStars(ledge: Rect): void {
    const cy = ledge.y - STAR_BODY_Y;
    let added = 0;
    for (let x = ledge.x + ledge.w * LEDGE_STARS_FROM; x <= ledge.x + ledge.w * LEDGE_STARS_TO && added < MAX_LEDGE_STARS; x += STAR_SPACING) {
      const star = starRect(x, cy);
      if (this.stars.some((s) => Math.abs(s.x - star.x) < STAR_SPACING && Math.abs(s.y - star.y) < STAR_SPACING)) continue;
      added++;
      this.stars.push({ kind: 'star', ...star });
    }
  }
}

/**
 * The street x of the farthest landing off the line at `fast` px/s: a full
 * jump off any ledge's end, even a coyote jump a few ticks after rolling off.
 */
export function stuntWorstLanding(pieces: readonly Piece[], fast: number): number {
  const step = stepOf(fast);
  let worst = 0;
  for (const p of pieces) {
    if (p.kind !== 'ledge') continue;
    worst = Math.max(worst, fly(onLedge(p), endOf(p) - 1, step, [], 0, FULL_HOLD).x + COYOTE_TICKS * step);
  }
  return Math.ceil(worst);
}

/**
 * A stunt line for the speed range `speeds` in `zone` (ledge art), its pieces
 * carrying line id `line`, of `shape` (drawn with `rng` when not given). A
 * gap that cannot be made fair turns into a drop, so the planned shape
 * differs from the asked one now and then.
 */
export function* planStuntLine(rng: Rng, speeds: number[], zone: number, line: number, budget?: WorkBudget, shape?: StuntShape): Generator<void, Pattern> {
  const b = new LineBuilder(rng, speeds, zone, line);
  function* spend(): Generator<void> {
    if (!budget) return;
    budget.left -= b.work;
    b.work = 0;
    if (budget.left <= 0) yield;
  }
  const designs = DESIGNS[shape ?? STUNT_SHAPES[rng.int(0, STUNT_SHAPES.length - 1)]!];
  const segments = designs[rng.int(0, designs.length - 1)]!;
  const runupFor = (i: number) => (segments[i] === 'gap' ? GAP_RUNUP_SECONDS : FINAL_GRIND_SECONDS);
  /** Height of a ledge a kicker launches onto before segment i: low enough for the gaps after it to climb. */
  const launchHeight = (i: number) => {
    let climbs = 0;
    while (segments[i + climbs] === 'gap') climbs++;
    return rng.int(LEDGE.minHeight, Math.max(LEDGE.minHeight, LEDGE.maxHeight - GAP_STEP_UP[1] * climbs));
  };
  /** Pieces the segments from i on add. */
  const piecesFrom = (i: number) => segments.slice(i).reduce((n, seg) => n + (seg === 'gap' ? 1 : 2), 0);
  let height = launchHeight(0);
  let ledge = b.launchLedge(b.kicker(leadFor(b.fast), height), height, runupFor(0));
  yield* spend();
  for (let i = 0; i < segments.length; i++) {
    const runup = runupFor(i + 1);
    if (segments[i] === 'gap') {
      const next = b.gapLedge(ledge, height, runup);
      yield* spend();
      if (next) {
        const from = ledge;
        ledge = b.ledge(next);
        height = GROUND_Y - next.y;
        const w = b.window(from, ledge, b.mid)!;
        b.trail(flightPath(onLedge(from), from.x + Math.round(from.w * ARRIVAL_SHARE), stepOf(b.mid), windowMiddle(w), w.hold));
        continue;
      }
      // No fair gap here: drop to the street onto a kicker instead, unless the line would get too long.
      if (b.pieces.length + 2 + piecesFrom(i + 1) > MAX_PIECES) break;
    }
    height = launchHeight(i + 1);
    const kickerX = b.dropLanding(ledge) + Math.max(KICKER_RUNUP_MIN, KICKER_RUNUP_SECONDS * b.fast);
    ledge = b.launchLedge(b.kicker(kickerX, height), height, runup);
    yield* spend();
  }
  b.trail(flightPath(onLedge(ledge), endOf(ledge) - 1, stepOf(b.mid)));
  for (const piece of b.pieces) if (piece.kind === 'ledge') b.ledgeStars(piece);
  const steps = b.pieces.length;
  b.pieces.forEach((p, i) => Object.assign(p.data!, { step: i + 1, steps }));
  const worst = stuntWorstLanding(b.pieces, b.fast);
  return { name: 'stunt', pieces: [...b.pieces, ...b.stars], length: worst + runoutFor(b.fast) };
}
