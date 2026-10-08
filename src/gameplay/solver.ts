/**
 * Clearability solver: decides whether a course of obstacles, rails, ledges
 * (grindable obstacles) and moving people can be passed without a crash using
 * the player's real jump arcs (jumpsim.ts) at a given pace (scroll speed and
 * jump scale per tick), picks the most forgiving first jump (used to place
 * guiding stars and by the playtest bots) and measures how wide its take-off
 * window is (the human margin, see fairness.ts). With `stomps` on, landing on
 * a person's head is a valid path that bounces (the spawner leaves it off, so
 * no pattern ever requires a stomp).
 *
 * With a `budget` every simulated tick costs one unit, and the search
 * throws OUT_OF_WORK once it runs out. Caches and finished results are kept,
 * so calling the same method again (with new budget) resumes where it
 * stopped and ends with the same answer: the spawner plans patterns over
 * several game ticks this way (spawner.ts).
 *
 * Every search ends within HORIZON ticks, at any speed (at a standstill
 * nothing passes), and none recurses per tick, so no course or speed can
 * overflow the call stack. Flights step two scratch cursors in place: only
 * the nodes kept in the memos are allocated.
 *
 * Course space: x = 0 is the player's x at tick 0, so the player moves right by
 * speed * dt per tick; y is screen space. The player starts supported (on the
 * ground, or on a rail via `start`).
 */
import { TICK_DT } from '../core/config';
import type { Rect } from '../types';
import { type Body, copyBody, copyInto, groundBody, hitboxInto, hitboxOf, type MutableBody, snapToRailInto, stepBodyInto, stompInto } from './jumpsim';
import { HITBOX_W, MAX_JUMP_HOLD } from '../player/tuning';
import { type Motion, motionOffset } from './motion';
import { type Feet, landsOnHead, landsOnLedge, landsOnRail, overlaps, pastLedge } from './rules';

/** A grindable obstacle: landing on `top` from above grinds it, riding into `box` crashes. */
export interface Ledge {
  top: Rect;
  box: Rect;
}

/** A moving obstacle: `box` at rest, shifted by motionOffset(motion, anchor - player x) every tick. */
export interface Mover {
  box: Rect;
  anchor: number;
  motion: Motion;
}

export interface Course {
  /** Collision boxes of ground obstacles. */
  obstacles: Rect[];
  /** Collision boxes of overhead obstacles (passed by ducking on the ground). */
  overhead: Rect[];
  /** Rails: top edge y, span x..x+w. */
  rails: Rect[];
  ledges?: Ledge[];
  movers?: Mover[];
  /** The player's hitbox must get fully past this x... */
  goal: number;
  /** ...and touch the ground again before its contact x passes this. */
  limit: number;
}

export interface Jump {
  /** Ticks to wait before pressing. */
  tick: number;
  /** Ticks to keep the action down. */
  hold: number;
  /** Lands on a rail. */
  grinds: boolean;
  /** Hitbox centres while airborne, in course space. */
  path: { x: number; y: number }[];
}

/** How the course scrolls past the player: course x after `tick` ticks, and the jump scale at a tick. */
export interface Pace {
  x(tick: number): number;
  jumpScale(tick: number): number;
}

/** A fixed scroll speed and jump scale (1 = normal, CHILL_JUMP_SCALE while chilled). */
export function constantPace(speed: number, jumpScale = 1): Pace {
  const step = speed * TICK_DT;
  return { x: (tick) => tick * step, jumpScale: () => jumpScale };
}

/** Hold lengths the solver tries (1 = tap ... 20 = full hold). */
export const HOLDS = [1, 3, 6, 9, 12, 16, 20] as const;
/** Obstacles are grown by this much to absorb sub-tick phase differences. */
const SAFETY = 1;
/** Give up on a single flight after this many ticks. */
const MAX_FLIGHT = 240;
/** Node key layout (keyOf): ticks, then supports (0 = ground), then stomped bits; jump keys add the hold. */
const KEY_TICKS = 1 << 14;
/**
 * No search goes past this tick (4.5 minutes of riding, the most node keys
 * can tell apart): every search ends at any speed. At a standstill or a crawl
 * that cannot reach the goal by then the answer is a quick no (`hopeless`).
 */
