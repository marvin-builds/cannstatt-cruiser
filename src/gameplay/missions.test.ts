import { describe, expect, it } from 'vitest';
import { TICK_DT } from '../core/config';
import { EventBus } from '../core/events';
import { Rng } from '../core/rng';
import { createInitialState } from '../core/state';
import { tick } from '../player/testing';
import type { GameEvents, MissionKind, ParkPlan } from '../types';
import {
  MISSION_FIRST_SECONDS,
  MISSION_KINDS,
  MISSION_PAUSE_SECONDS,
  MISSION_RETRY_SECONDS,
  MissionDirector,
  type MissionWorld,
  missionBonus,
  missionGoal,
} from './missions';
import { quietGame, record } from './test-kit';

interface Setup extends MissionWorld {
  director: MissionDirector;
  started: GameEvents['missionStart'][];
  done: GameEvents['missionDone'][];
  scores: GameEvents['scoreChanged'][];
  order: string[];
}

function setup(seed = 1, kidMode = false): Setup {
  const state = createInitialState();
  state.mode = 'playing';
  state.kidMode = kidMode;
  const bus = new EventBus<GameEvents>();
  const world = { state, bus, rng: new Rng(seed), director: new MissionDirector(), started: [], done: [], scores: [], order: [] } as Setup;
  bus.on('missionStart', (e) => {
    world.started.push(e);
    world.order.push('missionStart');
  });
  bus.on('missionDone', (e) => {
    world.done.push(e);
    world.order.push('missionDone');
  });
  bus.on('scoreChanged', (e) => {
    world.scores.push(e);
    world.order.push('scoreChanged');
  });
  return world;
}

/** Runs the director for `seconds` of playing ticks (people around unless told otherwise). */
function run(w: Setup, seconds: number, people = true): void {
  for (let t = 0; t < Math.round(seconds / TICK_DT); t++) w.director.update(w, TICK_DT, people);
}

/** Runs until a mission is on (at most `limit` seconds). */
function untilMission(w: Setup, limit = 60, people = true): void {
  for (let t = 0; t < limit / TICK_DT && !w.state.mission; t++) w.director.update(w, TICK_DT, people);
  expect(w.state.mission).not.toBeNull();
}

/** Completes the running mission through its own progress. */
function complete(w: Setup): void {
  const mission = w.state.mission!;
  if (mission.kind === 'grind') {
    w.state.player.grinding = true;
    run(w, mission.goal + 0.1);
    w.state.player.grinding = false;
  } else {
    for (let i = 0; i < mission.goal; i++) w.director.count(w, mission.kind);
  }
}

const parkAhead = (distance: number): ParkPlan => ({ start: distance + 600, end: distance + 2000, pieces: [] });

