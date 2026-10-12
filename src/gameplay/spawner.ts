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
 * first pattern after it. Its shape comes from a shuffle bag (stairs, hops,
 * mixed, stunt-line.ts drawShape), so a run sees them evenly. A line's
 * street holds its kickers and a few low obstacles under its launch ledges
 * (line-street.ts), and its length
 * covers every landing off it; the next pattern is checked across the
 * boundary with those obstacles like after any pattern. Where its upper
 * level leaves the street below quiet for longer than QUIET_SECONDS, a few
 * stars at riding height fill it (street.ts quietStreetStars).
 *
 * Fan crowds (ROADMAP 76, crowd.ts): at most once per Bad Cannstatt visit,
 * never in the first CROWD_FIRST_SECONDS, drawn with CROWD_CHANCE at the
 * visit's first pattern (crowdDue), the crowd is the first pattern from its
 * drawn spot on where the player is sober and not chilled, no stunt line or
 * park just ended, and the whole crowd fits in the zone's stretch; joints and
 * stunt lines due there go first. A crowd that cannot be bounced fairly at
 * those speeds (planCrowd: null) is dropped for the visit.
 *
 * The NorDIY park (ROADMAP 36, park-line.ts): once per Bad Cannstatt visit
 * (`zoneAt` gives PARK_ZONE; any other zone arms the next visit) the next
 * pattern is the park, never before PARK_FIRST_SECONDS of the run, never
 * while the player may be drunk or in the chill effect's street, never right
 * after a stunt line (PARK_AFTER_LINE_SECONDS), and only where the whole park
 * fits in the zone's stretch (parkMaxLength, PARK_ZONE_MARGIN), never at a
 * pinned speed below PARK_MIN_SPEED. Its start
 * may be pulled back to PARK_FIRST_SECONDS or (planning ahead with
 * `workPerTick`, as the game does) pushed out to PARK_ANNOUNCE ahead of the
 * player by empty street (at most PARK_MAX_LEAD), so the plan (`park`) is
 * known well before the park comes on screen. The park pattern
 * is never delayed by planning (its plan finishes when due), so its pieces
 * lie exactly where the plan says: a piece at run distance d is at screen x
 * `PLAYER_X + d - distance`. Inside the park the speed ramp pauses
 * (`rampDistance`), the next regular stunt line comes STUNT_LINE_INTERVAL[0]
 * seconds after it at the earliest.
 *
 * Quiet cap (ROADMAP 52): from QUIET_FROM_SECONDS of a run on, the gap
 * after a pattern is cut so the street never goes longer than QUIET_SECONDS
 * without something to react to (street.ts), never below the free street
 * every pattern leaves (effectGap); a planning delay only fills what is left
 * of it (`slack`), and the empty street before a park gets star arcs
 * (leadStars).
 *
 * Planning ahead (`workPerTick`): the game plans up to PLAN_AHEAD patterns
 * ahead, spending at most `workPerTick` solver units per tick (patterns.ts
 * planSteps), so no tick stalls on a hard pattern. If a pattern is due before
 * its plan is done, empty street comes first (up to PLAN_DELAY_MAX and the
 * quiet cap's slack, after that it finishes at once). The units are
 * deterministic, so runs replay exactly. Without `workPerTick` every pattern is planned when it is due.
 */
import { PLAYER_X, VIEW_MAX_W } from '../core/config';
import { CHILL_DURATION } from '../core/chill';
import type { Rng } from '../core/rng';
import type { Entity, ParkPlan } from '../types';
import { CHILL_SPEED_SCALE, chillStreet } from './chill';
import { gapAt, speedAt, tierAt, TOP_SPEED } from './difficulty';
import { takeoffWindowAt } from './fairness';
import { isObstacle, isRail } from './catalogue';
import { itemOf } from './items';
import { anchorOf, motionOf, withMotion } from './motion';
import { jointPattern, jumpArcStars, leadFor, type Pattern, type Piece, planSteps } from './patterns';
import { HIGH_FIVER_X, PARK_MIN_SPEED, parkMaxLength, parkPiecesOf, planParkLine } from './park-line';
import { asArc, linkArcs } from './star-arcs';
import { CROWD_FIRST_SECONDS, CROWD_ZONE, CROWD_ZONE_MARGIN, type CrowdCursor, crowdDue, crowdReach, planCrowd } from './crowd';
import { drawShape, planStuntLine, type StuntShape } from './stunt-line';
import { lastThreatEnd, quietStreetStars } from './street';
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

/** Seconds of riding before the NorDIY park can start: first-timers learn the street first. */
export const PARK_FIRST_SECONDS = 20;
/** The park's zone: Bad Cannstatt. */
const PARK_ZONE = 2;
/**
 * The park plan is shown at least this much street before its start reaches
 * the player: then the start is more than a whole (widest) view width beyond
 * the right screen edge.
 */
export const PARK_ANNOUNCE = 2 * VIEW_MAX_W - PLAYER_X + 32;
/** Street ridden while the park's plan is worked out under the per-tick budget (a park costs up to ~8000 units, 20 ticks). */
const PARK_PLAN_SLACK = 96;
/** The most empty street put before the park to start it later (the run's first seconds, the announcement). */
const PARK_MAX_LEAD = 640;
/** Street kept between the park and its zone's gateways (their landmarks). */
const PARK_ZONE_MARGIN = 128;
/** Seconds of riding between the end of a stunt line and the park. */
const PARK_AFTER_LINE_SECONDS = 4;

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
/**
 * ROADMAP 52: from QUIET_FROM_SECONDS of a run on, the sober street has
 * something to react to (street.ts) at least every QUIET_SECONDS of riding
 * (planned at the pattern's slowest speed; the quiet-time test allows 2.5 s
 * for a faster next lead).
 */
export const QUIET_SECONDS = 2.2;
const QUIET_FROM_SECONDS = 15;

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
  /** Called with every pattern as it comes onto the street and the street distance of its start (tests, the debug hook). */
  onSpawn?: (pattern: Pattern, street: number) => void;
}