const HORIZON = KEY_TICKS - 1;
const KEY_SUPPORTS = 1 << 8;
const KEY_HOLDS = 64;
/** Ticks of a full press: holding longer adds no height (MAX_JUMP_HOLD), so longer holds fly like it. */
const FULL_HOLD = Math.ceil(MAX_JUMP_HOLD / TICK_DT);
/** Any rail landing window beats every ground landing window. */
const GRIND_BONUS = 10_000;

/** Work units left (one per simulated tick); the solver throws OUT_OF_WORK below 0. Shared by several solvers. */
export interface WorkBudget {
  left: number;
}

/** Thrown by a budgeted solver whose budget ran out; retry later with new budget. */
export const OUT_OF_WORK = new Error('solver: out of work budget');

export interface SolverOptions {
  /** Landing on a person's head bounces (stomp event) instead of crashing. Default off. */
  stomps?: boolean;
  /** Work budget (see the class comment). Default: unlimited. */
  budget?: WorkBudget;
}

interface Node {
  tick: number;
  body: Body;
  /** Bit i set: mover i was stomped and is harmless. */
  stomped: number;
}

/** Consecutive take-off ticks with one hold whose first jump passes the course. */
interface Window {
  hold: number;
  ticks: number[];
  grinds: boolean;
}

/** Where a jump (or fall) is supported again. */
type Flight = Node;

/** The take-off nodes from a supported node and which of their flights count (see takeoffs). */
interface Takeoffs {
  nodes: Node[];
  useful: (f: Flight) => boolean;
}

export class Solver {
  private readonly pace: Pace;
  private readonly obstacles: Rect[];
  private readonly ledges: Ledge[];
  /** Movers with their crash box grown by SAFETY and the exact `rest` box for head landings. */
  private readonly movers: (Mover & { rest: Rect })[];
  private readonly rails: Rect[];
  private readonly stomps: boolean;
  private readonly budget: WorkBudget | null;
  private readonly memo = new Map<number, boolean>();
  /** ridesThrough and takeoffs per node (they walk many cached ticks; repeated walks dominated the planning time). */
  private readonly rideMemo = new Map<number, boolean>();
  private readonly takeoffMemo = new Map<number, Takeoffs>();
  /** fairJudge per (holds, window, spread), with its memo: kept, so a resumed fair() check skips finished work. */
  private readonly fairJudges = new Map<string, (node: Node) => boolean>();
  /** wait() and jump() results per node (and hold): the searches visit the same nodes many times. */
  private readonly waits = new Map<number, Node | null>();
  private readonly jumps = new Map<number, Flight | null>();
  /** Supports the body can ride (rails and ledge tops), by index in node keys; grows for rails not in the course. */
  private readonly supports: { top: number; end: number }[];
  /** The pace cannot carry the player past the goal within HORIZON (a standstill or a crawl): nothing passes. */
  private readonly hopeless: boolean;
  /** ridesThrough's keys on the way (reused: it runs for every fair node). */
  private readonly ridePath: number[] = [];
  /** solve's explicit search stack (one entry per node being searched): node, key, next choice (see solve). */
  private readonly stackNodes: Node[] = [];
  private readonly stackKeys: number[] = [];
  private readonly stackChoices: number[] = [];

  constructor(
    private readonly course: Course,
    pace: number | Pace,
    options: SolverOptions = {},
  ) {
    this.pace = typeof pace === 'number' ? constantPace(pace) : pace;
    this.obstacles = [...course.obstacles, ...course.overhead].map(grow);
    this.ledges = (course.ledges ?? []).map((l) => ({ top: l.top, box: grow(l.box) }));
    this.movers = (course.movers ?? []).map((m) => ({ ...m, box: grow(m.box), rest: m.box }));
    this.rails = [...course.rails, ...this.ledges.map((l) => l.top)];
    this.supports = this.rails.map((r) => ({ top: r.y, end: r.x + r.w }));
    this.stomps = options.stomps ?? false;
    this.budget = options.budget ?? null;
    this.hopeless = this.x(HORIZON) - HITBOX_W / 2 <= course.goal;
  }

