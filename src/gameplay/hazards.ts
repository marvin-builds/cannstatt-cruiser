/**
 * Moving local hazards (ROADMAP 52 Phase 2, point 7): data and rules shared
 * by the planner, the live contacts, the art and the audio.
 *
 * - **E-scooter**: a rider coming towards the skater on the street, faster
 *   than the scroll. Decided: it is a person under the existing person
 *   rules, so jump it like any person or stomp the rider (head and
 *   shoulders, rules.ts; he tumbles off and tosses a football, items.ts),
 *   with the person's room around it. Its motion is a person's motion (motion.ts) with a large
 *   `walk`: on screen it moves left at (1 + walk) x the scroll speed and meets
 *   the skater exactly where its anchor does, so the solver flies the real
 *   closing speed (course.ts movers). Alone in its pattern, like the `person`
 *   template; gentler (slower) in kid mode.
 * - **Pigeons**: a small flock on the street. Harmless (kid-safe, never an
 *   unfair hit): they take off when the skater comes near (pigeons.ts) and
 *   pay PIGEONS.points when he passes them in the air or ducking. Riding
 *   through upright only scares them off. The planner treats the flock as a
 *   low obstacle (`solverStandIn`), so a rewarded jump over it still leaves
 *   the full take-off window for what follows.
 *
 * Contract stand-ins: src/types.ts has no kinds for them yet, so a scooter is
 * a `vfbFan` entity and a flock a `star` entity, both tagged `data.hazard`
 * (HAZARD_KEY). Every place that treats those kinds asks isScooter /
 * isPigeons first. Proposed contract change: ObstacleKind gains 'scooter'
 * (a person-like mover) and EntityKind gains 'pigeons'.
 */
import { GROUND_Y } from '../core/config';
import type { Rng } from '../core/rng';
import type { Entity, Rect } from '../types';
import { OBSTACLES, obstacleRect } from './catalogue';
import type { Piece } from './course';

export type Hazard = 'scooter' | 'pigeons';

/** The entity data field that tags a hazard. */
export const HAZARD_KEY = 'hazard';

/** Entity kind a scooter rider uses until types.ts has 'scooter': a person (motion, stomp, people crash sound). */
export const SCOOTER_KIND = 'vfbFan' as const;
/** Entity kind a pigeon flock uses until types.ts has 'pigeons': never an obstacle, never in the solver. */
export const PIGEONS_KIND = 'star' as const;

export const SCOOTER = {
  /** Extra closing speed as a share of the scroll (motion.ts walk): 0.4 = the rider comes in at 1.4 x the street. */
  walk: [0.36, 0.5] as [number, number],
  /** Kid mode: gentler, a calmer rider. */
  kidWalk: [0.2, 0.3] as [number, number],
} as const;

export const PIGEONS = {
  /** The flock's street rect: three pigeons side by side. */
  w: 26,
  h: 9,
  /** Passed in the air or ducking (times the multiplier, like a clear). */
  points: 60,
  /** They take off this many seconds of riding before the skater reaches them. */
  flushSeconds: 0.35,
} as const;

type Tagged = Pick<Entity, 'data'>;

export function hazardOf(e: Tagged): Hazard | null {
  const h = e.data?.[HAZARD_KEY];
  return h === 'scooter' || h === 'pigeons' ? h : null;
}

export function isScooter(e: Tagged): boolean {
  return e.data?.[HAZARD_KEY] === 'scooter';
}

export function isPigeons(e: Tagged): boolean {
  return e.data?.[HAZARD_KEY] === 'pigeons';
}

/** A scooter rider with its street anchor (left edge) at x: a person's rect, coming in at SCOOTER.walk (kidWalk in kid mode). */
export function scooterPiece(rng: Rng, x: number, kidMode: boolean): Piece {
  const walk = rng.range(...(kidMode ? SCOOTER.kidWalk : SCOOTER.walk));
  const rect = obstacleRect(SCOOTER_KIND, Math.round(x));
  return { kind: SCOOTER_KIND, ...rect, data: { walk, sway: 0, phase: 0, ax: rect.x, variant: rng.int(0, 1), [HAZARD_KEY]: 'scooter' } };
}

/** The flock's rect with its left edge at x, sitting on the street. */
export function pigeonsRect(x: number): Rect {
  return { x: Math.round(x), y: GROUND_Y - PIGEONS.h, w: PIGEONS.w, h: PIGEONS.h };
}

/** A pigeon flock with its left edge at x. */
export function pigeonsPiece(x: number): Piece {
  return { kind: PIGEONS_KIND, ...pigeonsRect(x), data: { [HAZARD_KEY]: 'pigeons' } };
}

/** The low obstacle the planner sees in place of a flock: a curb gap in its middle (one jump over all three pigeons). */
const STAND_IN = 'curbGap' as const;

/** What the solver plans with: pigeons as a low obstacle centred under the flock (a jump over them must lead on fairly), everything else as it is. */
export function solverStandIn(p: Piece): Piece {
  if (!isPigeons(p)) return p;
  const rect = obstacleRect(STAND_IN, p.x + Math.round((p.w - OBSTACLES[STAND_IN].w) / 2));
  return { kind: STAND_IN, ...rect };
}