const SOBER: SpawnSituation = { drunk: false, kidMode: false };
/** Budget for planning without a limit. */
const UNLIMITED = Number.MAX_SAFE_INTEGER;

/** Planning state that a pattern's plan moves on (restored when plans are thrown away). */
interface Cursor extends CrowdCursor {
  /** The crowd may come from this street distance on (null: not drawn yet, set at the run's first plan). */
  crowdFrom: number | null;
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
  /** Line shapes still to come in this round of the shuffle bag (stunt-line.ts drawShape), and the last one laid. */
  stuntBag: readonly StuntShape[];
  lastShape: StuntShape | null;
  /** A park may come: no park yet in this Bad Cannstatt visit (set by a pattern in another zone). */
  parkArmed: boolean;
  /** The park comes from this street distance on (null: not drawn yet, set at the run's first plan). */
  parkFrom: number | null;
  /** Street distance where the last stunt line ended. */
  lineEnd: number;
  /** The planned parks' spans [start, end): the speed ramp pauses there. */
  pauses: readonly (readonly [number, number])[];
}

interface Planned {
  pattern: Pattern;
  /** Street from this pattern's start to the next one's (length plus gap). */
  advance: number;
  /** Empty street that may still come before the next pattern while its plan finishes (the quiet cap's room left). */
  slack: number;
  drunk: boolean;
  /** The cursor before this plan. */
  before: Cursor;
  /** The park this pattern is, or null. */
  park: ParkPlan | null;
}

interface Job {
  steps: Generator<void, Planned>;
  drunk: boolean;
  before: Cursor;
  /** The park's start street when this job plans the park (it is never delayed), else null. */
  park: number | null;
}

export class Spawner {
  private rng: Rng | null = null;
  /** Screen x of the next pattern not on the street yet. */
  private nextStart = 0;
  private nextId = 1;
  private cursor: Cursor = freshCursor(0);
  /** Street distance at the run start (the first spawn call), for the first stunt line. */
  private runStart: number | null = null;
  /** Planned patterns, in street order, starting at nextStart. */
  private queue: Planned[] = [];
  /** The plan in progress (the pattern after the queue). */
  private job: Job | null = null;
  /** Empty street inserted before the next pattern while its plan finished... */
  private delayed = 0;
  /** ...at most this much (the last materialised pattern's slack). */
  private slack = Infinity;
  /** Street distance from which the quiet cap holds (null: not drawn yet, set at the run's first plan). */
  private quietFrom: number | null = null;
  private readonly budget: WorkBudget = { left: UNLIMITED };
  private readonly workPerTick: number | null;
  private readonly onSpawn: SpawnerOptions['onSpawn'];
  private work = 0;
  /** The distance the last spawn() call got (the player's run distance matching the entities). */
  private distance = 0;
  /** The last park planned (also once passed), until the next one. */
  private planned: ParkPlan | null = null;

