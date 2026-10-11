/**
 * Combination templates (ROADMAP 52 6a, USER: "still quite lame"): spawn
 * patterns that chain the street's pieces into mixed sequences of 3 (tier 2)
 * to 5 (tier 3) elements: jumps and ducks in a row, a low obstacle before a
 * rail and another after it (grind over both or jump both), a person between
 * obstacles (jump or stomp and go on), route choices (the street with more
 * jumps, or a bench and a rail above it for more points) and longer chains.
 *
 * Combined, never timing-precise: every gap comes from STEP_GAPS, measured
 * so the step after it keeps the full human take-off window and landing room
 * (fairness.ts) at every speed, and patterns.ts plans each one like every
 * template (solver with the real arcs at the pattern's speeds, the human
 * window, across the boundary, rerolled when not fair). Lines (`line`) are
 * also fair from a grind on any of their pieces and street-clearable without
 * their rails. People keep PERSON_ROOM_SECONDS of free street to every other
 * piece, and every stomp on them comes down where the rest is fair
 * (Solver.stompsLeadOn, checked by patterns.ts).
 *
 * Signs ducked in one go (no jump between them) stay within one swipe
 * (duck-span.ts, ROADMAP 66): at most MAX_ONE_GO_SIGNS of them, spanning at
 * most ONE_GO_DUCK_SECONDS; a sign that does not fit comes after the swipe
 * ran out and the skater stood up (DUCK_REPEAT_SECONDS), as a new duck.
 *
 * Tier 2 and up, so never while chilled (spawner.ts CHILLED_TIER) and never
 * while drunk (fairness.ts DRUNK_TEMPLATES).
 */
import { DUCK_TRANSITION, HITBOX_W } from '../player/tuning';
import type { ObstacleKind, RailKind } from '../types';
import { OBSTACLES, OVERHEAD_KINDS } from './catalogue';
import type { PieceBuilder } from './combos';
import type { Piece } from './course';
import { DUCK_REPEAT_SECONDS, MAX_ONE_GO_SIGNS, ONE_GO_DUCK_SECONDS } from './duck-span';
import { PERSON_ROOM_SECONDS } from './fairness';
import { SAFETY } from './solver';

/** What a combination template needs from patterns.ts's Builder on top of PieceBuilder. */
export interface MixBuilder extends PieceBuilder {
  /** Street between two ground obstacles a human can time (one jump for both, or a landing in between). */
  spacing(): number;
  /** A random ground obstacle at most `maxHeight` tall. */
  pick(maxHeight?: number): ObstacleKind;
  /** A random overhead sign at x. */
  overhead(x: number): Piece;
  /** The zone's person at x (only for templates marked `people`). */
  person(x: number): Piece;
  railKind(): RailKind;
  /** Street ridden in `seconds` at the pattern's fastest speed. */
  seconds(seconds: number): number;
}

export interface MixTemplate {
  name: string;
  tier: number;
  weight: number;
  /** Only in zones with people (patterns.ts ZONE_PEOPLE). */
  people?: boolean;
  /** A grind line: fair from a grind on any piece, stars along the line (patterns.ts). */
  line?: boolean;
  /** Two ways through: the street, or a bench / rail above it for more points. */
  route?: boolean;
  build(b: MixBuilder): void;
}

/** A step of a chain: a ground obstacle, an overhead sign, the zone's person, a rail or a bench. */
type Step = 'low' | 'sign' | 'person' | 'rail' | 'bench';

/**
 * Seconds of street from one step's end to the next step's start, measured
 * with the solver (all kinds, 90 to 190 px/s, take-off window 14): a sign
 * needs >= 0.48 s after a jump and >= 0.44 s before one, a rail end >= 0.6 s
 * before a jump (shorter gaps leave no window at 90 px/s), two signs are
 * ducked in one go. Ground to ground uses MixBuilder.spacing (close or open).
 */
const STEP_GAPS: Partial<Record<`${Step}>${Step}`, [number, number]>> = {
  'low>sign': [0.52, 0.9],
  'sign>low': [0.48, 0.85],
  'sign>sign': [0.15, 0.5],
  'low>rail': [0.25, 0.6],
  'bench>rail': [0.25, 0.55],
  'rail>low': [0.62, 0.95],
  'rail>bench': [0.62, 0.9],
  'sign>rail': [0.3, 0.7],
  'rail>sign': [0.4, 0.8],
};
/** Extra street (seconds) a person may get beyond PERSON_ROOM_SECONDS on each side. */
const PERSON_SPREAD = 0.3;
/** Low obstacles that stand next to a person or under a rail (no bench: a bench is a step of its own). */
const LOW: ObstacleKind[] = ['curbGap', 'bin', 'planter', 'barrier'];
/** Rail heights (top above the ground) of a route's high path: a hop from the bench (12 px) up. */
const HIGH_RAIL: [number, number] = [20, 28];
const HIGH_RAIL_LENGTH: [number, number] = [96, 130];