  /** Whether the course can be passed from `start` (default: on the ground). */
  solvable(start: Body = groundBody()): boolean {
    return this.solve({ tick: 0, body: start, stomped: 0 });
  }

  /** Pressing after `tick` ticks of riding, holding `hold` ticks, passes the course. */
  jumpWorks(tick: number, hold: number, start: Body = groundBody()): boolean {
    const node = this.rideTo(start, tick);
    const flight = node && this.jump(node, hold);
    return !!flight && this.solve(flight);
  }

  /**
   * The most forgiving first jump: the middle of the widest window of
   * take-off ticks (per hold) that still passes the course, preferring rail
   * landings. Null when nothing works, or when riding on passes and no rail
   * can be reached. With a `humanWindow`, plans like a human: the jump must
   * land where the rest is fair (see fair) for `holds` and that window, and
   * a rail landing is preferred only when its window is that wide (a human
   * skips a grind too tight to hit).
   */
  bestJump(start: Body = groundBody(), holds: readonly number[] = HOLDS, humanWindow = 0): Jump | null {
    const passes = humanWindow > 0 ? this.fairJudge(holds, humanWindow) : undefined;
    let best: { score: number; tick: number; hold: number } | null = null;
    for (const w of this.windows({ tick: 0, body: start, stomped: 0 }, holds, passes)) {
      const score = w.ticks.length + (w.grinds && w.ticks.length >= humanWindow ? GRIND_BONUS : 0);
      if (!best || score > best.score) best = { score, tick: w.ticks[w.ticks.length >> 1]!, hold: w.hold };
    }
    if (!best) return null;
    const { tick, hold } = best;
    const takeoff = this.rideTo(start, tick)!;
    const flight = this.jump(takeoff, hold)!;
    if (!flight.body.onRail && this.ridesThrough({ tick: 0, body: start, stomped: 0 })) return null;
    // Flown again for its path: the cached flights keep none (most are never drawn).
    const path: Jump['path'] = [];
    this.fly(takeoff, hold, true, path);
    return { tick, hold, grinds: flight.body.onRail, path };
  }

  /**
   * The human margin: the most consecutive take-off ticks for one of `holds`
   * whose first jump passes the course (0 when no jump does).
   */
  takeoffWindow(holds: readonly number[] = HOLDS, start: Body = groundBody()): number {
    return Math.max(0, ...this.windows({ tick: 0, body: start, stomped: 0 }, holds).map((w) => w.ticks.length));
  }

  /**
   * The human margin for the whole course, not only the first jump: every
   * take-off on the way has a run of >= `window` consecutive ticks with one
   * of `holds` whose jump lands where the rest is fair again (recursively),
   * so a human hitting any tick of that run is never left with a take-off
   * that needs frame-perfect timing or an in-between hold. Riding through
   * (ducking) and rolling off a rail need no timing. With a `spread`, each
   * hold may come out up to `spread` ticks shorter or longer (drunk input,
   * core/drunk.ts drunkWindow): the shortest, the intended and the longest
   * version must all pass at every tick of the run.
   */
  fair(holds: readonly number[], window: number, start: Body = groundBody(), spread = 0): boolean {
    return this.fairJudge(holds, window, spread)({ tick: 0, body: start, stomped: 0 });
  }

  /** Whether the course is fair from a supported node on (see fair), memoised per solver. */
  private fairJudge(holds: readonly number[], window: number, spread = 0): (node: Node) => boolean {
    const id = `${holds.join(',')}|${window}|${spread}`;
    let judge = this.fairJudges.get(id);
    if (!judge) this.fairJudges.set(id, (judge = this.newFairJudge(holds, window, spread)));
    return judge;
  }

