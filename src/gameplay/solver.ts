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
 * Course space: x = 0 is the player's x at tick 0, so the player moves right by
 * speed * dt per tick; y is screen space. The player starts supported (on the
 * ground, or on a rail via `start`).
 */
import { TICK_DT } from '../core/config';
import type { Rect } from '../types';
import { type Body, groundBody, hitboxOf, snapToRail, stepBody, stompBody } from './jumpsim';
import { HITBOX_W } from '../player/tuning';
import { type Motion, motionOffset } from './motion';
import { landsOnHead, landsOnRail, overlaps } from './rules';

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
/** Any rail landing window beats every ground landing window. */
const GRIND_BONUS = 10_000;

export interface SolverOptions {
  /** Landing on a person's head bounces (stomp event) instead of crashing. Default off. */
  stomps?: boolean;
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

interface Flight extends Node {
  path: { x: number; y: number }[];
}

export class Solver {
  private readonly pace: Pace;
  private readonly obstacles: Rect[];
  private readonly ledges: Ledge[];
  /** Movers with their crash box grown by SAFETY and the exact `rest` box for head landings. */
  private readonly movers: (Mover & { rest: Rect })[];
  private readonly rails: Rect[];
  private readonly stomps: boolean;
  private readonly memo = new Map<string, boolean>();

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
    this.stomps = options.stomps ?? false;
  }

  /** Whether the course can be passed from `start` (default: on the ground). */
  solvable(start: Body = groundBody()): boolean {
    return this.solve({ tick: 0, body: start, stomped: 0 });
  }

  /** Pressing after `tick` ticks of riding, holding `hold` ticks, passes the course. */
  jumpWorks(tick: number, hold: number, start: Body = groundBody()): boolean {
    const node = this.rideTo(start, tick);
    const flight = node && this.fly(node, hold);
    return !!flight && this.solve(flight);
  }

  /**
   * The most forgiving first jump: the middle of the widest window of
   * take-off ticks (per hold) that still passes the course, preferring rail
   * landings. Null when nothing works, or when riding on passes and no rail
   * can be reached.
   */
  bestJump(start: Body = groundBody(), holds: readonly number[] = HOLDS): Jump | null {
    let best: { score: number; tick: number; hold: number } | null = null;
    for (const w of this.windows(start, holds)) {
      const score = w.ticks.length + (w.grinds ? GRIND_BONUS : 0);
      if (!best || score > best.score) best = { score, tick: w.ticks[w.ticks.length >> 1]!, hold: w.hold };
    }
    if (!best) return null;
    const { tick, hold } = best;
    const flight = this.fly(this.rideTo(start, tick)!, hold)!;
    if (!flight.body.onRail && this.ridesThrough(start)) return null;
    return { tick, hold, grinds: flight.body.onRail, path: flight.path };
  }

  /**
   * The human margin: the most consecutive take-off ticks for one of `holds`
   * whose first jump passes the course (0 when no jump does).
   */
  takeoffWindow(holds: readonly number[] = HOLDS, start: Body = groundBody()): number {
    return Math.max(0, ...this.windows(start, holds).map((w) => w.ticks.length));
  }

  /** Every run of consecutive working take-off ticks, per hold (a run also ends where grinding starts or stops). */
  private windows(start: Body, holds: readonly number[]): Window[] {
    // A first jump has to happen before the player is past the first piece,
    // and must not land before reaching it (a useless hop, e.g. in front of an
    // overhead obstacle, which is ducked under, not jumped).
    const pieces = [...this.course.obstacles, ...this.rails, ...this.movers.map((m) => m.box)];
    const lastTakeoff = Math.min(this.course.goal, ...pieces.map((r) => r.x + r.w));
    const firstStart = Math.min(...pieces.map((r) => r.x));
    const useful = (f: Flight) => f.body.onRail || this.x(f.tick) + HITBOX_W / 2 > firstStart;
    const found: Window[] = [];
    for (const hold of holds) {
      let run: Window = { hold, ticks: [], grinds: false };
      const close = () => {
        if (run.ticks.length > 0) found.push(run);
        run = { hold, ticks: [], grinds: false };
      };
      let node: Node | null = { tick: 0, body: start, stomped: 0 };
      while (node && !this.passed(node) && this.x(node.tick) <= lastTakeoff) {
        const flight = this.fly(node, hold);
        if (flight && useful(flight) && this.solve(flight)) {
          if (run.ticks.length > 0 && flight.body.onRail !== run.grinds) close();
          run.grinds = flight.body.onRail;
          run.ticks.push(node.tick);
        } else close();
        node = this.wait(node);
      }
      close();
    }
    return found;
  }