  /** `zoneAt(street)`: the background zone at a street distance (themes the people). */
  constructor(
    private readonly zoneAt: (street: number) => number = () => 0,
    options: SpawnerOptions = {},
  ) {
    this.workPerTick = options.workPerTick ?? null;
    this.onSpawn = options.onSpawn;
  }

  /** Solver units spent planning in the last spawn() call. */
  get lastWork(): number {
    return this.work;
  }

  /** The NorDIY park planned last (in run distances), known from PARK_ANNOUNCE before its start on; null before the first. */
  get park(): ParkPlan | null {
    return this.planned;
  }

  /**
   * The distance the speed ramp has got to at run distance `distance`: the
   * ramp pauses inside every planned park and goes on from there after it.
   */
  rampDistance(distance: number): number {
    let ramp = distance;
    for (const [start, end] of this.cursor.pauses) ramp -= Math.max(0, Math.min(distance, end) - start);
    return ramp;
  }

  /**
   * Keeps the run distances [start, end) free for a park laid from outside
   * (the debug hook, distance = the current run distance): plans not on the
   * street yet start over after it, and the speed ramp pauses there. What is
   * already on the street stays (the caller clears the span).
   */
  reserve(start: number, end: number, distance: number): void {
    const before = this.queue[0]?.before ?? this.job?.before;
    if (before) this.cursor = { ...before };
    if (this.queue.some((p) => p.park === this.planned)) this.planned = null;
    this.queue = [];
    this.job = null;
    this.nextStart = Math.max(this.nextStart, PLAYER_X + end - distance + gapAt(end));
    this.cursor.previous = [];
    this.cursor.parkArmed = false;
    this.cursor.pauses = [...this.cursor.pauses, [start, end]];
  }

  reset(rng: Rng): void {
    this.rng = rng;
    this.nextStart = PLAYER_X + FIRST_START;
    this.nextId = 1;
    this.cursor = freshCursor(JOINT_FIRST_DISTANCE + rng.int(0, JOINT_JITTER));
    this.planned = null;
    this.runStart = null;
    this.queue = [];
    this.job = null;
    this.delayed = 0;
    this.slack = Infinity;
    this.quietFrom = null;
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
    this.distance = distance;
    this.runStart ??= distance;
    if (situation.drunk && this.hasSoberPlans()) this.discardPlans();
    if (this.workPerTick !== null) this.planAhead(distance, speedOverride, situation);
    const edge = viewWidth + SPAWN_MARGIN;
    while (this.nextStart <= edge) {
      const planned = this.queue.shift();
      if (planned) {
        this.materialise(planned, entities);
      } else if (this.workPerTick !== null && this.delayed < this.delayLimit() && this.job?.park == null) {
        // Not planned yet: a little more empty street while the plan goes on.
        const wait = Math.min(this.delayLimit() - this.delayed, edge + 1 - this.nextStart);
        this.nextStart += wait;
        this.delayed += wait;
      } else {
        this.materialise(this.finishNow(distance, speedOverride, situation), entities);
      }
    }
  }

  private materialise(planned: Planned, entities: Entity[]): void {
    this.onSpawn?.(planned.pattern, this.distance + this.nextStart - PLAYER_X);
    const first = entities.length;
    for (const piece of planned.pattern.pieces) {
      const e: Entity = { ...piece, id: this.nextId++, x: this.nextStart + piece.x, done: false };
      const motion = motionOf(e);
      if (motion) withMotion(e, motion, e.x);
      entities.push(e);
    }
    linkArcs(entities, first);
    this.nextStart += planned.advance;
    this.delayed = 0;
    this.slack = planned.slack;
  }

  /** The most empty street to put before the next pattern while its plan finishes. */
  private delayLimit(): number {
    return Math.min(PLAN_DELAY_MAX, this.slack);
  }

  /** Spends this tick's budget on the plans ahead. */
  private planAhead(distance: number, speedOverride: number | null, situation: SpawnSituation): void {
    const units = this.workPerTick!;
    this.budget.left = units;
    while (this.queue.length < PLAN_AHEAD && this.budget.left > 0) {
      this.job ??= this.startJob(distance, speedOverride, situation);
      const step = this.job.steps.next();
      if (!step.done) break;
      this.queue.push(this.done(step.value));
    }
    this.work += units - Math.max(0, this.budget.left);
  }

