/**
 * Clearability solver: decides whether a course of obstacles and rails can be
 * passed without a crash using the player's real jump arcs (jumpsim.ts) at a
 * fixed scroll speed, and picks the most forgiving first jump (used to place
 * guiding stars and by the playtest bot).
 *
 * Course space: x = 0 is the player's x at tick 0, so the player moves right by
 * speed * dt per tick; y is screen space. The player starts supported (on the
 * ground, or on a rail via `start`).
 */
import { TICK_DT } from '../core/config';
import type { Rect } from '../types';
import { type Body, groundBody, hitboxOf, snapToRail, stepBody } from './jumpsim';
import { landsOnRail, overlaps } from './rules';

export interface Course {
  /** Collision boxes. */
  obstacles: Rect[];
  /** Rails: top edge y, span x..x+w. */
  rails: Rect[];
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

/** Hold lengths the solver tries (1 = tap ... 20 = full hold). */
export const HOLDS = [1, 3, 6, 9, 12, 16, 20] as const;
/** Obstacles are grown by this much to absorb sub-tick phase differences. */
const SAFETY = 1;
/** Give up on a single flight after this many ticks. */
const MAX_FLIGHT = 240;
/** Any rail landing window beats every ground landing window. */
const GRIND_BONUS = 10_000;

interface Node {
  tick: number;
  body: Body;
}

interface Flight extends Node {
  path: { x: number; y: number }[];
}

export class Solver {
  private readonly step: number;
  private readonly obstacles: Rect[];
  private readonly memo = new Map<string, boolean>();

  constructor(
    private readonly course: Course,
    speed: number,
  ) {
    this.step = speed * TICK_DT;
    this.obstacles = course.obstacles.map((o) => ({ x: o.x - SAFETY, y: o.y - SAFETY, w: o.w + 2 * SAFETY, h: o.h + 2 * SAFETY }));
  }

  /** Whether the course can be passed from `start` (default: on the ground). */
  solvable(start: Body = groundBody()): boolean {
    return this.solve({ tick: 0, body: start });
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
  bestJump(start: Body = groundBody()): Jump | null {
    let best: { score: number; tick: number; hold: number } | null = null;
    // A first jump has to happen before the player is past the first piece.
    const pieces = [...this.course.obstacles, ...this.course.rails];
    const lastTakeoff = Math.min(this.course.goal, ...pieces.map((r) => r.x + r.w));
    for (const hold of HOLDS) {
      let run: number[] = [];
      let grinds = false;
      const close = () => {
        const score = run.length + (grinds ? GRIND_BONUS : 0);
        if (run.length > 0 && (!best || score > best.score)) best = { score, tick: run[run.length >> 1]!, hold };
        run = [];
      };
      let node: Node | null = { tick: 0, body: start };
      while (node && !this.passed(node) && this.x(node.tick) <= lastTakeoff) {
        const flight = this.fly(node, hold);
        if (flight && this.solve(flight)) {
          const flightGrinds = flight.body.onRail;
          if (run.length > 0 && flightGrinds !== grinds) close();
          grinds = flightGrinds;
          run.push(node.tick);
        } else close();
        node = this.wait(node);
      }
      close();
    }
    if (!best) return null;
    const { tick, hold } = best;
    const flight = this.fly(this.rideTo(start, tick)!, hold)!;
    if (!flight.body.onRail && this.ridesThrough(start)) return null;
    return { tick, hold, grinds: flight.body.onRail, path: flight.path };
  }

  private ridesThrough(start: Body): boolean {
    let node: Node | null = { tick: 0, body: start };
    while (node && !this.passed(node)) node = this.wait(node);
    return !!node && this.x(node.tick) <= this.course.limit;
  }

  private solve(node: Node): boolean {
    if (this.x(node.tick) > this.course.limit) return false;
    if (this.passed(node)) return true;
    const key = `${node.tick}|${node.body.onRail ? `${node.body.railTop}:${node.body.railEnd}` : 'g'}`;
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
    return tick * this.step;
  }

  /** Rides without input for `ticks` ticks; null on a crash or if the support is lost. */
  private rideTo(start: Body, ticks: number): Node | null {
    let node: Node | null = { tick: 0, body: start };
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

  /** One tick in the live order: player movement, scroll, rail landing, obstacle check. */
  private advance(node: Node, press: boolean, held: boolean): Node | null {
    let body = stepBody(node.body, this.x(node.tick), press, held);
    const tick = node.tick + 1;
    const x = this.x(tick);
    const box = hitboxOf(body, x);
    if (!body.onRail) {
      const feet = { x, y: body.y, vy: body.vy, supported: body.grounded };
      const rail = this.course.rails.find((r) => landsOnRail(feet, r));
      if (rail) body = snapToRail(body, rail.y, rail.x + rail.w);
    }
    if (this.obstacles.some((o) => overlaps(box, o))) return null;
    return { tick, body };
  }
}
