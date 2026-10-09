/**
 * Spawn patterns: small street layouts (obstacles, people, rails, stars, the
 * joint) in pattern space, where x = 0 is the player's position when the
 * pattern starts. Every pattern is verified with the clearability solver at
 * the given speeds (and with the chill jump at the chill speeds, where the
 * chill effect may be active), together with the end of the previous pattern
 * (`before`), and rerolled (finally replaced by empty street) if it cannot
 * be passed, or if any take-off on the way (also across the boundary) leaves
 * a human less than the take-off window of fairness.ts (`options.window`).
 * Gaps and the runout after the last piece leave room for a human landing a
 * little early or late. People come alone. While the player may be drunk
 * (`options.drunk`) only DRUNK_TEMPLATES come, checked with the drunk margin
 * (fairness.ts drunkFairness). While an effect may be on (`options.effect`)
 * no empty star pattern comes, and instead of empty street the fallback is a
 * lone low obstacle (EFFECT_FALLBACK). Combo templates (combos.ts) are grind
 * lines: also fair from a grind on each of their pieces, and their stars
 * follow the line (line-guide.ts).
 *
 * planSteps is the same planning as a resumable generator: with a work
 * budget (`options.budget`) it yields whenever the solvers run out of it and
 * goes on where it stopped on the next call, so the spawner can spread one
 * pattern over several ticks. The result never depends on the budget.
 */
import { GROUND_Y, TICK_DT } from '../core/config';
import type { Rng } from '../core/rng';
import { CHILL_JUMP_SCALE } from '../player/tuning';
import type { ObstacleKind, RailKind } from '../types';
import { COMBO_TEMPLATES, type PieceBuilder } from './combos';
import { isGrindable, isObstacle, isRail, jointRect, OBSTACLES, obstacleRect, OVERHEAD_KINDS, RAILS, railRect, starRect } from './catalogue';
import { buildCourse, type Piece } from './course';
import { DRUNK_TEMPLATES, drunkFairness, humanFair, LATE_TAKEOFF_WINDOW, soberFairness, solversFor } from './fairness';
import { PROPS } from './items';
import { groundBody, hitboxOf, railBody, stepBody } from './jumpsim';
import { lineGuide, type Point, spreadStars } from './line-guide';
import type { Motion } from './motion';
import { constantPace, type Course, HOLDS, resumable, type Solver, type WorkBudget } from './solver';

export type { Piece };

export interface PlanOptions {
  /** Zone the pattern lies in: people are themed by it (1 Neckar: VfB fans, 2 Bad Cannstatt: Wasen visitors). */
  zone?: number;
  /** Speeds at which the pattern must also be clearable with the chill jump (the effect may be active there). */
  chillSpeeds?: number[];
  /** The previous pattern's pieces in this pattern's space (x < 0): the course across the boundary must be clearable too. */
  before?: Piece[];
  /** Human take-off window (ticks) every take-off must leave (fairness.ts takeoffWindowAt). Default LATE_TAKEOFF_WINDOW. */
  window?: number;
  /** The player may ride it drunk: easy templates only, fair with the drunk margin. */
  drunk?: boolean;
  /** An effect (drunk, chill) may be on: no empty star pattern, there is always something to jump. */
  effect?: boolean;
  /** Work budget of the solvers (planSteps yields when it runs out). Default: unlimited. */
  budget?: WorkBudget;
  /** Plan only this template (by name), whatever the tier, zone and effect (tests and the debug hook). */
  template?: string;
}

export interface Pattern {
  name: string;
  pieces: Piece[];
  /** Pattern x by which the player is back on the ground; the next pattern starts after it. */
  length: number;
}

interface Template {
  name: string;
  tier: number;
  weight: number;
  /** Only in zones with people (ZONE_PEOPLE). */
  people?: boolean;
  /** A grind line (combos.ts): a grind on any of its pieces must lead on fairly, and its stars follow the line (line-guide.ts). */
  line?: boolean;
  build(b: Builder): void;
}