/** The most a person sways to either side (catalogue): the free street around a person is measured from its swaying edges. */
const MAX_SWAY = Math.max(OBSTACLES.vfbFan.motion!.sway[1], OBSTACLES.wasenGuest.motion!.sway[1]);

/**
 * Share of ONE_GO_DUCK_SECONDS a chain fills at its builder's (fastest)
 * speed: the pattern is also ridden a little slower (patterns.ts checks
 * every speed and rerolls the rest).
 */
const ONE_GO_FILL = 0.9;
/** Extra seconds a new duck may come later than DUCK_REPEAT_SECONDS. */
const REPEAT_SPREAD = 0.3;
/** Pattern x offsets of the overhead boxes: the right end of the widest, the left start of the closest. */
const SIGN_BOX_END = Math.max(...OVERHEAD_KINDS.map((k) => OBSTACLES[k].box.x + OBSTACLES[k].box.w));
const SIGN_BOX_START = Math.min(...OVERHEAD_KINDS.map((k) => OBSTACLES[k].box.x));

/** Steps the skater has to jump (or stomp): the jump ends a swipe duck, so the next sign starts a new duck. */
const JUMPED: readonly Step[] = ['low', 'bench', 'person'];

/** The signs ducked in one go so far: the left edge of the first one's box and how many. */
interface Duck {
  from: number;
  signs: number;
}

/**
 * Where a sign goes that would come at `x` after a duck (`duck`): there if it
 * still fits in one go, else after the swipe ran out (a new duck). After a
 * sign (`sign>sign`) the gap is drawn from what still fits.
 */
function signAt(b: MixBuilder, x: number, prev: Step, duck: Duck): number {
  const fitsTo = duck.from + b.seconds(ONE_GO_FILL * (ONE_GO_DUCK_SECONDS - DUCK_TRANSITION)) - 2 * SAFETY - HITBOX_W - SIGN_BOX_END;
  if (duck.signs < MAX_ONE_GO_SIGNS) {
    if (prev === 'sign') {
      const [lo, hi] = STEP_GAPS['sign>sign']!.map((t) => b.seconds(t)) as [number, number];
      const most = Math.min(hi, fitsTo - b.end);
      if (most >= lo) return b.end + b.rng.int(lo, most);
    } else if (x <= fitsTo) return x;
  }
  return Math.max(x, duck.from - SIGN_BOX_START + Math.ceil(b.seconds(DUCK_REPEAT_SECONDS + b.rng.range(0, REPEAT_SPREAD))));
}

/** Street from the end of step `prev` to the start of step `next` (a person's sway not included). */
function gapBetween(b: MixBuilder, prev: Step, next: Step): number {
  if (prev === 'person' || next === 'person') return Math.ceil(b.seconds(PERSON_ROOM_SECONDS + b.rng.range(0, PERSON_SPREAD)));
  const range = STEP_GAPS[`${prev}>${next}`];
  return range ? b.seconds(b.rng.range(...range)) : b.spacing();
}

function place(b: MixBuilder, step: Step, x: number): Piece {
  switch (step) {
    case 'sign':
      return b.overhead(x);
    case 'person':
      return b.person(x);
    case 'rail':
      return b.rail(b.railKind(), x);
    case 'bench':
      return b.obstacle('bench', x);
    case 'low':
      return b.obstacle(b.rng.pick(LOW), x);
  }
}

/**
 * Lays `steps` one after the other from the lead, each gap from gapBetween
 * (around a person from its swaying edges), signs within one swipe (signAt).
 */
function chain(b: MixBuilder, steps: readonly Step[]): void {
  let prev: Step | null = null;
  let duck: Duck | null = null;
  for (const step of steps) {
    let x = b.lead;
    if (prev) {
      // b.end is the person's rest edge: its sway comes on top, on both sides.
      x = b.end + gapBetween(b, prev, step) + (prev === 'person' ? MAX_SWAY : 0) + (step === 'person' ? MAX_SWAY : 0);
      if (step === 'sign' && duck) x = signAt(b, x, prev, duck);
    }
    const piece = place(b, step, x);
    if (step === 'sign') {
      const from = piece.x + OBSTACLES[piece.kind as ObstacleKind].box.x;
      duck = duck && from - duck.from < b.seconds(DUCK_REPEAT_SECONDS) ? { from: duck.from, signs: duck.signs + 1 } : { from, signs: 1 };
    } else if (JUMPED.includes(step)) duck = null;
    prev = step;
  }
}