  /** The next pattern, planned now whatever it costs. */
  private finishNow(distance: number, speedOverride: number | null, situation: SpawnSituation): Planned {
    this.budget.left = UNLIMITED;
    this.job ??= this.startJob(distance, speedOverride, situation);
    let step = this.job.steps.next();
    while (!step.done) step = this.job.steps.next();
    this.work += UNLIMITED - this.budget.left;
    return this.done(step.value);
  }

  /** The job's plan is done: a park plan is shown from now on. */
  private done(planned: Planned): Planned {
    this.job = null;
    if (planned.park) this.planned = planned.park;
    return planned;
  }

  /** A plan for the pattern after the queued ones. */
  private startJob(distance: number, speedOverride: number | null, situation: SpawnSituation): Job {
    let start = this.nextStart;
    for (const p of this.queue) start += p.advance;
    const street = distance + start - PLAYER_X;
    const drunk = situation.drunk || street < this.cursor.drunkUntil;
    const before = { ...this.cursor };
    const park = drunk ? null : this.parkStart(street, speedOverride);
    const steps = park === null ? this.plan(this.rng!, street, speedOverride, drunk, situation.kidMode, before) : this.planPark(this.rng!, street, park, speedOverride, before);
    return { steps, drunk, before, park };
  }

  /** Where the park starts if the pattern at `street` is the park (see the class comment), else null. Moves the visit's arming on. */
  private parkStart(street: number, speedOverride: number | null): number | null {
    const c = this.cursor;
    if (this.zoneAt(street) !== PARK_ZONE) c.parkArmed = true;
    c.parkFrom ??= rideStreet(this.runStart ?? street, PARK_FIRST_SECONDS, speedOverride);
    if (!c.parkArmed || street < c.chillUntil || street < c.lineEnd) return null;
    // Planned when due (no workPerTick, tests only), the park is not announced ahead: the layout stays the budgeted one.
    const announced = this.workPerTick === null ? street : this.distance + PARK_ANNOUNCE + PARK_PLAN_SLACK;
    const start = Math.max(street, c.parkFrom, announced);
    if (start - street > PARK_MAX_LEAD) return null;
    const speed = speedOverride ?? speedAt(this.rampDistance(start));
    // A pinned crawl or standstill (tests, debug): no park, it stays armed for when the speed is free.
    if (speed < PARK_MIN_SPEED) return null;
    const length = parkMaxLength(speed);
    const fits = this.zoneAt(start - PARK_ZONE_MARGIN) === PARK_ZONE && this.zoneAt(start + length + PARK_ZONE_MARGIN) === PARK_ZONE;
    return fits ? start : null;
  }

  /**
   * Plans the park starting at `start` as the pattern at `street` (the street
   * before it stays empty). Inside the park the speed stays at the ramp's
   * speed at its start (or the pinned one).
   */
  private *planPark(rng: Rng, street: number, start: number, speedOverride: number | null, before: Cursor): Generator<void, Planned> {
    const speed = speedOverride ?? speedAt(this.rampDistance(start));
    const line = yield* planParkLine(rng, [speed], Math.round(start), this.budget);
    const lead = start - street;
    const end = start + line.length;
    const c = this.cursor;
    const pieces = [...leadStars(lead, speed), ...line.pieces.map((p) => ({ ...p, x: p.x + lead }))];
    const pattern: Pattern = { name: line.name, pieces, length: line.length + lead };
    const { gap, slack } = this.gapAfter(street, pattern, speed, speed, speedOverride, false);
    const advance = pattern.length + gap;
    c.previous = pattern.pieces.map((p) => shifted(p, -advance));
    c.parkArmed = false;
    c.pauses = [...c.pauses, [start, end]];
    c.lineEnd = end;
    c.nextStunt = Math.max(c.nextStunt ?? rideStreet(this.runStart ?? street, STUNT_FIRST_SECONDS, speedOverride), rideStreet(end, STUNT_LINE_INTERVAL[0], speedOverride));
    return { pattern, advance, slack, drunk: false, before, park: { start, end, pieces: parkPiecesOf(line, start) } };
  }

  /**
   * The fan crowd may be laid at `street` (crowd.ts): the player is sober and
   * not chilled there, no stunt line or park just ended, and the whole crowd
   * fits in its Bad Cannstatt stretch.
   */
  private crowdFits(street: number, fast: number, drunk: boolean): boolean {
    const c = this.cursor;
    if (drunk || street < c.chillUntil || street < c.lineEnd) return false;
    return this.zoneAt(street - CROWD_ZONE_MARGIN) === CROWD_ZONE && this.zoneAt(street + crowdReach(fast) + CROWD_ZONE_MARGIN) === CROWD_ZONE;
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
    const dropped = sober >= 0 ? this.queue.slice(sober) : [];
    if (dropped.some((p) => p.park === this.planned)) this.planned = null;
    if (sober >= 0) this.queue.length = sober;
    this.job = null;
  }