/** Ground obstacles a random pick chooses from (people never: they come alone, see the person template). */
const PICKABLE: ObstacleKind[] = ['bin', 'barrier', 'bench', 'planter', 'curbGap'];
/** The people of a zone: VfB fans at the Neckar, Wasen visitors in Bad Cannstatt. */
const ZONE_PEOPLE: Record<number, ObstacleKind> = { 1: 'vfbFan', 2: 'wasenGuest' };
/** Chance that a pattern with obstacles also gets a star arc over its best jump (keeps the wider street lively). */
const STAR_CHANCE = 0.6;
const MAX_STARS = 5;
/** A grind line is longer than one jump: more stars to lead along it. */
const MAX_LINE_STARS = 9;
/** Minimum horizontal distance between stars of an arc. */
const STAR_SPACING = 13;
const ATTEMPTS = 10;
/** Chance that two ground obstacles stand close (one jump for both) rather than open (a landing in between). */
const CLOSE_CHANCE = 0.3;
const CLOSE_GAP: [number, number] = [10, 25];
/** An open gap is at least this many seconds of riding (it scales with the speed)... */
const OPEN_GAP_SECONDS = 0.72;
/** ...plus up to this much street. */
const OPEN_GAP_SPREAD = 65;
/** Street between an overhead obstacle and a ground obstacle (duckJump), either order. */
const DUCK_THEN_JUMP: [number, number] = [40, 117];
const JUMP_THEN_DUCK: [number, number] = [52, 130];
/** Street between an obstacle and a rail (obstacleRail), and between a rail and an obstacle (railObstacle). */
const OBSTACLE_TO_RAIL: [number, number] = [26, 78];
const RAIL_TO_OBSTACLE: [number, number] = [26, 91];

/**
 * While an effect may be on, a pattern that finds nothing fair in ATTEMPTS
 * falls back to one of these lone low obstacles (the bench is fair even drunk
 * and chilled at once)...
 */
const EFFECT_FALLBACK: ObstacleKind[] = ['curbGap', 'bench'];
/** ...pushed out by these seconds of riding until it is fair after the previous pattern (drunk landings scatter far). */
const EFFECT_PUSH_SECONDS = [0, 0.5, 1];

/** Extra run-up while the player may be drunk, in seconds of riding: the late, full drunk jumps take off far before the piece. */
const DRUNK_LEAD_SECONDS = 0.4;

/** Free run-up before the first piece, growing with speed (longer while the player may be drunk). */
export function leadFor(speed: number, drunk = false): number {
  return Math.round(20 + 0.3 * speed + (drunk ? DRUNK_LEAD_SECONDS * speed : 0));
}

/** Room after the last piece in which the player must be back on the ground (a late landing still lands here). */
export function runoutFor(speed: number): number {
  return Math.round(32 + 0.55 * speed);
}

class Builder implements PieceBuilder {
  readonly pieces: Piece[] = [];

  readonly lead: number;

  constructor(
    readonly rng: Rng,
    private readonly speed: number,
    private readonly zone: number,
    drunk: boolean,
  ) {
    this.lead = leadFor(speed, drunk);
  }

  /**
   * Street between two ground obstacles a human can time at this speed:
   * either close enough to clear both in one jump, or open enough to land in
   * between and take off again. Gaps in between need an in-between hold or
   * frame-perfect timing (fairness.ts would reject them).
   */
  spacing(): number {
    return this.rng.chance(CLOSE_CHANCE) ? this.rng.int(...CLOSE_GAP) : this.openGap();
  }

  /** Street between two ground obstacles open enough to land in between and take off again. */
  openGap(): number {
    const open = Math.round(OPEN_GAP_SECONDS * this.speed);
    return this.rng.int(open, open + OPEN_GAP_SPREAD);
  }

  /** Right edge of everything placed so far (or the lead). */
  get end(): number {
    return Math.max(this.lead, ...this.pieces.map((p) => p.x + p.w));
  }

  obstacle(kind: ObstacleKind, x: number): Piece {
    const piece: Piece = { kind, ...obstacleRect(kind, Math.round(x)) };
    if (kind === 'bin') piece.data = { variant: this.rng.int(0, 2) };
    const motion = OBSTACLES[kind].motion;
    if (motion) {
      const m: Motion = { walk: this.rng.range(...motion.walk), sway: this.rng.range(...motion.sway), phase: this.rng.range(0, 2 * Math.PI) };
      piece.data = { ...m, ax: piece.x, variant: this.rng.int(0, 1), prop: this.rng.int(0, PROPS - 1) };
    }
    this.pieces.push(piece);
    return piece;
  }

