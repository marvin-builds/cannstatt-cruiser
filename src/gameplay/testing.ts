/**
 * Test tooling for gameplay (Vitest and the playtest bot): turn the live
 * entities into a solver course and play it with the solver's best jumps.
 * DOM-free; not used by the game itself.
 */
import { PLAYER_X, TICK_DT } from '../core/config';
import { CHILL_JUMP_SCALE } from '../player/tuning';
import type { Entity, GameState, ObstacleKind } from '../types';
import { chillSpeedFactor } from './chill';
import { hitBox, isGrindable, isObstacle, isOverhead } from './catalogue';
import { buildCourse } from './course';
import { type Body, groundBody, railBody } from './jumpsim';
import { type Course, type Jump, type Pace, Solver } from './solver';

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
  const rail = state.entities.find((e) => isGrindable(e.kind) && e.y === p.y && e.x <= p.x && p.x <= e.x + e.w);
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

/** The solver's most forgiving next jump from the current support, or null. */
export function planJump(state: GameState, speedPinned = false): Jump | null {
  return new Solver(courseAhead(state), paceOf(state, speedPinned)).bestJump(startBody(state));
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
      if (!(p.grounded || p.grinding) || p.state === 'crash') return null;
      const jump = planJump(state, this.speedPinned);
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