  private ridesThrough(start: Body): boolean {
    let node: Node | null = { tick: 0, body: start, stomped: 0 };
    while (node && !this.passed(node)) node = this.wait(node);
    return !!node && this.x(node.tick) <= this.course.limit;
  }

  private solve(node: Node): boolean {
    if (this.x(node.tick) > this.course.limit) return false;
    if (this.passed(node)) return true;
    const key = `${node.tick}|${node.body.onRail ? `${node.body.railTop}:${node.body.railEnd}` : 'g'}|${node.stomped}`;
    const known = this.memo.get(key);
    if (known !== undefined) return known;
    this.memo.set(key, false);
    let ok = false;
    for (const hold of HOLDS) {
      const flight = this.fly(node, hold);
      if (flight && this.solve(flight)) {
        ok = true;
        break;
      }
    }
    if (!ok) {
      const next = this.wait(node);
      ok = !!next && this.solve(next);
    }
    this.memo.set(key, ok);
    return ok;
  }

  private passed(node: Node): boolean {
    return node.body.grounded && hitboxOf(node.body, this.x(node.tick)).x > this.course.goal;
  }

  private x(tick: number): number {
    return this.pace.x(tick);
  }

  /** Rides without input for `ticks` ticks; null on a crash or if the support is lost. */
  private rideTo(start: Body, ticks: number): Node | null {
    let node: Node | null = { tick: 0, body: start, stomped: 0 };
    for (let i = 0; i < ticks && node; i++) node = this.wait(node);
    return node;
  }

  /** One tick without input from a supported node; rolling off a rail end falls to the next support. */
  private wait(node: Node): Node | null {
    const next = this.advance(node, false, false);
    if (!next) return null;
    if (next.body.grounded || next.body.onRail) return next;
    return this.fly(next, 0, false);
  }

  /** Jumps (press now, hold `hold` ticks) or keeps falling, until supported again; null on a crash. */
  private fly(node: Node, hold: number, press = true): Flight | null {
    const path: { x: number; y: number }[] = [];
    let current: Node = node;
    for (let i = 0; i < MAX_FLIGHT; i++) {
      const next = this.advance(current, press && i === 0, i < hold);
      if (!next) return null;
      current = next;
      if (current.body.grounded || current.body.onRail) return { ...current, path };
      const box = hitboxOf(current.body, this.x(current.tick));
      path.push({ x: box.x + box.w / 2, y: box.y + box.h / 2 });
    }
    return null;
  }

  /**
   * One tick in the live order: player movement, scroll, rail landing, head
   * landing (stomps on), obstacle check. Ducks when standing would crash (a
   * ducked body on the ground is never hit where a standing one is not).
   */
  private advance(node: Node, press: boolean, held: boolean): Node | null {
    return this.advanceAs(node, press, held, false) ?? (press ? null : this.advanceAs(node, press, held, true));
  }

  private advanceAs(node: Node, press: boolean, held: boolean, duck: boolean): Node | null {
    let body = stepBody(node.body, this.x(node.tick), press, held, duck, this.pace.jumpScale(node.tick));
    if (duck && !body.ducking) return null;
    const tick = node.tick + 1;
    const x = this.x(tick);
    const box = hitboxOf(body, x);
    let stomped = node.stomped;
    if (!body.onRail) {
      const feet = { x, y: body.y, vy: body.vy, supported: body.grounded };
      const rail = this.rails.find((r) => landsOnRail(feet, r));
      if (rail) body = snapToRail(body, rail.y, rail.x + rail.w);
      else if (this.stomps) {
        const i = this.movers.findIndex((m, j) => !(stomped & (1 << j)) && landsOnHead(feet, box, at(m.rest, m, x)));
        if (i >= 0) {
          stomped |= 1 << i;
          body = stompBody(body);
        }
      }
    }
    if (this.obstacles.some((o) => overlaps(box, o))) return null;
    if (this.ledges.some((l) => !ridesOn(body, l.top) && overlaps(box, l.box))) return null;
    if (this.movers.some((m, j) => !(stomped & (1 << j)) && overlaps(box, at(m.box, m, x)))) return null;
    return { tick, body, stomped };
  }
}

/** A mover's `box` where its motion has carried it when the player is at course x `x`. */
function at(box: Rect, m: Mover, x: number): Rect {
  return { ...box, x: box.x + motionOffset(m.motion, m.anchor - x) };
}

/** The box grown by SAFETY on every side. */
function grow(o: Rect): Rect {
  return { x: o.x - SAFETY, y: o.y - SAFETY, w: o.w + 2 * SAFETY, h: o.h + 2 * SAFETY };
}

/** The body rides on this ledge's top (it never crashes into the ledge it grinds). */
function ridesOn(body: Body, top: Rect): boolean {
  return body.onRail && body.railTop === top.y && body.railEnd === top.x + top.w;
}
