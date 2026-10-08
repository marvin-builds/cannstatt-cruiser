/**
 * Distance-based spawner: lays patterns back to back along the street (gap
 * from the difficulty ramp) and turns each one into entities as soon as its
 * start comes within SPAWN_MARGIN of the right edge, so nothing pops in on
 * any view width while the layout itself stays the same for every width.
 * People are themed by the zone the pattern lies in (`zoneAt`), and every so
 * often a joint pattern comes; the patterns the chill effect can reach after
 * it are also verified with the chill jump at chill speed. Each pattern is
 * verified together with the previous one's pieces, across the gap, with the
 * human take-off window of its street distance (wider early in the run).
 *
 * Drunk: while the player may ride a pattern drunk (SpawnSituation.drunk:
 * drunk, or a Maßkrug in hand or flying there; and the street a quick
 * drinker reaches after a Wasen visitor with a Maßkrug, BEER_REACH) only easy
 * patterns come, fair for the drunk input, with a longer run-up. When the
 * situation turns drunk, sober patterns planned ahead but not yet on the
 * street are planned again (and every plan after them). No joint comes while
 * the player may be drunk: it waits until sober.
 *
 * Effects (ROADMAP 26): while the player may be drunk or is chilled, there is
 * always something to jump: no empty star patterns, and the gap after a
 * pattern only fills up its free street to EFFECT_FREE_SECONDS. While
 * chilled only easy patterns come (up to CHILLED_TIER).
 *
 * Stunt lines (ROADMAP 27, stunt-line.ts): about every STUNT_LINE_INTERVAL
 * seconds of riding (never in the first STUNT_FIRST_SECONDS of a run) the
 * next pattern is a stunt line, but never while the player may be drunk or
 * in the street the chill effect reaches after a joint: then it waits for the
 * first pattern after it. A line's street holds only its kickers and its
 * length covers every landing off it, so the next pattern needs no check
 * across the boundary (its pieces are no obstacles or rails).
 *
 * Planning ahead (`workPerTick`): the game plans up to PLAN_AHEAD patterns
 * ahead, spending at most `workPerTick` solver units per tick (patterns.ts
 * planSteps), so no tick stalls on a hard pattern. If a pattern is due before
 * its plan is done, empty street comes first (up to PLAN_DELAY_MAX, after
 * that it finishes at once). The units are deterministic, so runs replay
 * exactly. Without `workPerTick` every pattern is planned when it is due.
 */
import { PLAYER_X, VIEW_MAX_W } from '../core/config';
import { CHILL_DURATION } from '../core/chill';
import type { Rng } from '../core/rng';
import type { Entity } from '../types';
import { CHILL_SPEED_SCALE, chillStreet } from './chill';
import { gapAt, speedAt, tierAt, TOP_SPEED } from './difficulty';
import { takeoffWindowAt } from './fairness';
import { isObstacle, isRail } from './catalogue';
import { itemOf } from './items';
import { anchorOf, motionOf, withMotion } from './motion';
import { jointPattern, type Pattern, type Piece, planSteps } from './patterns';
import { planStuntLine } from './stunt-line';
import type { WorkBudget } from './solver';

/** Street distance from the player to the first pattern (a few empty seconds). */
const FIRST_START = 380;
/** A pattern is materialised once its start is this close to the right edge. */
const SPAWN_MARGIN = 16;
/** The speed range checked for a pattern spans this much street after its start... */
const SPEED_SPAN = 500;
/** ...plus the most empty street that can come before it while its plan finishes. */
const PLAN_DELAY_MAX = 160;

/**
 * Solver units the live game spends on planning per tick (~0.4 ms on a
 * desktop, ~1 ms on a phone at 4x CPU throttling, see docs/TESTING.md Frame
 * times). A pattern takes about 10 000 units (drunk ones about 25 000), the
 * street needs about 100 per tick on average: plenty of headroom.
 */
export const PLAN_WORK_PER_TICK = 400;
/** Patterns planned ahead of the one due next (enough that a small budget catches up after drunk replans). */
const PLAN_AHEAD = 3;

