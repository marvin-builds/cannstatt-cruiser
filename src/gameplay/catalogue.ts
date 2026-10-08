/**
 * Data for everything gameplay spawns: sizes, vertical placement, collision
 * boxes and points. DOM-free (art lives in art.ts) so the spawner, the
 * clearability solver and tests share exactly these numbers.
 */
import { GROUND_Y } from '../core/config';
import type { Entity, EntityKind, ObstacleKind, RailKind, Rect } from '../types';

export interface ObstacleSpec {
  w: number;
  h: number;
  /**
   * Gap between the ground and the bottom of the sprite. 0 = standing on the
   * ground; > 0 = overhead: it hangs from supports (posts, a pole) that art.ts
   * draws down to the ground and that do not collide. Only a ducked rider
   * fits under it, and it reaches too high to be jumped over.
   */
  elevation: number;
  /** Pixels the sprite reaches below GROUND_Y (gaps cut into the pavement). */
  sink: number;
  /** Collision box relative to the sprite's top-left corner. */
  box: Rect;
  /** Base points for a clean clear. */
  points: number;
  /** Landing on its top edge (the entity's y) from above grinds it like a rail (the bench). */
  grindable?: boolean;
  /**
   * A crash into it sticks the skater head-first into it (the bin): the
   * player draws it around the skater from the crash on, so gameplay removes
   * the hit entity at once.
   */
  swallows?: boolean;
  /** People: ranges the spawner draws their walk / sway from (see motion.ts). */
  motion?: { walk: [number, number]; sway: [number, number] };
}

export const OBSTACLES: Record<ObstacleKind, ObstacleSpec> = {
  bin: { w: 12, h: 18, elevation: 0, sink: 0, box: { x: 1, y: 1, w: 10, h: 17 }, points: 100, swallows: true },
  barrier: { w: 9, h: 21, elevation: 0, sink: 0, box: { x: 1, y: 0, w: 7, h: 21 }, points: 120 },
  // Grind top = the backrest's top edge (entity y); the box below it starts 2 px lower.
  bench: { w: 24, h: 12, elevation: 0, sink: 0, box: { x: 1, y: 2, w: 22, h: 10 }, points: 80, grindable: true },
  planter: { w: 18, h: 17, elevation: 0, sink: 0, box: { x: 1, y: 5, w: 16, h: 12 }, points: 100 },
  curbGap: { w: 20, h: 8, elevation: 0, sink: 6, box: { x: 4, y: 0, w: 12, h: 8 }, points: 60 },
  // People (skater scale, ~26 px): the box is the body only (no hair tip, scarf ends or Maßkrug), low
  // enough for the chilled jump at chill speed.
  vfbFan: { w: 12, h: 26, elevation: 0, sink: 0, box: { x: 3, y: 4, w: 6, h: 22 }, points: 130, motion: { walk: [0.06, 0.12], sway: [0, 0] } },
  wasenGuest: { w: 14, h: 26, elevation: 0, sink: 0, box: { x: 4, y: 4, w: 6, h: 22 }, points: 130, motion: { walk: [0, 0.03], sway: [1.5, 3] } },
  // Overhead: crossbar / arm 64 px up, hanging part ending 23 px above the ground (ducked rider: 20 px).
  banner: { w: 30, h: 41, elevation: 23, sink: 0, box: { x: 2, y: 0, w: 26, h: 41 }, points: 150 },
  stopSign: { w: 22, h: 41, elevation: 23, sink: 0, box: { x: 2, y: 0, w: 14, h: 41 }, points: 150 },
};

/** Obstacles that hang above the street (ducked under, never jumped). */
export const OVERHEAD_KINDS = (Object.keys(OBSTACLES) as ObstacleKind[]).filter((k) => OBSTACLES[k].elevation > 0);

export interface RailSpec {
  /** Height of the rail top above the ground. */
  minHeight: number;
  maxHeight: number;
  minLength: number;
  maxLength: number;
}

export const RAILS: Record<RailKind, RailSpec> = {
  handrail: { minHeight: 18, maxHeight: 30, minLength: 64, maxLength: 140 },
  pipe: { minHeight: 8, maxHeight: 12, minLength: 48, maxLength: 110 },
};

export const STAR_SIZE = 9;
/** The joint pickup: small, floating where a riding (or ducking) skater's body passes. */
export const JOINT_W = 11;
export const JOINT_H = 7;
/** Height of the joint's bottom edge above the ground. */
const JOINT_LIFT = 13;

/** Points for landing on a rail (times the multiplier). */
export const GRIND_LANDING_POINTS = 25;
/** Points per tick while grinding (times the multiplier). */
export const GRIND_POINTS = 2;
/** The multiplier equals the combo, capped here. */
export const MAX_MULTIPLIER = 5;

export function isObstacle(kind: EntityKind): kind is ObstacleKind {
  return kind in OBSTACLES;
}

export function isOverhead(kind: EntityKind): boolean {
  return isObstacle(kind) && OBSTACLES[kind].elevation > 0;
}

export function isRail(kind: EntityKind): kind is RailKind {
  return kind in RAILS;
}

/** Rails, and obstacles whose top can be ground (bench). */
export function isGrindable(kind: EntityKind): boolean {
  return isRail(kind) || (isObstacle(kind) && !!OBSTACLES[kind].grindable);
}

/** People who walk or sway (their entity carries a motion, see motion.ts). */
export function isPerson(kind: EntityKind): boolean {
  return isObstacle(kind) && !!OBSTACLES[kind].motion;
}

/** Sprite rect of an obstacle whose left edge is at x. */
export function obstacleRect(kind: ObstacleKind, x: number): Rect {
  const { w, h, elevation, sink } = OBSTACLES[kind];
  return { x, y: GROUND_Y + sink - elevation - h, w, h };
}

/** Rail rect: top edge at `height` above the ground, reaching down to it. */
export function railRect(x: number, height: number, length: number): Rect {
  return { x, y: GROUND_Y - height, w: length, h: height };
}

/** Joint rect with its left edge at x. */
export function jointRect(x: number): Rect {
  return { x, y: GROUND_Y - JOINT_LIFT - JOINT_H, w: JOINT_W, h: JOINT_H };
}

/** Star rect centred on (cx, cy). */
export function starRect(cx: number, cy: number): Rect {
  const half = Math.floor(STAR_SIZE / 2);
  return { x: Math.round(cx) - half, y: Math.round(cy) - half, w: STAR_SIZE, h: STAR_SIZE };
}

/** The part of an obstacle that crashes the player, in the same space as `e`. */
export function hitBox(e: Pick<Entity, 'kind' | 'x' | 'y'> & { kind: ObstacleKind }): Rect {
  const { box } = OBSTACLES[e.kind];
  return { x: e.x + box.x, y: e.y + box.y, w: box.w, h: box.h };
}