  private newFairJudge(holds: readonly number[], window: number, spread: number): (node: Node) => boolean {
    const results = new Map<number, boolean>();
    // Longest hold first: it clears most pieces, so hasRun's search usually ends early.
    const longestFirst = [...holds].sort((a, b) => b - a);
    const fairFrom = (node: Node): boolean => {
      if (this.hopeless || this.x(node.tick) > this.course.limit) return false;
      if (this.passed(node)) return true;
      const key = this.keyOf(node);
      const known = results.get(key);
      if (known !== undefined) return known;
      results.set(key, false);
      try {
        const rolled = node.body.onRail ? this.rollOff(node) : null;
        const ok = this.ridesThrough(node) || (!!rolled && fairFrom(rolled)) || this.hasRun(node, longestFirst, window, spread, fairFrom);
        results.set(key, ok);
        return ok;
      } catch (e) {
        // Out of work: the in-progress mark must not stick as a result.
        results.delete(key);
        throw e;
      }
    };
    return fairFrom;
  }

  /**
   * Whether `window` consecutive take-offs from `from` with one of `holds`
   * (tried in this order) all pass. Tests the last tick of a candidate run
   * first and restarts after any failure, so most ticks of a hopeless
   * stretch are never flown.
   */
  private hasRun(from: Node, holds: readonly number[], window: number, spread: number, passes: (f: Flight) => boolean): boolean {
    const { nodes, useful } = this.takeoffs(from);
    const flies = (node: Node, hold: number) => {
      const flight = this.jump(node, hold);
      return !!flight && useful(flight) && passes(flight);
    };
    for (const hold of holds) {
      const known = new Map<number, boolean>();
      const short = Math.max(HOLDS[0], hold - spread);
      const works = (i: number) => {
        let ok = known.get(i);
        if (ok === undefined) {
          const node = nodes[i]!;
          ok = flies(node, hold) && (spread === 0 || (flies(node, short) && flies(node, hold + spread)));
          known.set(i, ok);
        }
        return ok;
      };
      let first = 0;
      search: while (first + window <= nodes.length) {
        for (let i = first + window - 1; i >= first; i--) {
          if (works(i)) continue;
          first = i + 1;
          continue search;
        }
        return true;
      }
    }
    return false;
  }

  /**
   * Every run of consecutive take-off ticks from `from`, per hold, whose jump
   * `passes` (default: the rest is solvable); a run also ends where grinding
   * starts or stops.
   */
  private windows(from: Node, holds: readonly number[], passes = (f: Flight) => this.solve(f)): Window[] {
    const found: Window[] = [];
    if (this.hopeless) return found;
    const { nodes, useful } = this.takeoffs(from);
    for (const hold of holds) {
      let run: Window = { hold, ticks: [], grinds: false };
      const close = () => {
        if (run.ticks.length > 0) found.push(run);
        run = { hold, ticks: [], grinds: false };
      };
      for (const node of nodes) {
        const flight = this.jump(node, hold);
        if (flight && useful(flight) && passes(flight)) {
          if (run.ticks.length > 0 && flight.body.onRail !== run.grinds) close();
          run.grinds = flight.body.onRail;
          run.ticks.push(node.tick);
        } else close();
      }
      close();
    }
    return found;
  }

  /**
   * The supported nodes riding on from `from` at which a jump can still
   * matter, and which flights are useful: a jump has to happen before the
   * player is past the next piece (the rail being ridden aside), and must
   * land on another rail or past that piece's start, not before it (a
   * useless hop, e.g. in front of an overhead obstacle, which is ducked
   * under, not jumped, or back onto the same rail).
   */
  private takeoffs(from: Node): Takeoffs {
    const key = this.keyOf(from);
    let known = this.takeoffMemo.get(key);
    if (!known) this.takeoffMemo.set(key, (known = this.findTakeoffs(from)));
    return known;
  }

  private findTakeoffs(from: Node): Takeoffs {
    const feet = this.x(from.tick);
    const behind = hitboxOf(from.body, feet).x;
    const ridden = (b: Body, r: Rect) => b.onRail && r.y === b.railTop && r.x + r.w === b.railEnd;
    // A support the board is past can no longer be landed on (pastLedge), even with the body's rear still over it (landed behind a bench).
    const supports = this.rails.filter((r) => !pastLedge(feet, r) && !ridden(from.body, r));
    const pieces = [...this.course.obstacles, ...supports, ...this.movers.map((m) => m.box)].filter((r) => r.x + r.w > behind);
    const lastTakeoff = Math.min(this.course.goal, ...pieces.map((r) => r.x + r.w));
    const firstStart = Math.min(...pieces.map((r) => r.x));
    const sameRail = (f: Flight) => from.body.onRail && f.body.onRail && f.body.railTop === from.body.railTop && f.body.railEnd === from.body.railEnd;
    const nodes: Node[] = [];
    for (let node: Node | null = from; node && !this.passed(node) && this.x(node.tick) <= lastTakeoff; node = this.wait(node)) nodes.push(node);
    return { nodes, useful: (f) => !sameRail(f) && (f.body.onRail || this.x(f.tick) + HITBOX_W / 2 > firstStart) };
  }