  rail(kind: RailKind, x: number, height?: number, length?: number): Piece {
    const spec = RAILS[kind];
    const h = height ?? this.rng.int(spec.minHeight, spec.maxHeight);
    const w = length ?? this.rng.int(spec.minLength, spec.maxLength);
    const piece: Piece = { kind, ...railRect(Math.round(x), h, w) };
    this.pieces.push(piece);
    return piece;
  }

  /** A random overhead obstacle (banner, stop sign) at x. */
  overhead(x: number): Piece {
    return this.obstacle(this.rng.pick(OVERHEAD_KINDS), x);
  }

  pick(maxHeight = Infinity): ObstacleKind {
    return this.rng.pick(PICKABLE.filter((k) => OBSTACLES[k].h - OBSTACLES[k].sink <= maxHeight));
  }

  /** The zone's person (only called for templates marked `people`). */
  person(x: number): Piece {
    return this.obstacle(ZONE_PEOPLE[this.zone]!, x);
  }

  railKind(): RailKind {
    return this.rng.chance(0.65) ? 'handrail' : 'pipe';
  }
}

const TEMPLATES: Template[] = [
  { name: 'single', tier: 0, weight: 5, build: (b) => void b.obstacle(b.pick(), b.lead) },
  { name: 'person', tier: 0, weight: 4, people: true, build: (b) => void b.person(b.lead) },
  { name: 'stars', tier: 0, weight: 1, build: () => {} },
  {
    name: 'pair',
    tier: 1,
    weight: 3,
    build: (b) => {
      b.obstacle(b.pick(), b.lead);
      b.obstacle(b.pick(), b.end + b.spacing());
    },
  },
  { name: 'rail', tier: 1, weight: 2, build: (b) => void b.rail(b.railKind(), b.lead) },
  { name: 'duck', tier: 1, weight: 2, build: (b) => void b.overhead(b.lead) },
  {
    name: 'duckJump',
    tier: 2,
    weight: 2,
    build: (b) => {
      // Duck then jump, or jump then duck; the solver rejects gaps too short for either.
      if (b.rng.chance(0.5)) {
        b.overhead(b.lead);
        b.obstacle(b.pick(), b.end + b.rng.int(...DUCK_THEN_JUMP));
      } else {
        b.obstacle(b.pick(), b.lead);
        b.overhead(b.end + b.rng.int(...JUMP_THEN_DUCK));
      }
    },
  },
  {
    name: 'railOver',
    tier: 2,
    weight: 2,
    build: (b) => {
      const rail = b.rail('handrail', b.lead, undefined, b.rng.int(96, 140));
      const kind = b.pick(rail.h - 5);
      b.obstacle(kind, rail.x + rail.w / 2 - OBSTACLES[kind].w / 2);
    },
  },
  {
    name: 'obstacleRail',
    tier: 2,
    weight: 2,
    build: (b) => {
      b.obstacle(b.pick(), b.lead);
      b.rail(b.railKind(), b.end + b.rng.int(...OBSTACLE_TO_RAIL));
    },
  },
  {
    name: 'railObstacle',
    tier: 3,
    weight: 2,
    build: (b) => {
      b.rail(b.railKind(), b.lead);
      b.obstacle(b.pick(), b.end + b.rng.int(...RAIL_TO_OBSTACLE));
    },
  },
  {
    name: 'triple',
    tier: 3,
    weight: 1,
    build: (b) => {
      for (let i = 0; i < 3; i++) b.obstacle(b.pick(), i === 0 ? b.lead : b.end + b.spacing());
    },
  },
  ...COMBO_TEMPLATES.map((t) => ({ ...t, line: true })),
];

export const TEMPLATE_NAMES = TEMPLATES.map((t) => t.name);

const isDrunkTemplate = (t: Template) => (DRUNK_TEMPLATES as readonly string[]).includes(t.name);

function pickTemplate(rng: Rng, tier: number, zone: number, drunk: boolean, effect: boolean, only?: string): Template {
  const open = only
    ? TEMPLATES.filter((t) => t.name === only)
    : TEMPLATES.filter((t) => t.tier <= tier && (!t.people || zone in ZONE_PEOPLE) && (!drunk || isDrunkTemplate(t)) && (!effect || t.name !== 'stars'));
  if (open.length === 0) throw new Error(`no spawn template ${only}`);
  let roll = rng.next() * open.reduce((sum, t) => sum + t.weight, 0);
  for (const t of open) {
    roll -= t.weight;
    if (roll < 0) return t;
  }
  return open[open.length - 1]!;
}