/** Street distance before the first joint can come: over 30 s even at the start speed ramp. */
export const JOINT_FIRST_DISTANCE = 3300;
/** Street distance between joints: at least 45 s even at TOP_SPEED (more while chilled)... */
export const JOINT_SPACING = 8600;
/** ...plus up to this much at random (also for the first one). */
const JOINT_JITTER = 2400;
/**
 * Seconds of riding between two stunt lines (drawn per line; converted to
 * street at the speed of the ride, so lines come equally often early and late).
 */
export const STUNT_LINE_INTERVAL: [number, number] = [30, 45];
/** Seconds of riding before the first stunt line of a run (fixed: no rng draw, so a run's first patterns stay as they were). */
export const STUNT_FIRST_SECONDS = 25;

/** Street the chill effect can last after the pickup (it runs CHILL_DURATION, never faster than TOP_SPEED). */
export const CHILL_REACH = Math.ceil(CHILL_DURATION * TOP_SPEED);
/**
 * Street after a Wasen visitor with a Maßkrug that is already on the street
 * when the skater could catch it and drink at once: the widest view, the
 * spawn margin and the toss.
 */
export const BEER_REACH = VIEW_MAX_W + SPAWN_MARGIN + 100;

/**
 * Free street after a pattern while an effect may be on, in seconds of riding
 * at its fastest speed: the least every pattern leaves anyway (runout plus
 * gap, patterns.test.ts), so a person still has PERSON_ROOM_SECONDS.
 */
const EFFECT_FREE_SECONDS = 1.1;
/** Highest pattern tier while chilled: lone pieces and pairs, no combos. */
const CHILLED_TIER = 1;

/** What the player may do while riding what is planned now. */
export interface SpawnSituation {
  /** The player is drunk or may soon be (a Maßkrug in hand or on its way). */
  drunk: boolean;
  kidMode: boolean;
}

export interface SpawnerOptions {
  /** Solver units of planning per tick (PLAN_WORK_PER_TICK in the game); unset: plan each pattern when due. */
  workPerTick?: number;
}

const SOBER: SpawnSituation = { drunk: false, kidMode: false };
/** Budget for planning without a limit. */
const UNLIMITED = Number.MAX_SAFE_INTEGER;

/** Planning state that a pattern's plan moves on (restored when plans are thrown away). */
interface Cursor {
  /** The last planned pattern's pieces in the next pattern's space (x < 0). */
  previous: Piece[];
  /** Street distance from which the next joint pattern is laid. */
  nextJoint: number;
  /** Patterns starting before this street distance may be ridden while chilled (checked with the chill jump). */
  chillUntil: number;
  /** Patterns starting before this street distance are ridden while chilled (the effect's street at most). */
  chilledUntil: number;
  /** Patterns starting before this street distance may be ridden drunk. */
  drunkUntil: number;
  /** The next stunt line comes at the first pattern from this street distance (null: not drawn yet, set at the run's first plan). */
  nextStunt: number | null;
}

interface Planned {
  pattern: Pattern;
  /** Street from this pattern's start to the next one's (length plus gap). */
  advance: number;
  drunk: boolean;
  /** The cursor before this plan. */
  before: Cursor;
}

interface Job {
  steps: Generator<void, Planned>;
  drunk: boolean;
  before: Cursor;
}

export class Spawner {
  private rng: Rng | null = null;
  /** Screen x of the next pattern not on the street yet. */
  private nextStart = 0;
  private nextId = 1;
  private cursor: Cursor = { previous: [], nextJoint: 0, chillUntil: -Infinity, chilledUntil: -Infinity, drunkUntil: -Infinity, nextStunt: null };
  /** Street distance at the run start (the first spawn call), for the first stunt line. */
  private runStart: number | null = null;
  /** Planned patterns, in street order, starting at nextStart. */
  private queue: Planned[] = [];
  /** The plan in progress (the pattern after the queue). */
  private job: Job | null = null;
  /** Empty street inserted before the next pattern while its plan finished. */
  private delayed = 0;
  private readonly budget: WorkBudget = { left: UNLIMITED };
  private readonly workPerTick: number | null;
  private work = 0;

  /** `zoneAt(street)`: the background zone at a street distance (themes the people). */
  constructor(
    private readonly zoneAt: (street: number) => number = () => 0,
    options: SpawnerOptions = {},
  ) {
    this.workPerTick = options.workPerTick ?? null;
  }

  /** Solver units spent planning in the last spawn() call. */
  get lastWork(): number {
    return this.work;
  }