  /** Riding on without jumping (ducking where needed, rolling off rails) passes the course. Memoised for every node on the way. */
  private ridesThrough(from: Node): boolean {
    const path = this.ridePath;
    path.length = 0;
    let node: Node | null = from;
    let ok: boolean | undefined;
    while (ok === undefined) {
      if (!node) ok = false;
      else if (this.passed(node)) ok = this.x(node.tick) <= this.course.limit;
      else {
        const key = this.keyOf(node);
        ok = this.rideMemo.get(key);
        if (ok === undefined) {
          path.push(key);
          node = this.wait(node);
        }
      }
    }
    for (const key of path) this.rideMemo.set(key, ok);
    return ok;
  }

  /** Rides a rail to its end and falls off: the next support that is not this rail, or null on a crash. */
  private rollOff(node: Node): Node | null {
    const { railTop, railEnd } = node.body;
    let next: Node | null = node;
    while (next && next.body.onRail && next.body.railTop === railTop && next.body.railEnd === railEnd) next = this.wait(next);
    return next;
  }

  /**
   * A number naming the node (tick, support, stomped people) for the memos:
   * numbers instead of strings, because the searches look nodes up millions
   * of times and string keys were most of the planning garbage.
   */
  private keyOf(node: Node): number {
    const support = node.body.onRail ? this.supportOf(node.body.railTop, node.body.railEnd) + 1 : 0;
    return (node.stomped * KEY_SUPPORTS + support) * KEY_TICKS + node.tick;
  }

  private supportOf(top: number, end: number): number {
    const all = this.supports;
    for (let i = 0; i < all.length; i++) if (all[i]!.top === top && all[i]!.end === end) return i;
    all.push({ top, end });
    return all.length - 1;
  }


  /**
   * Whether the course can be passed from a supported node: some jump (each
   * of HOLDS, in order) or else waiting a tick leads to a node from which it
   * can. A depth-first search on an explicit stack, not one call per node:
   * waiting walks the course tick by tick, thousands of ticks deep at low
   * speeds. Every node searched is memoised.
   */
  private solve(root: Node): boolean {
    const settled = this.settled(root);
    if (settled !== undefined) return settled;
    const nodes = this.stackNodes;
    const choices = this.stackChoices;
    const base = nodes.length;
    let result = false;
    this.push(root);
    try {
      while (nodes.length > base) {
        const top = nodes.length - 1;
        // Choices 0..HOLDS.length - 1 jump with that hold, HOLDS.length waits; after that the node fails.
        const choice = choices[top]!;
        if (choice > HOLDS.length) result = false;
        else {
          choices[top] = choice + 1;
          const node = nodes[top]!;
          const next = choice < HOLDS.length ? this.jump(node, HOLDS[choice]!) : this.wait(node);
          if (!next) continue;
          const known = this.settled(next);
          if (known === undefined) this.push(next);
          if (!known) continue;
          result = true;
        }
        // The top node is decided; a success decides every node below it too.
        do this.pop(result);
        while (result && nodes.length > base);
      }
      return result;
    } catch (e) {
      // Out of work: the in-progress marks must not stick as results.
      while (nodes.length > base) {
        this.memo.delete(this.stackKeys.pop()!);
        nodes.pop();
        choices.pop();
      }
      throw e;
    }
  }

  /** solve's answer for a node without searching (out of time, past the goal, memoised), or undefined. */
  private settled(node: Node): boolean | undefined {
    if (this.hopeless || this.x(node.tick) > this.course.limit) return false;
    if (this.passed(node)) return true;
    return this.memo.get(this.keyOf(node));
  }