/** What the solver sees of a pattern, with the player starting at pattern x `originX`. */
export function courseOf(pattern: Pattern, originX = 0): Course {
  return buildCourse(pattern.pieces, originX, () => pattern.length - originX);
}

/**
 * The pieces a jump over the previous pattern's end deals with: its last
 * piece and whatever lies under or over it. Earlier pieces were checked with
 * that pattern, and leaving them out keeps the boundary check cheap.
 */
function lastPieces(before: Piece[]): Piece[] {
  if (before.length === 0) return before;
  const last = before.reduce((a, b) => (b.x + b.w > a.x + a.w ? b : a));
  return before.filter((p) => p.x + p.w > last.x);
}

/** Free street the player starts from when a pattern is checked together with the previous one's pieces. */
function runupBefore(before: Piece[], lead: number): number {
  return Math.min(0, ...before.map((p) => p.x)) - lead;
}

/**
 * A random pattern for this tier that is clearable at every speed in
 * `speeds` (the speed range while the player crosses it), and with the chill
 * jump at every speed in `options.chillSpeeds`.
 */
export function planPattern(rng: Rng, tier: number, speeds: number[], options: PlanOptions = {}): Pattern {
  const steps = planSteps(rng, tier, speeds, { ...options, budget: undefined });
  for (;;) {
    const step = steps.next();
    if (step.done) return step.value;
  }
}

/** planPattern as a resumable generator: yields whenever `options.budget` runs out (see the module comment). */
export function* planSteps(rng: Rng, tier: number, speeds: number[], options: PlanOptions = {}): Generator<void, Pattern> {
  const slow = Math.min(...speeds);
  const fast = Math.max(...speeds, ...(options.chillSpeeds ?? []));
  // Chill paces first: the low chill jump rejects the most patterns, so checks fail fast.
  const paces = [...(options.chillSpeeds ?? []).map((v) => constantPace(v, CHILL_JUMP_SCALE)), ...speeds];
  const zone = options.zone ?? 0;
  const before = lastPieces((options.before ?? []).filter((p) => isObstacle(p.kind) || isRail(p.kind)));
  const drunk = options.drunk ?? false;
  const human = options.window ?? LATE_TAKEOFF_WINDOW;
  const margin = drunk ? drunkFairness(human) : soberFairness(human);
  const budget = options.budget;
  const effect = options.effect ?? false;
  /** The pattern's solvers when it is fair, also across the boundary (unless `alone`); null otherwise. */
  function* fairSolvers(pattern: Pattern, alone = false): Generator<void, Solver[] | null> {
    const solvers = solversFor(courseOf(pattern), paces, budget);
    if (!(yield* resumable(() => humanFair(solvers, margin)))) return null;
    if (before.length > 0 && !alone) {
      const across = solversFor(courseAfter(pattern, before, leadFor(fast, drunk)), paces, budget);
      if (!(yield* resumable(() => humanFair(across, margin)))) return null;
    }
    return solvers;
  }
  /** Whether a grind on every grindable piece (landed at its start) leads on fairly at every pace: its solvers per piece, or null. */
  function* grindsFair(pattern: Pattern): Generator<void, Map<Piece, Solver[]> | null> {
    const found = new Map<Piece, Solver[]>();
    for (const top of pattern.pieces.filter((p) => isGrindable(p.kind))) {
      const solvers = solversFor(courseOf(pattern, top.x), paces, budget);
      const fair = () => solvers.every((s) => s.fair(margin.holds, margin.window, railBody(top.y, top.w), margin.spread));
      if (!(yield* resumable(fair))) return null;
      found.set(top, solvers);
    }
    return found;
  }
  for (let i = 0; i < ATTEMPTS; i++) {
    const template = pickTemplate(rng, tier, zone, drunk, effect, options.template);
    const builder = new Builder(rng, fast, zone, drunk);
    template.build(builder);
    const pattern = finish(template.name, builder.pieces, fast);
    const solvers = yield* fairSolvers(pattern);
    if (!solvers) continue;
    const slowest = paces.indexOf(slow);
    if (template.line) {
      const grinds = yield* grindsFair(pattern);
      if (!grinds) continue;
      const guide = yield* lineGuide(pattern.pieces, (top) => (top ? grinds.get(top)! : solvers)[slowest]!, slow * TICK_DT, margin);
      placeStars(pattern, spreadStars(guide, STAR_SPACING, MAX_LINE_STARS));
    } else if (template.name === 'stars') addStars(pattern, arcPath(builder.lead, slow));
    // Stars mark a jump a human can repeat (one of the margin's holds: the full jump while drunk).
    else if (rng.chance(STAR_CHANCE)) {
      const guide = solvers[slowest]!;
      addStars(pattern, (yield* resumable(() => guide.bestJump(groundBody(), margin.holds)))?.path ?? []);
    }
    return pattern;
  }
  // While an effect may be on: a lone low obstacle, further out if the previous pattern needs a longer run-up.
  if (effect) {
    const lone = (kind: ObstacleKind, push: number) => {
      const builder = new Builder(rng, fast, zone, drunk);
      builder.obstacle(kind, builder.lead + Math.round(push * fast));
      return finish('single', builder.pieces, fast);
    };
    for (const push of EFFECT_PUSH_SECONDS) {
      for (const kind of EFFECT_FALLBACK) {
        const pattern = lone(kind, push);
        if (yield* fairSolvers(pattern)) return pattern;
      }
    }
    // The previous pieces may be unfair themselves with this margin (planned sober, or fair only at the speeds they were checked at): then the boundary cannot be judged, and the obstacle only has to be fair itself (the previous runout and the gap leave the landing room).
    const previous = before.length > 0 ? solversFor(courseAfter(finish('previous', [], fast), before, leadFor(fast, drunk)), paces, budget) : null;
    if (previous && !(yield* resumable(() => humanFair(previous, margin)))) {
      for (const push of EFFECT_PUSH_SECONDS) {
        for (const kind of EFFECT_FALLBACK) {
          const pattern = lone(kind, push);
          if (yield* fairSolvers(pattern, true)) return pattern;
        }
      }
    }
  }
  // Nothing fair found: a stretch of empty street (always fair, also after any previous pattern).
  return finish('fallback', [], fast);
}