  /** Plans the pattern starting at `street` and moves the cursor on (only at the end, so a dropped plan leaves it as it was). */
  private *plan(rng: Rng, street: number, speedOverride: number | null, drunk: boolean, kidMode: boolean, before: Cursor): Generator<void, Planned> {
    const pinned = speedOverride !== null;
    const speeds = pinned ? [speedOverride] : [speedAt(this.rampDistance(street)), speedAt(this.rampDistance(street + SPEED_SPAN + PLAN_DELAY_MAX))];
    let pattern: Pattern | null = null;
    const fast = Math.max(...speeds);
    const pace = pinned ? speedOverride : null;
    this.cursor.nextStunt ??= rideStreet(this.runStart ?? street, STUNT_FIRST_SECONDS, pace);
    this.cursor.crowdFrom ??= rideStreet(this.runStart ?? street, CROWD_FIRST_SECONDS, pace);
    const crowd = crowdDue(this.cursor, this.zoneAt(street), street, this.cursor.crowdFrom, rng);
    if (street >= this.cursor.nextJoint && !drunk) {
      pattern = jointPattern(fast);
      this.cursor.nextJoint = street + JOINT_SPACING + rng.int(0, JOINT_JITTER);
      this.cursor.chillUntil = street + pattern.length + CHILL_REACH;
      this.cursor.chilledUntil = street + pattern.length + chillStreet(fast);
    } else if (street >= this.cursor.nextStunt && !drunk && street >= this.cursor.chillUntil) {
      const { shape, bag } = drawShape(rng, this.cursor.stuntBag, this.cursor.lastShape);
      pattern = yield* planStuntLine(rng, speeds, this.zoneAt(street), Math.round(street), this.budget, shape);
      // Its upper level can leave the street below empty for long: riding-height stars keep the quiet cap there.
      pattern.pieces.push(...quietStreetStars(pattern.pieces, Math.floor(QUIET_SECONDS * Math.min(...speeds))));
      this.cursor.stuntBag = bag;
      this.cursor.lastShape = shape;
      this.cursor.nextStunt = rideStreet(street, rng.range(...STUNT_LINE_INTERVAL), pace);
      this.cursor.lineEnd = rideStreet(street + pattern.length, PARK_AFTER_LINE_SECONDS, pace);
    } else {
      const chilled = street < this.cursor.chilledUntil;
      const effect = drunk || chilled;
      const options = { zone: this.zoneAt(street), chillSpeeds: undefined as number[] | undefined, before: this.cursor.previous, window: takeoffWindowAt(street), drunk, effect, budget: this.budget, kidMode };
      if (street < this.cursor.chillUntil) {
        // A pinned speed stays pinned while chilled; otherwise from the slowest chill speed through the ramp back up.
        const low = Math.min(...speeds) * CHILL_SPEED_SCALE;
        const high = Math.max(...speeds);
        options.chillSpeeds = pinned ? speeds : [low, (low + high) / 2, high];
      }
      const tier = chilled ? Math.min(tierAt(street), CHILLED_TIER) : tierAt(street);
      if (crowd && this.crowdFits(street, fast, drunk)) {
        // Tried once per visit: a crawl with no fair row gives up and plans the street as usual.
        this.cursor.crowdAt = null;
        pattern = yield* planCrowd(rng, speeds, { kidMode, window: options.window, before: options.before, budget: this.budget });
      }
      pattern ??= yield* planSteps(rng, tier, speeds, options);
    }
    if (!kidMode) {
      for (const p of pattern.pieces) {
        if (p.kind === 'wasenGuest' && itemOf(p, false) === 'beer') this.cursor.drunkUntil = Math.max(this.cursor.drunkUntil, street + p.x + BEER_REACH);
      }
    }
    // After a joint too: the next pattern is ridden chilled.
    const { gap, slack } = this.gapAfter(street, pattern, Math.min(...speeds), fast, pace, drunk || street < this.cursor.chilledUntil);
    const advance = pattern.length + gap;
    this.cursor.previous = pattern.pieces.map((p) => shifted(p, -advance));
    return { pattern, advance, slack, drunk, before, park: null };
  }