  /** Puts a node on solve's stack, marked as failing while in progress. */
  private push(node: Node): void {
    const key = this.keyOf(node);
    this.memo.set(key, false);
    this.stackNodes.push(node);
    this.stackKeys.push(key);
    this.stackChoices.push(0);
  }

  /** Takes the top node off solve's stack with its result. */
  private pop(result: boolean): void {
    this.memo.set(this.stackKeys.pop()!, result);
    this.stackNodes.pop();
    this.stackChoices.pop();
  }

  private passed(node: Node): boolean {
    return node.body.grounded && hitboxInto(node.body, this.x(node.tick), scratchPassed).x > this.course.goal;
  }

  private x(tick: number): number {
    return this.pace.x(tick);
  }

  /** Rides without input for `ticks` ticks; null on a crash, or when not supported at that tick (falling off a rail end). */
  private rideTo(start: Body, ticks: number): Node | null {
    let node: Node | null = { tick: 0, body: start, stomped: 0 };
    // A wait that rolls off a rail end returns after the fall, several ticks on.
    while (node && node.tick < ticks) node = this.wait(node);
    return node && node.tick === ticks ? node : null;
  }

  /** One tick without input from a supported node; rolling off a rail end falls to the next support. */
  private wait(node: Node): Node | null {
    const key = this.keyOf(node);
    if (this.waits.has(key)) return this.waits.get(key)!;
    let found: Node | null = null;
    if (this.advance(this.load(cursorA, node), false, false, cursorB)) {
      found = isSupported(cursorB.body) ? nodeOf(cursorB) : this.flyFrom(cursorB, 0, false);
    }
    this.waits.set(key, found);
    return found;
  }

  /** Presses now from a supported node and holds `hold` ticks, until supported again; null on a crash. */
  private jump(node: Node, held: number): Flight | null {
    const hold = Math.min(held, FULL_HOLD);
    const key = this.keyOf(node) * KEY_HOLDS + hold;
    if (this.jumps.has(key)) return this.jumps.get(key)!;
    const flight = this.fly(node, hold);
    this.jumps.set(key, flight);
    return flight;
  }

  /**
   * Jumps (press now, hold `hold` ticks) or keeps falling, until supported
   * again; null on a crash. With a `path`, records the hitbox centres while
   * airborne into it.
   */
  private fly(node: Node, hold: number, press = true, path?: Jump['path']): Flight | null {
    return this.flyFrom(this.load(cursorA, node), hold, press, path);
  }

  /**
   * fly from a scratch cursor: the airborne ticks step between the two
   * scratch cursors, so only the landing allocates (its node).
   */
  private flyFrom(start: Cursor, hold: number, press: boolean, path?: Jump['path']): Flight | null {
    let from = start;
    let to = start === cursorA ? cursorB : cursorA;
    for (let i = 0; i < MAX_FLIGHT; i++) {
      if (!this.advance(from, press && i === 0, i < hold, to)) return null;
      const landed = to;
      to = from;
      from = landed;
      if (isSupported(from.body)) return nodeOf(from);
      if (path) {
        const box = hitboxOf(from.body, this.x(from.tick));
        path.push({ x: box.x + box.w / 2, y: box.y + box.h / 2 });
      }
    }
    return null;
  }

  /** Copies a node into a scratch cursor; returns the cursor. */
  private load(cursor: Cursor, node: Node): Cursor {
    cursor.tick = node.tick;
    copyInto(cursor.body, node.body);
    cursor.stomped = node.stomped;
    return cursor;
  }

  /**
   * One tick in the live order: player movement, scroll, rail landing, head
   * landing (stomps on), obstacle check, written into `out` (false on a
   * crash). Ducks when standing would crash (a ducked body on the ground is
   * never hit where a standing one is not).
   */
  private advance(from: Cursor, press: boolean, held: boolean, out: Cursor): boolean {
    return this.advanceAs(from, press, held, false, out) || (!press && this.advanceAs(from, press, held, true, out));
  }