/** The previous pattern's pieces followed by `pattern`, as one course starting from free street before them. */
function courseAfter(pattern: Pattern, before: Piece[], lead: number): Course {
  return courseOf({ ...pattern, pieces: [...before, ...pattern.pieces] }, runupBefore(before, lead));
}

/** A lone joint floating at riding height: collected by riding (or ducking) through it. */
export function jointPattern(speed: number): Pattern {
  const lead = leadFor(speed);
  return finish('joint', [{ kind: 'joint', ...jointRect(lead) }], speed);
}

function finish(name: string, pieces: Piece[], fast: number): Pattern {
  const end = Math.max(0, ...pieces.map((p) => p.x + p.w));
  return { name, pieces, length: end + runoutFor(fast) };
}

/** Hitbox centres of a full-hold jump taken at pattern x `from`. */
function arcPath(from: number, speed: number): { x: number; y: number }[] {
  const path: { x: number; y: number }[] = [];
  let body = groundBody();
  const step = speed * TICK_DT;
  const hold = HOLDS[HOLDS.length - 1]!;
  for (let i = 0; i < 200; i++) {
    const x = from + i * step;
    body = stepBody(body, x, i === 0, i < hold);
    if (body.grounded) break;
    const box = hitboxOf(body, x + step);
    path.push({ x: box.x + box.w / 2, y: box.y + box.h / 2 });
  }
  return path;
}

/** Up to MAX_STARS stars spread along the middle of an airborne path. */
function addStars(pattern: Pattern, path: Point[]): void {
  const middle = path.slice(Math.floor(path.length * 0.15), Math.ceil(path.length * 0.85));
  let lastX = -Infinity;
  const stars: Point[] = [];
  for (const p of middle) {
    if (p.x - lastX < STAR_SPACING || stars.length >= MAX_STARS || p.y > GROUND_Y - 6) continue;
    lastX = p.x;
    stars.push(p);
  }
  placeStars(pattern, stars);
}

/** Stars centred on `points` (in riding order); the pattern lasts until past the last one. */
function placeStars(pattern: Pattern, points: Point[]): void {
  pattern.pieces.push(...points.map((p): Piece => ({ kind: 'star', ...starRect(p.x, p.y) })));
  const last = points[points.length - 1];
  if (last) pattern.length = Math.max(pattern.length, last.x + STAR_SPACING);
}