describe('missions (ROADMAP 52 point 11)', () => {
  it(`none in the first ${MISSION_FIRST_SECONDS} s of a run, then one starts with missionStart and state.mission in sync`, () => {
    expect(MISSION_FIRST_SECONDS).toBeGreaterThanOrEqual(15);
    const w = setup();
    run(w, MISSION_FIRST_SECONDS - 0.1);
    expect(w.state.mission).toBeNull();
    expect(w.started).toEqual([]);
    run(w, 0.2);
    const mission = w.state.mission!;
    expect(mission).not.toBeNull();
    expect(mission.progress).toBe(0);
    expect(w.started).toEqual([{ kind: mission.kind, goal: mission.goal }]);
    expect(mission.goal).toBe(missionGoal(mission.kind, 0, false));
  });

  it('runs one mission at a time: no new start while one is on', () => {
    const w = setup();
    untilMission(w);
    run(w, 120);
    expect(w.started.length).toBe(1);
  });

  for (const kind of MISSION_KINDS) {
    it(`a ${kind} mission counts up to its goal, pays its bonus flat through scoring, then emits missionDone and clears`, () => {
      const w = setup();
      if (kind === 'highFive') w.state.park = parkAhead(w.state.distance);
      w.director.begin(w, kind);
      w.state.multiplier = 3;
      const goal = w.state.mission!.goal;
      if (kind === 'grind') {
        w.state.player.grinding = true;
        run(w, 1.02);
        expect(w.state.mission!.progress).toBe(1);
        run(w, goal - 1);
      } else {
        for (let i = 1; i < goal; i++) {
          w.director.count(w, kind);
          expect(w.state.mission!.progress).toBe(i);
        }
        w.director.count(w, kind);
      }
      const points = missionBonus(0);
      expect(w.state.mission).toBeNull();
      expect(w.state.missionsDone).toBe(1);
      expect(w.state.score).toBe(points);
      expect(w.done).toEqual([{ kind, goal, points }]);
      expect(w.order.slice(-2)).toEqual(['scoreChanged', 'missionDone']);
      expect(w.scores.at(-1)!.delta).toBe(points);
    });
  }

  it('progress of another kind, or with no mission on, counts nothing', () => {
    const w = setup();
    w.director.count(w, 'stomp');
    w.director.begin(w, 'stars');
    w.director.count(w, 'stomp');
    w.state.player.grinding = true;
    run(w, 3);
    expect(w.state.mission!.progress).toBe(0);
  });

  it(`pauses ${MISSION_PAUSE_SECONDS} s after a completed mission before the next`, () => {
    expect(MISSION_PAUSE_SECONDS).toBeGreaterThanOrEqual(4);
    const w = setup();
    untilMission(w);
    complete(w);
    run(w, MISSION_PAUSE_SECONDS - 0.1);
    expect(w.state.mission).toBeNull();
    run(w, 0.2);
    expect(w.state.mission).not.toBeNull();
    expect(w.started.length).toBe(2);
  });

  it('goals scale gently with missions done (2 -> 3 -> 4 stomps) and stop growing', () => {
    expect([0, 1, 2, 3, 8].map((done) => missionGoal('stomp', done, false))).toEqual([2, 3, 4, 4, 4]);
    for (const kind of MISSION_KINDS) {
      for (let done = 0; done < 10; done++) {
        expect(missionGoal(kind, done + 1, false)).toBeGreaterThanOrEqual(missionGoal(kind, done, false));
        // Kid mode: the same or gentler.
        expect(missionGoal(kind, done, true)).toBeLessThanOrEqual(missionGoal(kind, done, false));
        expect(missionGoal(kind, done, true)).toBeGreaterThanOrEqual(1);
      }
    }
    // One stunt line or one high five: one chance comes every 30-45 s, one high fiver per park.
    expect(missionGoal('stuntLine', 5, false)).toBe(1);
    expect(missionGoal('highFive', 5, false)).toBe(1);
  });

  it('the next mission uses the scaled goal', () => {
    const w = setup();
    untilMission(w);
    complete(w);
    run(w, MISSION_PAUSE_SECONDS + 0.1);
    const next = w.state.mission!;
    expect(next.goal).toBe(missionGoal(next.kind, 1, false));
  });

  it('never offers the same kind twice in a row', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const w = setup(seed);
      w.state.park = parkAhead(0);
      for (let n = 0; n < 6; n++) {
        untilMission(w);
        complete(w);
      }
      for (let i = 1; i < w.started.length; i++) expect(w.started[i]!.kind, `seed ${seed}`).not.toBe(w.started[i - 1]!.kind);
    }
  });

  function kindsOffered(options: { park: boolean; people: boolean; kidMode?: boolean }): Set<MissionKind> {
    const kinds = new Set<MissionKind>();
    for (let seed = 1; seed <= 40; seed++) {
      const w = setup(seed, options.kidMode);
      w.state.park = options.park ? parkAhead(0) : null;
      untilMission(w, 60, options.people);
      kinds.add(w.state.mission!.kind);
    }
    return kinds;
  }

  it('offers a high five only while a NorDIY park is planned ahead', () => {
    expect(kindsOffered({ park: false, people: true }).has('highFive')).toBe(false);
    expect(kindsOffered({ park: true, people: true }).has('highFive')).toBe(true);
    // A park already passed does not count.
    const w = setup();
    w.state.distance = 5000;
    w.state.park = { start: 3000, end: 4000, pieces: [] };
    for (let n = 0; n < 8; n++) {
      untilMission(w);
      expect(w.state.mission!.kind).not.toBe('highFive');
      complete(w);
    }
  });

  it('offers stomps only where people walk the street', () => {
    expect(kindsOffered({ park: false, people: false }).has('stomp')).toBe(false);
    expect(kindsOffered({ park: false, people: true }).has('stomp')).toBe(true);
  });

  it('kid mode gets the same missions', () => {
    expect(kindsOffered({ park: true, people: true, kidMode: true })).toEqual(new Set(MISSION_KINDS));
  });

  it(`drops a high five mission when the park passes unfinished, and offers another after ${MISSION_RETRY_SECONDS} s`, () => {
    const w = setup();
    w.state.park = parkAhead(0);
    w.director.begin(w, 'highFive');
    w.state.distance = w.state.park.end + 1;
    run(w, TICK_DT);
    expect(w.state.mission).toBeNull();
    expect(w.done).toEqual([]);
    expect(w.state.missionsDone).toBe(0);
    run(w, MISSION_RETRY_SECONDS - 0.1);
    expect(w.state.mission).toBeNull();
    run(w, 0.2);
    expect(w.state.mission!.kind).not.toBe('highFive');
  });

  it('drops it as well when the park plan goes away (replanned while drunk)', () => {
    const w = setup();
    w.state.park = parkAhead(0);
    w.director.begin(w, 'highFive');
    w.state.park = null;
    run(w, TICK_DT);
    expect(w.state.mission).toBeNull();
  });

  it('a new run starts from scratch', () => {
    const w = setup();
    untilMission(w);
    w.director.reset();
    w.state.mission = null;
    run(w, MISSION_FIRST_SECONDS - 0.1);
    expect(w.state.mission).toBeNull();
  });

  it('is deterministic per seed', () => {
    const kinds = (seed: number) => {
      const w = setup(seed);
      for (let n = 0; n < 5; n++) {
        untilMission(w);
        complete(w);
      }
      return w.started;
    };
    expect(kinds(7)).toEqual(kinds(7));
  });
});

