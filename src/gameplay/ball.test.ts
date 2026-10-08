import { describe, expect, it } from 'vitest';
import { GROUND_Y, MAX_HEALTH, PLAYER_X, TICK_DT } from '../core/config';
import type { Game } from '../core/game';
import { tick } from '../player/testing';
import type { Entity } from '../types';
import { BALL_HIT_POINTS, BALL_SIZE, ricochetRoom } from './ball';
import { TOP_SPEED } from './difficulty';
import type { Motion } from './motion';
import { obstacle, quietGame, record } from './test-kit';

const still: Motion = { walk: 0, sway: 0, phase: 0 };

/** Quiet game (speed 120 unless given) with the gameplay rng re-seeded, carrying a football. */
function withBall(seed = 1, speed = 120): Game {
  const game = quietGame(speed);
  game.ctx.rng.seed(seed);
  game.state.carriedItem = 'football';
  return game;
}

function throwIt(game: Game): Entity {
  game.commands.useItem();
  game.tick();
  return game.state.entities.find((e) => e.kind === 'ball')!;
}

/** Ticks until the ball lands for the first time (or 120 ticks). */
function untilLanded(game: Game, ball: Entity): number {
  for (let i = 1; i <= 120; i++) {
    game.tick();
    if (ball.data?.phase !== 'fly') return i;
  }
  return -1;
}

/** Seeds whose (rng-decided) miss ricochets back / rolls away on free street. */
function seedsByOutcome(speed = 120): { back: number[]; away: number[] } {
  const out = { back: [] as number[], away: [] as number[] };
  for (let seed = 1; seed <= 12; seed++) {
    const game = withBall(seed, speed);
    const backs = record(game, 'ballBack');
    const ball = throwIt(game);
    untilLanded(game, ball);
    (backs.length > 0 ? out.back : out.away).push(seed);
  }
  return out;
}

