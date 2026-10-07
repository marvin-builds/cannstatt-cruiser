/**
 * Spawn patterns: small street layouts (obstacles, people, rails, stars, the
 * joint) in pattern space, where x = 0 is the player's position when the
 * pattern starts. Every pattern is verified with the clearability solver at
 * the given speeds (and with the chill jump at the chill speeds, where the
 * chill effect may be active) and rerolled (finally replaced by a safe
 * fallback) if it cannot be passed.
 */
import { GROUND_Y, TICK_DT } from '../core/config';
import type { Rng } from '../core/rng';
import { CHILL_JUMP_SCALE } from '../player/tuning';
import type { ObstacleKind, RailKind } from '../types';
import { jointRect, OBSTACLES, obstacleRect, OVERHEAD_KINDS, RAILS, railRect, starRect } from './catalogue';
import { buildCourse, type Piece } from './course';
import { groundBody, hitboxOf, stepBody } from './jumpsim';
import type { Motion } from './motion';
import { constantPace, type Course, HOLDS, Solver } from './solver';

export type { Piece };

export interface PlanOptions {
  /** Zone the pattern lies in: people are themed by it (1 Neckar: VfB fans, 2 Bad Cannstatt: Wasen visitors). */
  zone?: number;
  /** Speeds at which the pattern must also be clearable with the chill jump (the effect may be active there). */
  chillSpeeds?: number[];
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
  build(b: Builder): void;
}

/** Ground obstacles a random pick chooses from. */
const PICKABLE: ObstacleKind[] = ['bin', 'barrier', 'bench', 'planter', 'curbGap'];
/** People added to the pick per zone (twice: about every fourth pick there is a person). */
const ZONE_PEOPLE: Record<number, ObstacleKind[]> = { 1: ['vfbFan', 'vfbFan'], 2: ['wasenGuest', 'wasenGuest'] };
/** Chance that a pattern with obstacles also gets a star arc over its best jump. */
const STAR_CHANCE = 0.45;
const MAX_STARS = 5;
/** Minimum horizontal distance between stars of an arc. */
const STAR_SPACING = 13;
const ATTEMPTS = 10;

/** Free run-up before the first piece, growing with speed. */
function leadFor(speed: number): number {
  return Math.round(20 + 0.3 * speed);
}

/** Room after the last piece in which the player must be back on the ground. */
function runoutFor(speed: number): number {
  return Math.round(24 + 0.35 * speed);
}

class Builder {
  readonly pieces: Piece[] = [];
  private readonly pickable: ObstacleKind[];

  constructor(
    readonly rng: Rng,
    readonly lead: number,
    zone: number,
  ) {
    this.pickable = [...PICKABLE, ...(ZONE_PEOPLE[zone] ?? [])];
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
      piece.data = { ...m, ax: piece.x, variant: this.rng.int(0, 1) };
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
    return this.rng.pick(this.pickable.filter((k) => OBSTACLES[k].h - OBSTACLES[k].sink <= maxHeight));
  }

  railKind(): RailKind {
    return this.rng.chance(0.65) ? 'handrail' : 'pipe';
  }
}

const TEMPLATES: Template[] = [
  { name: 'single', tier: 0, weight: 5, build: (b) => void b.obstacle(b.pick(), b.lead) },
  { name: 'stars', tier: 0, weight: 1, build: () => {} },
  {
    name: 'pair',
    tier: 1,
    weight: 3,
    build: (b) => {
      b.obstacle(b.pick(), b.lead);
      b.obstacle(b.pick(), b.end + b.rng.int(16, 80));
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
        b.obstacle(b.pick(), b.end + b.rng.int(30, 90));
      } else {
        b.obstacle(b.pick(), b.lead);
        b.overhead(b.end + b.rng.int(40, 100));
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
      b.rail(b.railKind(), b.end + b.rng.int(20, 60));
    },
  },
  {
    name: 'railObstacle',
    tier: 3,
    weight: 2,
    build: (b) => {
      b.rail(b.railKind(), b.lead);
      b.obstacle(b.pick(), b.end + b.rng.int(20, 70));
    },
  },
  {
    name: 'triple',
    tier: 3,
    weight: 1,
    build: (b) => {
      for (let i = 0; i < 3; i++) b.obstacle(b.pick(), i === 0 ? b.lead : b.end + b.rng.int(20, 70));
    },
  },
];

export const TEMPLATE_NAMES = TEMPLATES.map((t) => t.name);

function pickTemplate(rng: Rng, tier: number): Template {
  const open = TEMPLATES.filter((t) => t.tier <= tier);
  let roll = rng.next() * open.reduce((sum, t) => sum + t.weight, 0);
  for (const t of open) {
    roll -= t.weight;
    if (roll < 0) return t;
  }
  return open[open.length - 1]!;
}

/** What the solver sees of a pattern. */
export function courseOf(pattern: Pattern): Course {
  return buildCourse(pattern.pieces, 0, () => pattern.length);
}

/**
 * A random pattern for this tier that is clearable at every speed in
 * `speeds` (the speed range while the player crosses it), and with the chill
 * jump at every speed in `options.chillSpeeds`.
 */
export function planPattern(rng: Rng, tier: number, speeds: number[], options: PlanOptions = {}): Pattern {
  const slow = Math.min(...speeds);
  const fast = Math.max(...speeds, ...(options.chillSpeeds ?? []));
  const paces = [...speeds, ...(options.chillSpeeds ?? []).map((v) => constantPace(v, CHILL_JUMP_SCALE))];
  for (let i = 0; i < ATTEMPTS; i++) {
    const template = pickTemplate(rng, tier);
    const builder = new Builder(rng, leadFor(fast), options.zone ?? 0);
    template.build(builder);
    const pattern = finish(template.name, builder.pieces, fast);
    const course = courseOf(pattern);
    if (!paces.every((pace) => new Solver(course, pace).solvable())) continue;
    if (template.name === 'stars') addStars(pattern, arcPath(builder.lead, slow));
    else if (rng.chance(STAR_CHANCE)) addStars(pattern, new Solver(course, slow).bestJump()?.path ?? []);
    return pattern;
  }
  const builder = new Builder(rng, leadFor(fast), 0);
  builder.obstacle('bench', builder.lead);
  return finish('fallback', builder.pieces, fast);
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
function addStars(pattern: Pattern, path: { x: number; y: number }[]): void {
  const middle = path.slice(Math.floor(path.length * 0.15), Math.ceil(path.length * 0.85));
  let lastX = -Infinity;
  const stars: Piece[] = [];
  for (const p of middle) {
    if (p.x - lastX < STAR_SPACING || stars.length >= MAX_STARS || p.y > GROUND_Y - 6) continue;
    lastX = p.x;
    stars.push({ kind: 'star', ...starRect(p.x, p.y) });
  }
  pattern.pieces.push(...stars);
  if (stars.length > 0) pattern.length = Math.max(pattern.length, lastX + STAR_SPACING);
}
