import { describe, expect, it } from 'vitest';
import { BASE_SPEED, MAX_SPEED, PLAYER_X, TICK_DT, VIEW_MAX_W } from '../core/config';
import { CHILL_DURATION, CHILL_EASE_IN } from '../core/chill';
import { Rng } from '../core/rng';
import { createPlayerTestGame, tick } from '../player/testing';
import { CHILL_JUMP_SCALE } from '../player/tuning';
import type { Entity } from '../types';
import { jointRect } from './catalogue';
import { CHILL_SPEED_SCALE, chillSpeedFactor } from './chill';
import { speedAt } from './difficulty';
import { createGameplaySystem } from './index';
import { anchorOf } from './motion';
import { courseOf, planPattern } from './patterns';
import { constantPace, Solver } from './solver';
import { CHILL_REACH, JOINT_FIRST_DISTANCE, JOINT_SPACING, Spawner } from './spawner';
import { place, playBot, quietGame, record } from './test-kit';
import { courseFrom } from './testing';

/** A game with the real difficulty speed (no override) and an empty street. */
function freeGame() {
  const game = createPlayerTestGame([createGameplaySystem({ spawning: false })]);
  tick(game, 2);
  return game;
}

describe('joint pickup', () => {
  it('starts the chill effect: chillTimer, chillStart, the joint is gone', () => {
    const game = quietGame();
    const starts = record(game, 'chillStart');
    const joint = place(game, 'joint', jointRect(PLAYER_X + 10));
    tick(game, 20);
    expect(starts).toEqual([{ entityId: joint.id, duration: CHILL_DURATION }]);
    expect(game.state.chillTimer).toBeGreaterThan(CHILL_DURATION - 0.3);
    expect(game.state.entities).not.toContain(joint);
  });

  it('a ducking skater picks it up too', () => {
    const game = quietGame();
    const starts = record(game, 'chillStart');
    game.buttons.duck.press('test');
    place(game, 'joint', jointRect(PLAYER_X + 10));
    tick(game, 20);
    expect(starts).toHaveLength(1);
  });

  it('eases the speed down to ~60 % in 0.5 s, holds it and restores it by the end of the effect', () => {
    const game = freeGame();
    place(game, 'joint', jointRect(PLAYER_X + 2));
    tick(game, 1);
    expect(game.state.chillTimer).toBeGreaterThan(0);
    const speeds: { t: number; ratio: number }[] = [];
    while (game.state.chillTimer > 0) {
      tick(game, 1);
      speeds.push({ t: game.state.chillTimer, ratio: game.state.speed / speedAt(game.state.distance) });
    }
    const at = (t: number) => speeds.reduce((a, b) => (Math.abs(b.t - t) < Math.abs(a.t - t) ? b : a)).ratio;
    expect(at(CHILL_DURATION - CHILL_EASE_IN)).toBeCloseTo(CHILL_SPEED_SCALE, 2);
    expect(at(CHILL_DURATION / 2)).toBeCloseTo(CHILL_SPEED_SCALE, 2);
    expect(Math.min(...speeds.map((s) => s.ratio))).toBeGreaterThan(CHILL_SPEED_SCALE - 0.01);
    expect(speeds.length).toBeCloseTo(CHILL_DURATION / TICK_DT, -1);
    tick(game, 1);
    expect(game.state.speed).toBeCloseTo(speedAt(game.state.distance - game.state.speed * TICK_DT), 6);
  });

  it('leaves a speed pinned by the test hook alone while the timer still runs', () => {
    const game = quietGame(150);
    place(game, 'joint', jointRect(PLAYER_X + 2));
    for (let i = 0; i < 120; i++) {
      tick(game, 1);
      expect(game.state.speed).toBe(150);
    }
    expect(game.state.chillTimer).toBeGreaterThan(0);
  });

  it('a new run ends the effect', () => {
    const game = quietGame();
    place(game, 'joint', jointRect(PLAYER_X + 2));
    tick(game, 3);
    game.commands.gameOver();
    game.commands.startRun();
    expect(game.state.chillTimer).toBe(0);
  });

  it('the speed factor is 1 without the effect and CHILL_SPEED_SCALE at its height', () => {
    expect(chillSpeedFactor(0)).toBe(1);
    expect(chillSpeedFactor(CHILL_DURATION / 2)).toBeCloseTo(CHILL_SPEED_SCALE, 9);
  });
});

interface Spawned {
  entity: Entity;
  /** Street position of its anchor. */
  street: number;
}

