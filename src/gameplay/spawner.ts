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
 * patterns come, fair for the drunk input delay, with a wider gap. When the
 * situation turns drunk, patterns planned ahead but not yet on the street are
 * planned again.
 *
 * Planning ahead (`workPerTick`): the game plans up to PLAN_AHEAD patterns
 * ahead, spending at most `workPerTick` solver units per tick (patterns.ts
 * planSteps), so no tick stalls on a hard pattern. If a pattern is due before
 * its plan is done, empty street comes first (up to PLAN_DELAY_MAX, after
 * that it finishes at once). The units are deterministic, so runs replay
 * exactly. Without `workPerTick` every pattern is planned when it is due.
 */
import { MAX_SPEED, PLAYER_X, VIEW_MAX_W } from '../core/config';
import { CHILL_DURATION } from '../core/chill';
import type { Rng } from '../core/rng';
import type { Entity } from '../types';
import { CHILL_SPEED_SCALE } from './chill';
import { gapAt, speedAt, tierAt } from './difficulty';
import { DRUNK_GAP_SECONDS, takeoffWindowAt } from './fairness';
import { itemOf } from './items';
import { anchorOf, motionOf, withMotion } from './motion';
import { jointPattern, type Pattern, type Piece, planSteps } from './patterns';
import type { WorkBudget } from './solver';

/** Street distance from the player to the first pattern (a few empty seconds). */
const FIRST_START = 380;
/** A pattern is materialised once its start is this close to the right edge. */
const SPAWN_MARGIN = 16;
/** The speed range checked for a pattern spans this much street after its start... */
const SPEED_SPAN = 500;
/** ...plus the most empty street that can come before it while its plan finishes. */
const PLAN_DELAY_MAX = 160;

/** Solver units the live game spends on planning per tick (~1 ms on a desktop, see docs/TESTING.md Frame times). */
export const PLAN_WORK_PER_TICK = 1000;
/** Patterns planned ahead of the one due next. */
const PLAN_AHEAD = 2;

/** Street distance before the first joint can come: over 30 s even at the start speed ramp. */
export const JOINT_FIRST_DISTANCE = 3300;
/** Street distance between joints: at least 45 s even at MAX_SPEED (more while chilled)... */
export const JOINT_SPACING = 7500;
/** ...plus up to this much at random (also for the first one). */
const JOINT_JITTER = 2400;
/** Street the chill effect can last after the pickup (it runs CHILL_DURATION, never faster than MAX_SPEED). */
export const CHILL_REACH = Math.ceil(CHILL_DURATION * MAX_SPEED);
/**
 * Street after a Wasen visitor with a Maßkrug that is already on the street
 * when the skater could catch it and drink at once: the widest view, the
 * spawn margin and the toss.
 */
export const BEER_REACH = VIEW_MAX_W + SPAWN_MARGIN + 100;

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
  /** Patterns starting before this street distance may be ridden while chilled. */
  chillUntil: number;
  /** Patterns starting before this street distance may be ridden drunk. */
  drunkUntil: number;
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
  private cursor: Cursor = { previous: [], nextJoint: 0, chillUntil: -Infinity, drunkUntil: -Infinity };
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
    this.cursor = { previous: [], nextJoint: JOINT_FIRST_DISTANCE + rng.int(0, JOINT_JITTER), chillUntil: -Infinity, drunkUntil: -Infinity };
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

  /** Throws away every plan not on the street yet (the rng stays where it is: still deterministic). */
  private discardPlans(): void {
    const first = this.queue[0]?.before ?? this.job?.before;
    if (first) this.cursor = { ...first };
    this.queue = [];
    this.job = null;
  }

  /** Plans the pattern starting at `street` and moves the cursor on (only at the end, so a dropped plan leaves it as it was). */
  private *plan(rng: Rng, street: number, speedOverride: number | null, drunk: boolean, kidMode: boolean, before: Cursor): Generator<void, Planned> {
    const pinned = speedOverride !== null;
    const speeds = pinned ? [speedOverride] : [speedAt(street), speedAt(street + SPEED_SPAN + PLAN_DELAY_MAX)];
    let pattern: Pattern;
    if (street >= this.cursor.nextJoint) {
      pattern = jointPattern(Math.max(...speeds));
      this.cursor.nextJoint = street + JOINT_SPACING + rng.int(0, JOINT_JITTER);
      this.cursor.chillUntil = street + pattern.length + CHILL_REACH;
    } else {
      const options = { zone: this.zoneAt(street), chillSpeeds: undefined as number[] | undefined, before: this.cursor.previous, window: takeoffWindowAt(street), drunk, budget: this.budget };
      if (street < this.cursor.chillUntil) {
        // A pinned speed stays pinned while chilled; otherwise from the slowest chill speed through the ramp back up.
        const low = Math.min(...speeds) * CHILL_SPEED_SCALE;
        const high = Math.max(...speeds);
        options.chillSpeeds = pinned ? speeds : [low, (low + high) / 2, high];
      }
      pattern = yield* planSteps(rng, tierAt(street), speeds, options);
    }
    const advance = pattern.length + gapAt(street) + (drunk ? Math.round(DRUNK_GAP_SECONDS * Math.max(...speeds)) : 0);
    this.cursor.previous = pattern.pieces.map((p) => shifted(p, -advance));
    if (!kidMode) {
      for (const p of pattern.pieces) {
        if (p.kind === 'wasenGuest' && itemOf(p, false) === 'beer') this.cursor.drunkUntil = Math.max(this.cursor.drunkUntil, street + p.x + BEER_REACH);
      }
    }
    return { pattern, advance, drunk, before };
  }
}

/** The piece moved by dx along the street (its motion anchor too). */
function shifted(p: Piece, dx: number): Piece {
  const moved: Piece = { ...p, x: p.x + dx };
  if (p.data && typeof p.data.ax === 'number') moved.data = { ...p.data, ax: anchorOf(p) + dx };
  return moved;
}