/** `steps` in a random order. */
function shuffled(b: MixBuilder, steps: readonly Step[]): Step[] {
  const out = [...steps];
  for (let i = out.length - 1; i > 0; i--) {
    const j = b.rng.int(0, i);
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/**
 * `count` random steps from `from`, never two rails in a row (that is a
 * grind line, combos.ts) and never more signs in a row than are ducked in
 * one go (MAX_ONE_GO_SIGNS, ROADMAP 66).
 */
function randomSteps(b: MixBuilder, from: readonly Step[], count: number): Step[] {
  const steps: Step[] = [];
  while (steps.length < count) {
    const step = b.rng.pick(from);
    if (step === 'rail' && steps[steps.length - 1] === 'rail') continue;
    if (step === 'sign' && steps.length >= MAX_ONE_GO_SIGNS && steps.slice(-MAX_ONE_GO_SIGNS).every((s) => s === 'sign')) continue;
    steps.push(step);
  }
  return steps;
}

/**
 * The high path of a route: a bench, then a long high handrail over a low
 * obstacle, then a low obstacle after it. On the street: four jumps; above:
 * grind the bench, hop up onto the rail, grind over the obstacle, jump the last.
 */
function highRoad(b: MixBuilder, before: boolean): void {
  chain(b, before ? ['low', 'bench'] : ['bench']);
  const rail = b.rail('handrail', b.end + gapBetween(b, 'bench', 'rail'), b.rng.int(...HIGH_RAIL), b.rng.int(...HIGH_RAIL_LENGTH));
  const kind = b.rng.pick(LOW.filter((k) => OBSTACLES[k].h <= rail.h - 5));
  b.obstacle(kind, rail.x + Math.round(rail.w / 2 - OBSTACLES[kind].w / 2));
  b.obstacle(b.rng.pick(LOW), b.end + gapBetween(b, 'rail', 'low'));
}

export const MIX_TEMPLATES: MixTemplate[] = [
  // Tier 2: about 3 elements.
  { name: 'jumpDuckJump', tier: 2, weight: 2, build: (b) => chain(b, ['low', 'sign', 'low']) },
  { name: 'duckJumpDuck', tier: 2, weight: 1.6, build: (b) => chain(b, ['sign', 'low', 'sign']) },
  // A low obstacle before a rail and one after it: grind over both, or jump both on the street.
  { name: 'railSandwich', tier: 2, weight: 2, line: true, build: (b) => chain(b, ['low', 'rail', 'low']) },
  // A person between two low obstacles: jump all three, or stomp the person and go on.
  { name: 'personSandwich', tier: 2, weight: 2, people: true, build: (b) => chain(b, ['low', 'person', 'low']) },
  // Duck under a sign, jump a low obstacle, jump (or stomp) a person: in any order.
  { name: 'signLowPerson', tier: 2, weight: 2, people: true, build: (b) => chain(b, shuffled(b, ['sign', 'low', 'person'])) },
  // Route: jump bench, obstacle, bench on the street, or grind the benches and hop over the obstacle between them.
  { name: 'benchRoute', tier: 2, weight: 1.6, line: true, route: true, build: (b) => chain(b, ['bench', 'low', 'bench']) },
  // Tier 3: 4-5 elements.
  { name: 'highRoad', tier: 3, weight: 1.8, line: true, route: true, build: (b) => highRoad(b, b.rng.chance(0.5)) },
  { name: 'railGauntlet', tier: 3, weight: 1.5, line: true, build: (b) => chain(b, ['low', 'rail', 'low', 'rail', 'low']) },
  { name: 'duckGauntlet', tier: 3, weight: 1.5, build: (b) => chain(b, ['low', 'sign', 'low', 'sign', 'low']) },
  { name: 'personGauntlet', tier: 3, weight: 1.8, people: true, build: (b) => chain(b, shuffled(b, ['sign', 'low', 'person', 'low'])) },
  { name: 'mixedFour', tier: 3, weight: 1.8, build: (b) => chain(b, randomSteps(b, ['low', 'low', 'sign', 'bench'], 4)) },
  { name: 'mixedFive', tier: 3, weight: 1.2, line: true, build: (b) => chain(b, randomSteps(b, ['low', 'sign', 'rail', 'bench'], 5)) },
  { name: 'railPerson', tier: 3, weight: 1.5, people: true, line: true, build: (b) => chain(b, ['low', 'rail', 'low', 'person']) },
];

export const MIX_NAMES: readonly string[] = MIX_TEMPLATES.map((t) => t.name);