/** Scrolls a spawner at the difficulty speed (no chill slowdown: the most joints per second). */
function ride(seed: number, seconds: number): { spawned: Spawned[]; jointTimes: number[] } {
  const spawner = new Spawner();
  spawner.reset(new Rng(seed));
  const entities: Entity[] = [];
  const spawned: Spawned[] = [];
  const timeline: { t: number; distance: number }[] = [];
  let distance = 0;
  for (let t = 0; t < seconds / TICK_DT; t++) {
    const dx = speedAt(distance) * TICK_DT;
    for (const e of entities) e.x -= dx;
    spawner.scroll(dx);
    distance += dx;
    timeline.push({ t: (t + 1) * TICK_DT, distance });
    const before = entities.length;
    spawner.spawn(entities, distance, VIEW_MAX_W, null);
    for (const e of entities.slice(before)) spawned.push({ entity: e, street: anchorOf(e) - PLAYER_X + distance });
  }
  const reach = (street: number) => timeline.find((p) => p.distance >= street)?.t ?? Infinity;
  const jointTimes = spawned.filter((s) => s.entity.kind === 'joint').map((s) => reach(s.street));
  return { spawned, jointTimes };
}

describe('joint spawning', () => {
  it('is rare: never in the first 30 s, then at most one per 45 s (but it does come)', () => {
    expect(JOINT_FIRST_DISTANCE / speedAt(JOINT_FIRST_DISTANCE)).toBeGreaterThan(30);
    expect(JOINT_SPACING / MAX_SPEED).toBeGreaterThanOrEqual(45);
    for (const seed of [1, 2, 3, 4]) {
      const { jointTimes } = ride(seed, 300);
      expect(jointTimes.length, `seed ${seed}`).toBeGreaterThanOrEqual(3);
      expect(jointTimes[0]).toBeGreaterThan(30);
      for (let i = 1; i < jointTimes.length; i++) expect(jointTimes[i]! - jointTimes[i - 1]!).toBeGreaterThanOrEqual(45);
    }
  });

  it('everything that can come up while chilled is clearable with the chill jump, at chill speed and through the speed ramp back', () => {
    for (const seed of [1, 2, 3]) {
      const { spawned } = ride(seed, 300);
      for (const joint of spawned.filter((s) => s.entity.kind === 'joint')) {
        const window = spawned.filter((s) => s.street >= joint.street && s.street <= joint.street + CHILL_REACH);
        const course = courseFrom(window.map((s) => ({ ...s.entity, x: s.entity.x - anchorOf(s.entity) + s.street })), joint.street);
        const v = speedAt(joint.street + CHILL_REACH);
        for (const speed of [speedAt(joint.street) * CHILL_SPEED_SCALE, (speedAt(joint.street) * CHILL_SPEED_SCALE + v) / 2, v]) {
          expect(new Solver(course, constantPace(speed, CHILL_JUMP_SCALE)).solvable(), `seed ${seed} joint ${joint.street} at ${speed}`).toBe(true);
        }
      }
    }
  }, 60_000);
});

describe('patterns verified for the chill jump', () => {
  const SEEDS = Array.from({ length: 30 }, (_, i) => i + 1);
  for (const speed of [BASE_SPEED, MAX_SPEED]) {
    it(`every pattern planned for chill is clearable with CHILL_JUMP_SCALE from ${Math.round(speed * CHILL_SPEED_SCALE)} to ${speed} px/s`, () => {
      const chillSpeeds = [speed * CHILL_SPEED_SCALE, speed];
      for (const seed of SEEDS) {
        const rng = new Rng(seed);
        for (let tier = 0; tier <= 3; tier++) {
          for (const zone of [0, 1, 2]) {
            const pattern = planPattern(rng, tier, [speed], { zone, chillSpeeds });
            for (const v of chillSpeeds) {
              const ok = new Solver(courseOf(pattern), constantPace(v, CHILL_JUMP_SCALE)).solvable();
              if (!ok) throw new Error(`seed ${seed} tier ${tier} zone ${zone} at ${v}: ${JSON.stringify(pattern)}`);
            }
            expect(new Solver(courseOf(pattern), speed).solvable()).toBe(true);
          }
        }
      }
    }, 30_000);
  }
});

describe('bot run with a joint', () => {
  it('collects a joint on seed JOINT_SEED and survives more than 60 s without a crash', () => {
    const game = createPlayerTestGame([createGameplaySystem()]);
    game.seed(JOINT_SEED);
    game.commands.gameOver();
    game.commands.startRun();
    const crashes = record(game, 'crash');
    const chills = record(game, 'chillStart');
    playBot(game, 80 * 60);
    expect(chills.length).toBeGreaterThan(0);
    expect(crashes).toEqual([]);
    expect(game.state.mode).toBe('playing');
    expect(game.state.time).toBeGreaterThan(60);
  }, 60_000);
});

/** A seed whose run brings a joint within the first 80 s. */
const JOINT_SEED = 1;