  reset(rng: Rng): void {
    this.rng = rng;
    this.nextStart = PLAYER_X + FIRST_START;
    this.nextId = 1;
    this.cursor = { previous: [], nextJoint: JOINT_FIRST_DISTANCE + rng.int(0, JOINT_JITTER), chillUntil: -Infinity, chilledUntil: -Infinity, drunkUntil: -Infinity, nextStunt: null };
    this.runStart = null;
    this.queue = [];
    this.job = null;
    this.delayed = 0;
  }

  /** The street moved left by dx (call together with moving the entities). */
  scroll(dx: number): void {
    this.nextStart -= dx;
  }

  /** Screen x where the next pattern not yet on the street starts (nothing new comes before it). */
  upcomingX(): number {
    return this.nextStart;
  }

  /**
   * Plans ahead within the budget and appends the entities of every pattern
   * that is due. `distance` is the distance matching the current entity
   * positions (after this tick's scroll).
   */
  spawn(entities: Entity[], distance: number, viewWidth: number, speedOverride: number | null, situation: SpawnSituation = SOBER): void {
    this.work = 0;
    if (!this.rng) return;
    this.runStart ??= distance;
    if (situation.drunk && this.hasSoberPlans()) this.discardPlans();
    if (this.workPerTick !== null) this.planAhead(distance, speedOverride, situation);
    const edge = viewWidth + SPAWN_MARGIN;
    while (this.nextStart <= edge) {
      const planned = this.queue.shift();
      if (planned) {
        this.materialise(planned, entities);
      } else if (this.workPerTick !== null && this.delayed < PLAN_DELAY_MAX) {
        // Not planned yet: a little more empty street while the plan goes on.
        const wait = Math.min(PLAN_DELAY_MAX - this.delayed, edge + 1 - this.nextStart);
        this.nextStart += wait;
        this.delayed += wait;
      } else {
        this.materialise(this.finishNow(distance, speedOverride, situation), entities);
      }
    }
  }

  private materialise(planned: Planned, entities: Entity[]): void {
    for (const piece of planned.pattern.pieces) {
      const e: Entity = { ...piece, id: this.nextId++, x: this.nextStart + piece.x, done: false };
      const motion = motionOf(e);
      if (motion) withMotion(e, motion, e.x);
      entities.push(e);
    }
    this.nextStart += planned.advance;
    this.delayed = 0;
  }

  /** Spends this tick's budget on the plans ahead. */
  private planAhead(distance: number, speedOverride: number | null, situation: SpawnSituation): void {
    const units = this.workPerTick!;
    this.budget.left = units;
    while (this.queue.length < PLAN_AHEAD && this.budget.left > 0) {
      this.job ??= this.startJob(distance, speedOverride, situation);
      const step = this.job.steps.next();
      if (!step.done) break;
      this.queue.push(step.value);
      this.job = null;
    }
    this.work += units - Math.max(0, this.budget.left);
  }

  /** The next pattern, planned now whatever it costs. */
  private finishNow(distance: number, speedOverride: number | null, situation: SpawnSituation): Planned {
    this.budget.left = UNLIMITED;
    this.job ??= this.startJob(distance, speedOverride, situation);
    let step = this.job.steps.next();
    while (!step.done) step = this.job.steps.next();
    this.job = null;
    this.work += UNLIMITED - this.budget.left;
    return step.value;
  }

  /** A plan for the pattern after the queued ones. */
  private startJob(distance: number, speedOverride: number | null, situation: SpawnSituation): Job {
    let start = this.nextStart;
    for (const p of this.queue) start += p.advance;
    const street = distance + start - PLAYER_X;
    const drunk = situation.drunk || street < this.cursor.drunkUntil;
    const before = { ...this.cursor };
    return { steps: this.plan(this.rng!, street, speedOverride, drunk, situation.kidMode, before), drunk, before };
  }

  private hasSoberPlans(): boolean {
    return (this.job !== null && !this.job.drunk) || this.queue.some((p) => !p.drunk);
  }

  /**
   * Throws away the plans not on the street yet from the first sober one on;
   * drunk plans before it stay, so the next pattern is usually ready while
   * the rest is planned again (the rng stays where it is: still deterministic).
   */
  private discardPlans(): void {
    const sober = this.queue.findIndex((p) => !p.drunk);
    // No sober plan in the queue: then the job is sober (hasSoberPlans).
    this.cursor = { ...(sober >= 0 ? this.queue[sober]!.before : this.job!.before) };
    if (sober >= 0) this.queue.length = sober;
    this.job = null;
  }

