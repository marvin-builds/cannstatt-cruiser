/**
 * Test tooling for gameplay (Vitest and the playtest bots): turn the live
 * entities into a solver course and play it with the solver's best jumps,
 * like a careful player (SolverBot) or a sloppy human (HumanBot), and plan a
 * stomp (planStomp). DOM-free; not used by the game itself.
 */
import { DRUNK_DELAY_MAX, DRUNK_DELAY_MIN, PLAYER_X, TICK_DT } from '../core/config';
import { CHILL_JUMP_SCALE } from '../player/tuning';
import type { Rng } from '../core/rng';
import type { Entity, GameState, ObstacleKind } from '../types';
import { chillSpeedFactor } from './chill';
import { hitBox, isGrindable, isObstacle, isOverhead } from './catalogue';
import { buildCourse } from './course';
import { HUMAN_HOLDS } from './fairness';
import { type Body, groundBody, railBody } from './jumpsim';
import { LEDGE_FRONT_REACH } from './rules';
import { type Course, HOLDS, type Jump, type Pace, Solver } from './solver';

/** Room after the last entity the plan may use for landing. */
const OPEN_END = 400;

function live(e: Entity): boolean {
  return !e.data?.debugRail;
}

/** The entities ahead of the player in course space (x = 0 at the player). */
export function courseAhead(state: GameState): Course {
  return courseFrom(state.entities, PLAYER_X);
}

/** Live entities (cleared or hit obstacles left out) as a course with x = 0 at screen x `originX`. */
export function courseFrom(entities: readonly Entity[], originX: number): Course {
  const pieces = entities.filter((e) => live(e) && !(isObstacle(e.kind) && e.done));
  return buildCourse(pieces, originX, (goal) => goal + OPEN_END);
}

function obstaclesAhead(state: GameState): Entity[] {
  return state.entities.filter((e) => live(e) && isObstacle(e.kind) && !e.done);
}

function boxOf(e: Entity) {
  return hitBox({ ...e, kind: e.kind as ObstacleKind });
}

/** The player's support as a solver body (ground, or the rail / bench being ground). */
function startBody(state: GameState): Body {
  const p = state.player;
  if (!p.grinding) return groundBody();
  const rail = state.entities.find((e) => isGrindable(e.kind) && e.y === p.y && e.x - LEDGE_FRONT_REACH <= p.x && p.x <= e.x + e.w);
  return rail ? railBody(rail.y, rail.x + rail.w - PLAYER_X) : groundBody();
}

/**
 * How the street will scroll from now on: the chill effect slows it down and
 * lowers the jump until state.chillTimer runs out (gameplay counts it down
 * before it sets the speed and scrolls; the player jumps with the value of the
 * tick before). `speedPinned`: the speed is held by the test hook override.
 */
export function paceOf(state: GameState, speedPinned = false): Pace {
  const timer = state.chillTimer;
  const base = speedPinned ? state.speed : state.speed / chillSpeedFactor(timer);
  const timerAt = (tick: number) => Math.max(0, timer - tick * TICK_DT);
  const xs = [0];
  return {
    x(tick) {
      for (let t = xs.length; t <= tick; t++) {
        const factor = speedPinned ? 1 : chillSpeedFactor(timerAt(t));
        xs.push(xs[t - 1]! + base * factor * TICK_DT);
      }
      return xs[tick]!;
    },
    jumpScale: (tick) => (timerAt(tick) > 0 ? CHILL_JUMP_SCALE : 1),
  };
}

/** The solver's most forgiving next jump from the current support (trying `holds`; see Solver.bestJump for `humanWindow`), or null. */
export function planJump(state: GameState, speedPinned = false, holds: readonly number[] = HOLDS, humanWindow = 0): Jump | null {
  return new Solver(courseAhead(state), paceOf(state, speedPinned)).bestJump(startBody(state), holds, humanWindow);
}

/** How far ahead (ticks) planStomp looks for a take-off. */
const STOMP_SEARCH_TICKS = 180;

/**
 * A jump (take-off tick, hold) from the current support that lands on a
 * person's head: it passes with stomps on but would crash without. For
 * playtests and tests of the stomp; null when none exists.
 */
export function planStomp(state: GameState, speedPinned = false): { tick: number; hold: number } | null {
  const course = courseAhead(state);
  const pace = paceOf(state, speedPinned);
  const start = startBody(state);
  const plain = new Solver(course, pace);
  const stomping = new Solver(course, pace, { stomps: true });
  for (const hold of HOLDS) {
    for (let tick = 0; tick < STOMP_SEARCH_TICKS; tick++) {
      if (stomping.jumpWorks(tick, hold, start) && !plain.jumpWorks(tick, hold, start)) return { tick, hold };
    }
  }
  return null;
}

/**
 * What a plan depends on besides the clock: the live entities, the support
 * and whether the chill effect is on. A bot that found nothing to jump does
 * not plan again until it changes (new entities only appear far ahead).
 */
function planKey(state: GameState): string {
  const ahead = state.entities.filter((e) => live(e) && !e.done);
  const newest = Math.max(0, ...ahead.map((e) => e.id));
  return `${newest}|${ahead.length}|${state.player.grinding}|${state.chillTimer > 0}`;
}