describe('missions in the gameplay system', () => {
  /** A game whose mission is `kind` (started by the director, then switched for the test). */
  function withMission(kind: MissionKind) {
    const game = quietGame();
    const done = record(game, 'missionDone');
    tick(game, Math.ceil(MISSION_FIRST_SECONDS / TICK_DT) + 2);
    expect(game.state.mission).not.toBeNull();
    game.state.mission = { kind, goal: 2, progress: 0 };
    return { game, done };
  }

  it('counts stomps, completed stunt lines, full kickflips, stars and high fives from their events', () => {
    const cases: [MissionKind, (game: ReturnType<typeof quietGame>) => void][] = [
      ['stomp', (g) => g.bus.emit('stomp', { entityId: -5, kind: 'vfbFan', item: 'football' })],
      ['stuntLine', (g) => g.bus.emit('stuntEnd', { steps: 3, made: 3, completed: true, points: 100 })],
      ['kickflip', (g) => g.bus.emit('airTrick', { ticks: 20, points: 100, full: true })],
      ['stars', (g) => g.bus.emit('starCollected', { entityId: -5, stars: 1 })],
      ['highFive', (g) => g.bus.emit('highFive', { entityId: -5, points: 100 })],
    ];
    for (const [kind, emit] of cases) {
      const { game, done } = withMission(kind);
      emit(game);
      expect(game.state.mission!.progress, kind).toBe(1);
      emit(game);
      expect(game.state.mission, kind).toBeNull();
      expect(done.map((d) => d.kind)).toEqual([kind]);
    }
  });

  it('a dropped stunt line and a cut kickflip do not count', () => {
    const line = withMission('stuntLine');
    line.game.bus.emit('stuntEnd', { steps: 3, made: 1, completed: false, points: 0 });
    expect(line.game.state.mission!.progress).toBe(0);
    const flip = withMission('kickflip');
    flip.game.bus.emit('airTrick', { ticks: 20, points: 20, full: false });
    expect(flip.game.state.mission!.progress).toBe(0);
  });

  it('a crash does not cancel the mission', () => {
    const { game } = withMission('stars');
    game.bus.emit('starCollected', { entityId: -5, stars: 1 });
    game.bus.emit('crash', { entityId: -5, kind: 'bin', health: 4 });
    tick(game, 10);
    expect(game.state.mission).toEqual({ kind: 'stars', goal: 2, progress: 1 });
  });

  it('a new run starts without a mission and waits again', () => {
    const { game } = withMission('stars');
    game.commands.gameOver();
    game.commands.startRun();
    tick(game, 2);
    expect(game.state.mission).toBeNull();
    tick(game, Math.floor((MISSION_FIRST_SECONDS - 1) / TICK_DT));
    expect(game.state.mission).toBeNull();
  });
});