  /**
   * The gap after the pattern at `street` (speeds `slow`..`fast`) and the
   * empty street a planning delay may still add after it (`slack`). Once the
   * quiet cap holds, the free street after its last threat, the gap, any delay
   * and the next pattern's lead fit QUIET_SECONDS. A sober pattern gets the
   * difficulty's gap, cut to that; while an effect may be on (`effect`) only
   * the least free street every pattern leaves (effectGap), which a sober one
   * never goes below.
   */
  private gapAfter(street: number, pattern: Pattern, slow: number, fast: number, pace: number | null, effect: boolean): { gap: number; slack: number } {
    const full = gapAt(street);
    const least = effectGap(pattern, fast, full);
    this.quietFrom ??= rideStreet(this.runStart ?? street, QUIET_FROM_SECONDS, pace);
    if (street + pattern.length < this.quietFrom) return { gap: effect ? least : full, slack: Infinity };
    // The next pattern's lead: longer when it may be ridden drunk (after a Wasen visitor's Maßkrug).
    const lead = leadFor(fast, street + pattern.length < this.cursor.drunkUntil);
    const room = Math.floor(QUIET_SECONDS * slow) - (pattern.length - lastThreatEnd(pattern.pieces)) - lead;
    const gap = effect ? least : Math.max(least, Math.min(full, room));
    return { gap, slack: Math.max(0, room - gap) };
  }
}

function freshCursor(nextJoint: number): Cursor {
  return { crowdArmed: true, crowdAt: null, crowdFrom: null, previous: [], nextJoint, chillUntil: -Infinity, chilledUntil: -Infinity, drunkUntil: -Infinity, nextStunt: null, stuntBag: [], lastShape: null, parkArmed: true, parkFrom: null, lineEnd: -Infinity, pauses: [] };
}

/** Street distance reached `seconds` of riding after `street`: at the difficulty speed, or at `pinned`. */
function rideStreet(street: number, seconds: number, pinned: number | null): number {
  if (pinned !== null) return street + seconds * pinned;
  let at = street;
  for (let t = 0; t < seconds; t += 0.25) at += speedAt(at) * 0.25;
  return at;
}

/** The gap after a pattern while an effect is on (and the least after any): just enough for EFFECT_FREE_SECONDS of free street after its last piece, never more than `gap`. */
function effectGap(pattern: Pattern, fast: number, gap: number): number {
  const ends = pattern.pieces.filter((p) => isObstacle(p.kind) || isRail(p.kind)).map((p) => p.x + p.w);
  const free = pattern.length - Math.max(0, ...ends);
  return Math.min(gap, Math.max(0, Math.ceil(EFFECT_FREE_SECONDS * fast) - free));
}

/** Street kept free of lead stars before the high fiver (his high five stays readable). */
const FIVER_ROOM = 40;

/**
 * Star arcs over the empty street `lead` px long before a park (planPark):
 * the first where the gap before it expects the next threat, then one at
 * least every QUIET_SECONDS of riding at `speed` until the high fiver, none
 * within FIVER_ROOM of him. Stars are always fair (nothing to crash into).
 */
function leadStars(lead: number, speed: number): Piece[] {
  const quiet = Math.floor(QUIET_SECONDS * speed);
  const fiver = lead + HIGH_FIVER_X;
  const span = (stars: Piece[]) => [stars[0]!.x, stars[stars.length - 1]!.x + stars[stars.length - 1]!.w] as const;
  const [first, last] = span(jumpArcStars(0, speed));
  const out: Piece[] = [];
  let arcs = 0;
  // As if a threat had just ended here: the next one is due by the lead the gap before the park left.
  let end = leadFor(speed) - quiet;
  while (fiver - end > quiet) {
    // Take-off so the arc's first star comes a little before the quiet cap, its last one clear of the high fiver.
    const from = Math.max(0, Math.min(end + Math.round(0.85 * quiet) - first, fiver - FIVER_ROOM - last));
    const arc = jumpArcStars(from, speed);
    if (span(arc)[0] <= end) break;
    out.push(...asArc(arc, `lead${arcs++}`));
    end = span(arc)[1];
  }
  return out;
}

/** The piece moved by dx along the street (its motion anchor too). */
function shifted(p: Piece, dx: number): Piece {
  const moved: Piece = { ...p, x: p.x + dx };
  if (p.data && typeof p.data.ax === 'number') moved.data = { ...p.data, ax: anchorOf(p) + dx };
  return moved;
}