/** Ticks of look-ahead for ducking: down a little early, like a careful human (ducked is never less safe on the ground). */
const DUCK_LOOKAHEAD = 8;

/**
 * Plays like a careful human: whenever supported and idle, plans the next
 * jump and commits to it, and ducks while an overhead obstacle is about to
 * pass over it. Before every tick call `next(state)` and apply the returned
 * action change, and hold duck while `duck(state)` is true.
 */
export class SolverBot {
  private wait = -1;
  /** planKey of the last plan that found nothing to jump. */
  private idle: string | null = null;
  private hold = 0;
  private holding = 0;

  /** `speedPinned`: the test hook holds the speed (no chill slowdown to plan for). */
  constructor(private readonly speedPinned = false) {}

  next(state: GameState): 'press' | 'release' | null {
    if (this.holding > 0) {
      this.holding--;
      return this.holding === 0 ? 'release' : null;
    }
    const p = state.player;
    if (this.wait < 0) {
      if (!(p.grounded || p.grinding) || p.state === 'crash' || planKey(state) === this.idle) return null;
      const jump = planJump(state, this.speedPinned);
      this.idle = jump ? null : planKey(state);
      if (!jump) return null;
      this.wait = jump.tick;
      this.hold = jump.hold;
    }
    if (this.wait > 0) {
      this.wait--;
      return null;
    }
    this.wait = -1;
    this.holding = this.hold;
    return 'press';
  }

  /** Whether duck should be held for the next tick (it only counts on the ground). */
  duck(state: GameState): boolean {
    const reach = state.speed * TICK_DT * DUCK_LOOKAHEAD + 1;
    const body = state.player.hitbox;
    return obstaclesAhead(state).some((e) => {
      if (!isOverhead(e.kind)) return false;
      const box = boxOf(e);
      return box.x <= body.x + body.w + reach && box.x + box.w >= body.x - 1;
    });
  }
}

/** How sloppy the human bot plays (ticks). */
export interface HumanStyle {
  /** The take-off lands up to this many ticks early or late. */
  takeoffJitter: number;
  /** The only hold lengths a human tells apart (tap, half, full). */
  holds: readonly number[];
  /** Ducking starts up to this many ticks earlier or later than the careful bot's. */
  duckJitter: number;
}

/** Ticks a drunk human presses early: about the mean drunk input delay. */
const DRUNK_LAG = Math.round((DRUNK_DELAY_MIN + DRUNK_DELAY_MAX) / 2);

export const HUMAN_STYLE: HumanStyle = { takeoffJitter: 4, holds: HUMAN_HOLDS, duckJitter: 4 };

/**
 * Plays like a real, imperfect human: plans like SolverBot but only with a
 * few hold lengths, and takes off up to `takeoffJitter` ticks early or late;
 * ducks with jittered timing. While drunk it presses DRUNK_LAG ticks early
 * (it feels the mean input delay, core/drunk.ts) and aims where the window
 * also absorbs the delay's spread. The jitter comes from its own `rng`, so
 * runs replay per seed. Same driving protocol as SolverBot.
 */
export class HumanBot {
  private wait = -1;
  /** planKey of the last plan that found nothing to jump. */
  private idle: string | null = null;
  private hold = 0;
  private holding = 0;
  /** Per overhead obstacle id: ticks of look-ahead before ducking. */
  private readonly duckLead = new Map<number, number>();

  constructor(
    private readonly rng: Rng,
    private readonly speedPinned = false,
    private readonly style: HumanStyle = HUMAN_STYLE,
  ) {}

  next(state: GameState): 'press' | 'release' | null {
    if (this.holding > 0) {
      this.holding--;
      return this.holding === 0 ? 'release' : null;
    }
    const p = state.player;
    if (this.wait < 0) {
      if (!(p.grounded || p.grinding) || p.state === 'crash' || planKey(state) === this.idle) return null;
      // Aims where its jitter (and the drunk delay's spread) still lands somewhere fair, and grinds only when that window absorbs it.
      const drunk = state.drunkTimer > 0;
      const window = 2 * this.style.takeoffJitter + 1 + (drunk ? DRUNK_DELAY_MAX - DRUNK_DELAY_MIN : 0);
      const jump = planJump(state, this.speedPinned, this.style.holds, window);
      this.idle = jump ? null : planKey(state);
      if (!jump) return null;
      const j = this.style.takeoffJitter;
      this.wait = Math.max(0, jump.tick + this.rng.int(-j, j) - (drunk ? DRUNK_LAG : 0));
      this.hold = jump.hold;
    }
    if (this.wait > 0) {
      this.wait--;
      return null;
    }
    this.wait = -1;
    this.holding = this.hold;
    return 'press';
  }

  duck(state: GameState): boolean {
    const step = state.speed * TICK_DT;
    const body = state.player.hitbox;
    const j = this.style.duckJitter;
    return obstaclesAhead(state).some((e) => {
      if (!isOverhead(e.kind)) return false;
      let lead = this.duckLead.get(e.id);
      if (lead === undefined) {
        lead = DUCK_LOOKAHEAD + this.rng.int(-j, j);
        this.duckLead.set(e.id, lead);
      }
      const box = boxOf(e);
      return box.x <= body.x + body.w + step * lead + 1 && box.x + box.w >= body.x - 1;
    });
  }
}
