/**
 * Combo templates (ROADMAP 33): spawn patterns that chain pieces the street
 * already has (pipes, handrails, the grindable bench, low obstacles) into a
 * grind line, with stars along it (line-guide.ts). The line is optional:
 * rails never crash, so the street path only jumps the ground obstacles, and
 * those stand like in an open pair (Builder.openGap). patterns.ts
 * plans them like every template (solver, human take-off window, across the
 * boundary) and also checks that a grind on any of their pieces leads on
 * fairly. Tier 2 and up, so never while chilled; never while drunk
 * (fairness.ts DRUNK_TEMPLATES).
 */
import type { Rng } from '../core/rng';
import type { ObstacleKind, RailKind } from '../types';
import type { Piece } from './course';

/** What a combo template needs from patterns.ts's Builder. */
export interface PieceBuilder {
  readonly rng: Rng;
  /** Free run-up before the first piece. */
  readonly lead: number;
  /** Right edge of everything placed so far. */
  readonly end: number;
  rail(kind: RailKind, x: number, height?: number, length?: number): Piece;
  obstacle(kind: ObstacleKind, x: number): Piece;
  /** Street between two ground obstacles open enough to land in between and take off again. */
  openGap(): number;
}

export interface ComboTemplate {
  name: string;
  tier: number;
  weight: number;
  build(b: PieceBuilder): void;
}

/** Heights (rail top above the ground) of the steps of a rising line: a low pipe, a low handrail, a high handrail. */
const STEP_HEIGHTS: [number, number][] = [
  [8, 12],
  [18, 21],
  [26, 30],
];
/** Street from one step's end to the next step's start (a short hop up). */
const STEP_GAP: [number, number] = [6, 24];
/** Low obstacles a bench grind jumps over. */
const LOW: ObstacleKind[] = ['curbGap', 'bin', 'planter'];
/** Street from a rail's end to a bench and from a bench to a rail (like patterns.ts railObstacle / obstacleRail). */
const RAIL_TO_BENCH: [number, number] = [26, 80];
const BENCH_TO_RAIL: [number, number] = [26, 70];
const OBSTACLE_TO_RAIL: [number, number] = [26, 70];

/** Rails rising step by step, each a short hop after the one before. */
function stairs(b: PieceBuilder, steps: [number, number][], lengths: [number, number][]): void {
  steps.forEach((height, i) => {
    const kind: RailKind = height[1] <= 12 ? 'pipe' : 'handrail';
    b.rail(kind, i === 0 ? b.lead : b.end + b.rng.int(...STEP_GAP), b.rng.int(...height), b.rng.int(...lengths[i]!));
  });
}

export const COMBO_TEMPLATES: ComboTemplate[] = [
  {
    // A low pipe, then a hop up onto a long high handrail with a row of stars on it.
    name: 'pipeUp',
    tier: 2,
    weight: 0.5,
    build: (b) => stairs(b, [STEP_HEIGHTS[0]!, STEP_HEIGHTS[2]!], [[48, 64], [90, 130]]),
  },
  {
    // Three short rails rising like a staircase.
    name: 'pipeStairs',
    tier: 2,
    weight: 0.5,
    build: (b) => stairs(b, STEP_HEIGHTS, [[40, 52], [40, 52], [56, 80]]),
  },
  {
    // Grind, hop down onto the bench, hop up onto the next rail.
    name: 'railBenchRail',
    tier: 3,
    weight: 0.5,
    build: (b) => {
      b.rail('handrail', b.lead, b.rng.int(18, 24), b.rng.int(64, 90));
      b.obstacle('bench', b.end + b.rng.int(...RAIL_TO_BENCH));
      b.rail('handrail', b.end + b.rng.int(...BENCH_TO_RAIL), b.rng.int(18, 24), b.rng.int(64, 90));
    },
  },
  {
    // A bench grind ending in a jump over a low obstacle onto a rail.
    name: 'benchHopRail',
    tier: 3,
    weight: 0.5,
    build: (b) => {
      b.obstacle('bench', b.lead);
      // Open: a grind on the short bench may roll off its end, landing before the obstacle.
      b.obstacle(b.rng.pick(LOW), b.end + b.openGap());
      b.rail(b.rng.pick<RailKind>(['pipe', 'handrail']), b.end + b.rng.int(...OBSTACLE_TO_RAIL));
    },
  },
];

export const COMBO_NAMES: readonly string[] = COMBO_TEMPLATES.map((t) => t.name);
