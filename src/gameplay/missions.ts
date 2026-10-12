/**
 * Missions (ROADMAP 52 Phase 3 point 11): small goals for the calm moments
 * of a run, one at a time ("2 Leute stompen", "3 s grinden", ...).
 *
 * - None in the first MISSION_FIRST_SECONDS of playing; after a completed
 *   one a pause of MISSION_PAUSE_SECONDS, after a dropped one
 *   MISSION_RETRY_SECONDS.
 * - The kind is drawn with the run's rng from the kinds that have a chance
 *   now: never the last kind again, `stomp` only where people walk the
 *   street, `highFive` only while a NorDIY park is planned ahead
 *   (state.park, its start not reached yet; weighted up, the park is rare).
 * - Goals (missionGoal) are small, reachable in about 20-45 s of normal
 *   play, and grow gently with the missions done in the run (MISSION_GOALS:
 *   first, step, most). Kid mode gets the same kinds with goals growing at
 *   half the pace (the same or gentler).
 * - Progress comes from the existing events (the gameplay system calls
 *   count): a stomp, a completed stunt line (stuntEnd.completed), a kickflip
 *   with full points (airTrick.full), a star, a high five; grinding is
 *   counted here per tick while player.grinding, in whole seconds.
 * - The goal reached: the bonus (missionBonus) is paid flat through
 *   scoring.ts addBonus, without the multiplier (it is a reward for the
 *   goal, not a trick: no combo, and its worst case per second stays fixed
 *   for the server's plausibility check), then missionDone, then
 *   state.mission is cleared and missionsDone counts up.
 * - A crash never cancels a mission. A high five mission whose park passes
 *   (or whose plan is dropped) ends without missionDone: state.mission goes
 *   back to null.
 */
import type { GameBus, GameState, MissionKind } from '../types';
import type { Rng } from '../core/rng';
import { addBonus } from './scoring';

/** What the director works with (a GameContext has it all). */
export interface MissionWorld {
  readonly state: GameState;
  readonly bus: GameBus;
  readonly rng: Rng;
}

/** Every mission kind, in a fixed order (the rng draws over it). */
export const MISSION_KINDS: readonly MissionKind[] = ['stomp', 'grind', 'stuntLine', 'kickflip', 'stars', 'highFive'];

/** Seconds of playing before the first mission of a run: first-timers learn the street first. */
export const MISSION_FIRST_SECONDS = 15;
/** Seconds between a completed mission and the next one. */
export const MISSION_PAUSE_SECONDS = 6;
/** Seconds between a dropped mission (its park passed) and the next one. */
export const MISSION_RETRY_SECONDS = 3;
/** Draw weight of a high five mission while a park is ahead (every other kind weighs 1): the chance is rare. */
const HIGH_FIVE_WEIGHT = 3;

/**
 * Goal of each kind: `first` for the run's first mission of that size, then
 * `step` more per mission done, at most `most`. Grind in whole seconds.
 */
export const MISSION_GOALS: Record<MissionKind, { first: number; step: number; most: number }> = {
  stomp: { first: 2, step: 1, most: 4 },
  grind: { first: 2, step: 1, most: 5 },
  // A stunt line comes every 30-45 s, one high fiver stands in each park.
  stuntLine: { first: 1, step: 0, most: 1 },
  kickflip: { first: 2, step: 1, most: 4 },
  stars: { first: 8, step: 4, most: 20 },
  highFive: { first: 1, step: 0, most: 1 },
};
/** Kid mode: goals grow once per this many missions done. */
const KID_GOAL_PACE = 2;

/** Bonus of the run's first mission, added per mission done, and the most (flat points, see the module comment). */
export const MISSION_BONUS_FIRST = 250;
export const MISSION_BONUS_STEP = 50;
export const MISSION_BONUS_MOST = 500;

/** Rounding slack of the summed tick times. */
const EPSILON = 1e-9;

/** The goal of a `kind` mission after `done` missions in the run. */
export function missionGoal(kind: MissionKind, done: number, kidMode: boolean): number {
  const { first, step, most } = MISSION_GOALS[kind];
  const level = kidMode ? Math.floor(done / KID_GOAL_PACE) : done;
  return Math.min(most, first + step * level);
}

/** The bonus for completing a mission after `done` missions in the run. */
export function missionBonus(done: number): number {
  return Math.min(MISSION_BONUS_MOST, MISSION_BONUS_FIRST + MISSION_BONUS_STEP * done);
}

/** A NorDIY park is planned and its start not reached yet. */
const parkAhead = (state: GameState) => state.park !== null && state.distance < state.park.start;
/** The high five's park is gone: passed or its plan dropped. */
const parkGone = (state: GameState) => state.park === null || state.distance > state.park.end;

export class MissionDirector {
  /** Seconds until the next mission may start (counted only while none runs). */
  private wait = MISSION_FIRST_SECONDS;
  /** The kind of the last mission (never drawn twice in a row). */
  private last: MissionKind | null = null;
  /** Seconds ground on rails, benches and ledges during a grind mission. */
  private ground = 0;

  reset(): void {
    this.wait = MISSION_FIRST_SECONDS;
    this.last = null;
    this.ground = 0;
  }

  /** Every playing tick. `people`: people walk the street here (a stomp mission has a chance). */
  update(world: MissionWorld, dt: number, people: boolean): void {
    const { state } = world;
    const mission = state.mission;
    if (!mission) {
      this.wait -= dt;
      if (this.wait <= EPSILON) this.begin(world, this.draw(world, people));
      return;
    }
    if (mission.kind === 'highFive' && parkGone(state)) {
      state.mission = null;
      this.wait = MISSION_RETRY_SECONDS;
      return;
    }
    if (mission.kind === 'grind' && state.player.grinding) {
      this.ground += dt;
      this.progress(world, Math.floor(this.ground + EPSILON));
    }
  }

  /** One more `kind` done (from its event); counts only for a running mission of that kind. */
  count(world: MissionWorld, kind: MissionKind): void {
    const mission = world.state.mission;
    if (mission?.kind === kind) this.progress(world, mission.progress + 1);
  }

  /** Starts a `kind` mission now, with the goal for the missions done so far. */
  begin(world: MissionWorld, kind: MissionKind): void {
    const { state } = world;
    const goal = missionGoal(kind, state.missionsDone, state.kidMode);
    state.mission = { kind, goal, progress: 0 };
    this.last = kind;
    this.ground = 0;
    world.bus.emit('missionStart', { kind, goal });
  }

  private progress(world: MissionWorld, progress: number): void {
    const { state } = world;
    const mission = state.mission!;
    mission.progress = Math.min(progress, mission.goal);
    if (mission.progress < mission.goal) return;
    const points = addBonus(state, world.bus, missionBonus(state.missionsDone));
    state.mission = null;
    state.missionsDone += 1;
    this.wait = MISSION_PAUSE_SECONDS;
    world.bus.emit('missionDone', { kind: mission.kind, goal: mission.goal, points });
  }

  /** A kind with a chance now, drawn with the run's rng. */
  private draw(world: MissionWorld, people: boolean): MissionKind {
    const { state, rng } = world;
    const weightOf = (kind: MissionKind) => {
      if (kind === this.last || (kind === 'stomp' && !people)) return 0;
      if (kind === 'highFive') return parkAhead(state) ? HIGH_FIVE_WEIGHT : 0;
      return 1;
    };
    let roll = rng.next() * MISSION_KINDS.reduce((sum, kind) => sum + weightOf(kind), 0);
    for (const kind of MISSION_KINDS) {
      roll -= weightOf(kind);
      if (roll < 0) return kind;
    }
    return 'stars';
  }
}