  /** Plans the pattern starting at `street` and moves the cursor on (only at the end, so a dropped plan leaves it as it was). */
  private *plan(rng: Rng, street: number, speedOverride: number | null, drunk: boolean, kidMode: boolean, before: Cursor): Generator<void, Planned> {
    const pinned = speedOverride !== null;
    const speeds = pinned ? [speedOverride] : [speedAt(street), speedAt(street + SPEED_SPAN + PLAN_DELAY_MAX)];
    let pattern: Pattern;
    const fast = Math.max(...speeds);
    const pace = pinned ? speedOverride : null;
    this.cursor.nextStunt ??= rideStreet(this.runStart ?? street, STUNT_FIRST_SECONDS, pace);
    if (street >= this.cursor.nextJoint && !drunk) {
      pattern = jointPattern(fast);
      this.cursor.nextJoint = street + JOINT_SPACING + rng.int(0, JOINT_JITTER);
      this.cursor.chillUntil = street + pattern.length + CHILL_REACH;
      this.cursor.chilledUntil = street + pattern.length + chillStreet(fast);
    } else if (street >= this.cursor.nextStunt && !drunk && street >= this.cursor.chillUntil) {
      pattern = yield* planStuntLine(rng, speeds, this.zoneAt(street), Math.round(street), this.budget);
      this.cursor.nextStunt = rideStreet(street, rng.range(...STUNT_LINE_INTERVAL), pace);
    } else {
      const chilled = street < this.cursor.chilledUntil;
      const effect = drunk || chilled;
      const options = { zone: this.zoneAt(street), chillSpeeds: undefined as number[] | undefined, before: this.cursor.previous, window: takeoffWindowAt(street), drunk, effect, budget: this.budget };
      if (street < this.cursor.chillUntil) {
        // A pinned speed stays pinned while chilled; otherwise from the slowest chill speed through the ramp back up.
        const low = Math.min(...speeds) * CHILL_SPEED_SCALE;
        const high = Math.max(...speeds);
        options.chillSpeeds = pinned ? speeds : [low, (low + high) / 2, high];
      }
      const tier = chilled ? Math.min(tierAt(street), CHILLED_TIER) : tierAt(street);
      pattern = yield* planSteps(rng, tier, speeds, options);
    }
    // After a joint too: the next pattern is ridden chilled.
    const gap = drunk || street < this.cursor.chilledUntil ? effectGap(pattern, fast, gapAt(street)) : gapAt(street);
    const advance = pattern.length + gap;
    this.cursor.previous = pattern.pieces.map((p) => shifted(p, -advance));
    if (!kidMode) {
      for (const p of pattern.pieces) {
        if (p.kind === 'wasenGuest' && itemOf(p, false) === 'beer') this.cursor.drunkUntil = Math.max(this.cursor.drunkUntil, street + p.x + BEER_REACH);
      }
    }
    return { pattern, advance, drunk, before };
  }
}

/** Street distance reached `seconds` of riding after `street`: at the difficulty speed, or at `pinned`. */
function rideStreet(street: number, seconds: number, pinned: number | null): number {
  if (pinned !== null) return street + seconds * pinned;
  let at = street;
  for (let t = 0; t < seconds; t += 0.25) at += speedAt(at) * 0.25;
  return at;
}

/** The gap after a pattern while an effect is on: just enough for EFFECT_FREE_SECONDS of free street after its last piece, never more than `gap`. */
function effectGap(pattern: Pattern, fast: number, gap: number): number {
  const ends = pattern.pieces.filter((p) => isObstacle(p.kind) || isRail(p.kind)).map((p) => p.x + p.w);
  const free = pattern.length - Math.max(0, ...ends);
  return Math.min(gap, Math.max(0, Math.ceil(EFFECT_FREE_SECONDS * fast) - free));
}

/** The piece moved by dx along the street (its motion anchor too). */
function shifted(p: Piece, dx: number): Piece {
  const moved: Piece = { ...p, x: p.x + dx };
  if (p.data && typeof p.data.ax === 'number') moved.data = { ...p.data, ax: anchorOf(p) + dx };
  return moved;
}