  private advanceAs(from: Cursor, press: boolean, held: boolean, duck: boolean, out: Cursor): boolean {
    if (from.tick >= HORIZON) return false;
    if (this.budget && --this.budget.left < 0) throw OUT_OF_WORK;
    // The hot loop of every search: index loops and scratch objects, so a simulated tick allocates nothing.
    const body = stepBodyInto(out.body, from.body, this.x(from.tick), press, held, duck, this.pace.jumpScale(from.tick));
    if (duck && !body.ducking) return false;
    const tick = from.tick + 1;
    const x = this.x(tick);
    const box = hitboxInto(body, x, scratchBox);
    let stomped = from.stomped;
    if (!body.onRail) {
      scratchFeet.x = x;
      scratchFeet.y = body.y;
      scratchFeet.vy = body.vy;
      scratchFeet.supported = body.grounded;
      const rail = this.railLandedOn(scratchFeet);
      if (rail) snapToRailInto(body, rail.y, rail.x + rail.w);
      else if (this.stomps) {
        for (let j = 0; j < this.movers.length; j++) {
          const m = this.movers[j]!;
          if (stomped & (1 << j) || !landsOnHead(scratchFeet, box, at(m.rest, m, x), x - this.x(from.tick))) continue;
          stomped |= 1 << j;
          stompInto(body);
          break;
        }
      }
    }
    for (let i = 0; i < this.obstacles.length; i++) if (overlaps(box, this.obstacles[i]!)) return false;
    for (let i = 0; i < this.ledges.length; i++) {
      const l = this.ledges[i]!;
      if (!ridesOn(body, l.top) && !pastLedge(x, l.top) && overlaps(box, l.box)) return false;
    }
    for (let j = 0; j < this.movers.length; j++) {
      const m = this.movers[j]!;
      if (!(stomped & (1 << j)) && overlaps(box, at(m.box, m, x))) return false;
    }
    out.tick = tick;
    out.stomped = stomped;
    return true;
  }

  /** The first rail, then ledge top, the falling feet land on this tick (or null). */
  private railLandedOn(feet: Feet): Rect | null {
    const rails = this.course.rails;
    for (let i = 0; i < rails.length; i++) if (landsOnRail(feet, rails[i]!)) return rails[i]!;
    for (let i = 0; i < this.ledges.length; i++) if (landsOnLedge(feet, this.ledges[i]!.top)) return this.ledges[i]!.top;
    return null;
  }
}

/** A node being simulated in place (the solver's scratch cursors). */
interface Cursor {
  tick: number;
  body: MutableBody;
  stomped: number;
}

/**
 * Scratch objects of the simulation (single-threaded, never kept): two
 * cursors that flights step between, and the boxes and feet of advanceAs and
 * passed.
 */
const cursorA: Cursor = { tick: 0, body: copyBody(groundBody()), stomped: 0 };
const cursorB: Cursor = { tick: 0, body: copyBody(groundBody()), stomped: 0 };
const scratchBox: Rect = { x: 0, y: 0, w: 0, h: 0 };
const scratchPassed: Rect = { x: 0, y: 0, w: 0, h: 0 };
const scratchFeet: Feet = { x: 0, y: 0, vy: 0, supported: false };
const scratchMover: Rect = { x: 0, y: 0, w: 0, h: 0 };

/** A kept node with its own copy of the cursor's body. */
function nodeOf(cursor: Cursor): Node {
  return { tick: cursor.tick, body: copyBody(cursor.body), stomped: cursor.stomped };
}

function isSupported(body: Body): boolean {
  return body.grounded || body.onRail;
}

/** A mover's `box` where its motion has carried it when the player is at course x `x` (in a scratch rect). */
function at(box: Rect, m: Mover, x: number): Rect {
  scratchMover.x = box.x + motionOffset(m.motion, m.anchor - x);
  scratchMover.y = box.y;
  scratchMover.w = box.w;
  scratchMover.h = box.h;
  return scratchMover;
}

/** The box grown by SAFETY on every side. */
function grow(o: Rect): Rect {
  return { x: o.x - SAFETY, y: o.y - SAFETY, w: o.w + 2 * SAFETY, h: o.h + 2 * SAFETY };
}

/** The body rides on this ledge's top (it never crashes into the ledge it grinds). */
function ridesOn(body: Body, top: Rect): boolean {
  return body.onRail && body.railTop === top.y && body.railEnd === top.x + top.w;
}
