/**
 * Turns pieces (pattern pieces or live entities) into what the clearability
 * solver sees: ground obstacles, overhead obstacles, rails, ledges (grindable
 * obstacles: the bench) and movers (people), in course space where x = 0 is
 * `originX`.
 */
import type { Entity, ObstacleKind, Rect } from '../types';
import { hitBox, isGrindable, isObstacle, isOverhead, isPerson, isRail } from './catalogue';
import { anchorOf, motionOf } from './motion';
import type { Course } from './solver';

export type Piece = Omit<Entity, 'id' | 'done'>;

function boxAt(p: Piece, x: number): Rect {
  return hitBox({ kind: p.kind as ObstacleKind, x, y: p.y });
}

/** `limitFor(goal)` gives the x by which the player must be back on the ground. */
export function buildCourse(pieces: readonly Piece[], originX: number, limitFor: (goal: number) => number): Course {
  const shift = (r: Rect): Rect => ({ x: r.x - originX, y: r.y, w: r.w, h: r.h });
  const course: Course = { obstacles: [], overhead: [], rails: [], ledges: [], movers: [], goal: 0, limit: 0 };
  for (const p of pieces) {
    if (isRail(p.kind)) course.rails.push(shift(p));
    else if (!isObstacle(p.kind)) continue;
    else if (isOverhead(p.kind)) course.overhead.push(shift(boxAt(p, p.x)));
    else if (isGrindable(p.kind)) course.ledges!.push({ top: shift(p), box: shift(boxAt(p, p.x)) });
    else if (isPerson(p.kind) && motionOf(p)) {
      const anchor = anchorOf(p);
      course.movers!.push({ box: shift(boxAt(p, anchor)), anchor: anchor - originX, motion: motionOf(p)! });
    } else course.obstacles.push(shift(boxAt(p, p.x)));
  }
  const ends = [
    ...course.obstacles,
    ...course.overhead,
    ...course.rails,
    ...course.ledges!.map((l) => l.top),
    ...course.movers!.map((m) => m.box),
  ].map((r) => r.x + r.w);
  course.goal = Math.max(0, ...ends);
  course.limit = limitFor(course.goal);
  return course;
}
