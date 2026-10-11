import { describe, expect, it } from 'vitest';
import { PLAYER_X } from '../core/config';
import type { Game } from '../core/game';
import { tick } from '../player/testing';
import type { Entity } from '../types';
import { PIGEONS, pigeonsPiece } from './hazards';
import { flushReach } from './pigeons';
import { quietGame, record } from './test-kit';

const SPEED = 120;

function flock(game: Game, x: number): Entity {
  const e: Entity = { id: 41_000 + x, ...pigeonsPiece(x), done: false };
  game.state.entities.push(e);
  return e;
}

/** Ticks until the flock is behind the skater (done), at most `max`. */
function passFlock(game: Game, e: Entity, max = 240): void {
  for (let i = 0; i < max && !e.done; i++) tick(game);
}

describe('pigeons on the street (live)', () => {
  it('take off when the skater comes near, never before', () => {
    const game = quietGame(SPEED);
    const e = flock(game, 300);
    tick(game);
    expect(e.data?.flushedAt).toBeUndefined();
    let gapAtFlush = Infinity;
    for (let i = 0; i < 240 && e.data?.flushedAt === undefined; i++) {
      gapAtFlush = e.x - PLAYER_X;
      tick(game);
    }
    expect(typeof e.data?.flushedAt).toBe('number');
    expect(gapAtFlush).toBeLessThanOrEqual(flushReach(SPEED) + SPEED / 60);
    expect(gapAtFlush).toBeGreaterThan(flushReach(SPEED) - 2 * (SPEED / 60));
    // Still ahead of the skater when they go: they take off before he gets there.
    expect(gapAtFlush).toBeGreaterThan(20);
  });

  it('riding through upright is harmless: no crash, no health lost, no points', () => {
    const game = quietGame(SPEED);
    const crashes = record(game, 'crash');
    const cleared = record(game, 'obstacleCleared');
    const health = game.state.health;
    const score = game.state.score;
    const e = flock(game, 200);
    passFlock(game, e);
    expect(e.done).toBe(true);
    expect(crashes).toHaveLength(0);
    expect(game.state.health).toBe(health);
    expect(game.state.score).toBe(score);
    expect(cleared).toHaveLength(0);
    // The flock never leaves the street as a pickup (it stays drawn while the birds fly off).
    expect(game.state.entities).toContain(e);
  });

  it('ducking past them pays PIGEONS.points', () => {
    const game = quietGame(SPEED);
    const cleared = record(game, 'obstacleCleared');
    const e = flock(game, 160);
    game.buttons.duck.press('test');
    passFlock(game, e);
    game.buttons.duck.release('test');
    expect(cleared).toEqual([{ entityId: e.id, kind: e.kind, points: PIGEONS.points }]);
    expect(game.state.score).toBe(PIGEONS.points);
  });

  it('jumping over them pays too (a trick in the air chain)', () => {
    const game = quietGame(SPEED);
    const cleared = record(game, 'obstacleCleared');
    const crashes = record(game, 'crash');
    const e = flock(game, PLAYER_X + 40);
    game.buttons.action.press('test');
    tick(game, 12);
    game.buttons.action.release('test');
    passFlock(game, e);
    expect(crashes).toHaveLength(0);
    expect(cleared).toHaveLength(1);
    expect(cleared[0]!.entityId).toBe(e.id);
    expect(cleared[0]!.points).toBeGreaterThanOrEqual(PIGEONS.points);
  });

  it('are never collected like a star', () => {
    const game = quietGame(SPEED);
    const stars = record(game, 'starCollected');
    const e = flock(game, 150);
    passFlock(game, e);
    expect(stars).toHaveLength(0);
    expect(game.state.stars).toBe(0);
  });
});
