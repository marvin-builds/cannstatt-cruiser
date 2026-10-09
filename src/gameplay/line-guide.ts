/**
 * Guiding stars for a grind line (combo patterns, combos.ts): follows the
 * solver's human line through the pattern, jump by jump (Solver.bestJump with
 * the human margin: it grinds only where that window is wide enough), from
 * the street onto a rail, from that rail onto the next, and so on, and puts
 * stars along the airborne arcs and in a row on top of every ridden rail.
 * A player who follows the stars rides the combo; one who ignores them
 * rides the street. It asks the planner's solvers (patterns.ts), whose
 * fairness searches are done by then, so the guide costs little more.
 */
import { GROUND_Y } from '../core/config';
import { HITBOX_H } from '../player/tuning';
import { isGrindable } from './catalogue';
import type { Piece } from './course';
import type { Margin } from './fairness';
import { groundBody, railBody } from './jumpsim';
import { LEDGE_FRONT_REACH } from './rules';
import { resumable, type Solver } from './solver';

export interface Point {
  x: number;
  y: number;
}

/** Most jumps a line follows. */
const MAX_JUMPS = 4;
/** How far above a ridden rail's top the star row floats: the middle of the grinding skater's body. */
const ROW_LIFT = Math.round(HITBOX_H.standing / 2);
/** Spacing of the candidate points along a rail row. */
const ROW_STEP = 4;
/** Stars stay this far from a rail's ends (a late landing, the roll off the end). */
const ROW_INSET = 8;

/**
 * The points (pattern space) a star line through `pieces` may use, in riding
 * order: hitbox centres of the line's jumps (their middle part) and of the
 * grinds on the rails in between, with the human `margin`. `solverOn(null)`
 * is the pattern's solver from the street (course x 0 = pattern x 0),
 * `solverOn(top)` the one from grinding `top` (course x 0 = its start);
 * `step` is the scroll per tick of their pace.
 */
export function* lineGuide(pieces: Piece[], solverOn: (top: Piece | null) => Solver, step: number, margin: Margin): Generator<void, Point[]> {
  const tops = pieces.filter((p) => isGrindable(p.kind));
  const points: Point[] = [];
  let top: Piece | null = null;
  for (let i = 0; i < MAX_JUMPS; i++) {
    const solver = solverOn(top);
    const origin = top?.x ?? 0;
    const start = top ? railBody(top.y, top.w) : groundBody();
    const jump = yield* resumable(() => solver.bestJump(start, margin.holds, margin.window));
    if (!jump || jump.path.length === 0) break;
    const path = jump.path.map((p) => ({ x: p.x + origin, y: p.y }));
    points.push(...path.slice(Math.floor(path.length * 0.15), Math.ceil(path.length * 0.85)));
    if (!jump.grinds) break;
    const last = path[path.length - 1]!;
    const land = last.x + step;
    const next = landedOn(tops, land, last.y);
    if (!next || next === top) break;
    for (let x = land + ROW_INSET; x <= next.x + next.w - ROW_INSET; x += ROW_STEP) points.push({ x, y: next.y - ROW_LIFT });
    top = next;
  }
  return points;
}

/** The grind top the line lands on at pattern x `x`, coming down from hitbox centre height `y`: the highest one below it. */
function landedOn(tops: Piece[], x: number, y: number): Piece | null {
  const under = tops.filter((t) => t.x - LEDGE_FRONT_REACH <= x && x <= t.x + t.w && t.y >= y);
  return under.reduce<Piece | null>((best, t) => (!best || t.y < best.y ? t : best), null);
}

/** Stars evenly spread over `points` (in riding order): at least `spacing` apart, at most `max`, never at street level. */
export function spreadStars(points: Point[], spacing: number, max: number): Point[] {
  const usable = points.filter((p) => p.y <= GROUND_Y - 6);
  if (usable.length === 0) return [];
  const span = usable[usable.length - 1]!.x - usable[0]!.x;
  const step = Math.max(spacing, span / (max - 1));
  const stars: Point[] = [];
  let lastX = -Infinity;
  for (const p of usable) {
    if (p.x - lastX < step - 0.5 || stars.length >= max) continue;
    lastX = p.x;
    stars.push(p);
  }
  return stars;
}