describe('thrown football', () => {
  it('leaves the hands flying forward and up, then falls and lands ahead of the skater', () => {
    const game = withBall();
    const ball = throwIt(game);
    expect(ball.w).toBe(BALL_SIZE);
    expect(ball.x).toBeGreaterThan(PLAYER_X - 2);
    expect(ball.y).toBeLessThan(GROUND_Y - 10);
    const startY = ball.y;
    let top = ball.y;
    let landedAt = -1;
    for (let i = 0; i < 120 && landedAt < 0; i++) {
      game.tick();
      top = Math.min(top, ball.y);
      if (ball.data?.phase !== 'fly') landedAt = ball.x;
    }
    expect(top).toBeLessThan(startY - 3);
    expect(landedAt).toBeGreaterThan(PLAYER_X + 60);
  });

  it('is deterministic: the same seed gives the same flight', () => {
    const path = (seed: number) => {
      const game = withBall(seed);
      const ball = throwIt(game);
      const xs: number[] = [];
      for (let i = 0; i < 90; i++) {
        game.tick();
        xs.push(Math.round(ball.x * 100), Math.round(ball.y * 100));
      }
      return xs;
    };
    expect(path(3)).toEqual(path(3));
  });

  it('hits a person ahead: the person tumbles (like a stomp), points and ballHit, the ball drops away', () => {
    const game = withBall();
    const person = obstacle(game, 'wasenGuest', PLAYER_X + 90, still);
    const hits = record(game, 'ballHit');
    const backs = record(game, 'ballBack');
    const ball = throwIt(game);
    const score = game.state.score;
    for (let i = 0; i < 60 && hits.length === 0; i++) game.tick();
    expect(hits).toEqual([{ entityId: person.id, kind: 'wasenGuest' }]);
    expect(person.done).toBe(true);
    // Hit this tick (core integrates the run time after the systems).
    expect(person.data?.stompedAt).toBeCloseTo(game.state.time - TICK_DT, 9);
    expect(game.state.score - score).toBe(BALL_HIT_POINTS);
    expect(ball.done).toBe(true);
    tick(game, 120);
    expect(backs).toEqual([]);
    expect(hits).toHaveLength(1);
  });

  it('scores the hit like a clear: obstacleCleared for the person with the points, in the same tick as ballHit', () => {
    const game = withBall();
    const person = obstacle(game, 'vfbFan', PLAYER_X + 90, still);
    const seen: string[] = [];
    game.bus.on('obstacleCleared', (e) => seen.push(`cleared:${e.entityId}:${e.kind}:${e.points}@${game.state.frame}`));
    game.bus.on('ballHit', (e) => seen.push(`hit:${e.entityId}@${game.state.frame}`));
    throwIt(game);
    for (let i = 0; i < 60 && seen.length === 0; i++) game.tick();
    const frame = game.state.frame;
    expect(seen).toEqual([`cleared:${person.id}:vfbFan:${BALL_HIT_POINTS}@${frame}`, `hit:${person.id}@${frame}`]);
  });

  it('a hit person no longer crashes the skater', () => {
    const game = withBall();
    obstacle(game, 'vfbFan', PLAYER_X + 90, still);
    const crashes = record(game, 'crash');
    throwIt(game);
    tick(game, 150);
    expect(crashes).toEqual([]);
  });

  it('a miss either ricochets back (ballBack) or rolls away, decided by the seeded rng (~50 %)', () => {
    const { back, away } = seedsByOutcome();
    expect(back.length).toBeGreaterThanOrEqual(3);
    expect(away.length).toBeGreaterThanOrEqual(3);
    expect(seedsByOutcome()).toEqual({ back, away });
  });

  it('a ball rolling away is harmless', () => {
    const game = withBall(seedsByOutcome().away[0]);
    const crashes = record(game, 'crash');
    const ball = throwIt(game);
    untilLanded(game, ball);
    expect(ball.done).toBe(true);
    tick(game, 300);
    expect(crashes).toEqual([]);
  });

  it('a ricochet comes back low and bouncing and knocks the skater off the board if he stays on the ground', () => {
    const game = withBall(seedsByOutcome().back[0]);
    const crashes = record(game, 'crash');
    const ball = throwIt(game);
    untilLanded(game, ball);
    let top = GROUND_Y;
    for (let i = 0; i < 200 && crashes.length === 0; i++) {
      game.tick();
      top = Math.min(top, ball.y);
    }
    expect(crashes).toEqual([{ entityId: ball.id, kind: 'ball', health: MAX_HEALTH - 1 }]);
    game.tick();
    expect(game.state.player.state).toBe('crash');
    // Low: it never bounces higher than a small hop.
    expect(GROUND_Y - top).toBeLessThan(BALL_SIZE + 12);
  });

  for (const speed of [120, TOP_SPEED]) {
    it(`jumping over the ricochet avoids it (${speed} px/s)`, () => {
      const game = withBall(seedsByOutcome(speed).back[0], speed);
      const crashes = record(game, 'crash');
      const ball = throwIt(game);
      untilLanded(game, ball);
      // Jump when the ball is a short hop away (a tap is enough).
      for (let i = 0; i < 200 && ball.x - PLAYER_X > 30; i++) game.tick();
      game.buttons.action.press('test');
      tick(game, 3);
      game.buttons.action.release('test');
      tick(game, 200);
      expect(crashes).toEqual([]);
    });
  }

  it('still ricochets at the top speed (~50 %), when the street around the meeting point is free', () => {
    const { back, away } = seedsByOutcome(TOP_SPEED);
    expect(back.length).toBeGreaterThanOrEqual(3);
    expect(away.length).toBeGreaterThanOrEqual(3);
  });

  it('passing during invulnerability is no crash', () => {
    const game = withBall(seedsByOutcome().back[0]);
    const crashes = record(game, 'crash');
    const ball = throwIt(game);
    untilLanded(game, ball);
    game.state.player.invulnerableTimer = 10;
    tick(game, 200);
    expect(crashes).toEqual([]);
  });

  it('never ricochets into street with an obstacle around its arrival at the skater: it rolls away instead', () => {
    for (const seed of seedsByOutcome().back) {
      const game = withBall(seed);
      const backs = record(game, 'ballBack');
      const ball = throwIt(game);
      // A planter that will be right at the skater about when the ball would get back.
      obstacle(game, 'planter', PLAYER_X + 150);
      untilLanded(game, ball);
      expect(backs).toEqual([]);
      expect(ball.done).toBe(true);
    }
  });

  for (const speed of [120, TOP_SPEED]) {
    it(`ricochetRoom: the street (screen x now) that must be free spans a second of riding on both sides of the meeting point (${speed} px/s)`, () => {
      const [from, to] = ricochetRoom(PLAYER_X + 100, speed);
      expect(to - from).toBeGreaterThanOrEqual(2 * speed);
      // Centred on what is now street ahead and will be at the skater when the ball arrives.
      const meeting = (from + to) / 2;
      expect(meeting).toBeGreaterThan(PLAYER_X);
      expect(meeting).toBeLessThan(PLAYER_X + 100);
    });
  }

  it('flies over street obstacles without hitting them (only people are hit)', () => {
    const game = withBall();
    const bin = obstacle(game, 'bin', PLAYER_X + 140);
    const hits = record(game, 'ballHit');
    throwIt(game);
    tick(game, 25);
    expect(hits).toEqual([]);
    expect(bin.done).toBe(false);
  });
});
