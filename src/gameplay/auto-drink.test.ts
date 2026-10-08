import { describe, expect, it } from 'vitest';
import { PLAYER_X, TICK_DT } from '../core/config';
import type { Game } from '../core/game';
import { tick } from '../player/testing';
import type { CarriedItem } from '../types';
import { BEER_AUTO_DRINK } from './auto-drink';
import { obstacle, quietGame, record } from './test-kit';
import { DRUNK_DURATION } from './use';

/** Playing ticks a Maßkrug is carried before the skater drinks it by himself. */
const AUTO_TICKS = Math.round(BEER_AUTO_DRINK / TICK_DT);

function carrying(item: CarriedItem, kidMode = false): Game {
  const game = quietGame();
  game.state.kidMode = kidMode;
  game.state.carriedItem = item;
  return game;
}

/** The playing tick (1-based, from now) on which the item was used, or -1 within `ticks`. */
function usedOnTick(game: Game, ticks: number): number {
  const used = record(game, 'itemUsed');
  for (let i = 1; i <= ticks; i++) {
    game.tick();
    if (used.length > 0) return i;
  }
  return -1;
}

describe('a carried Maßkrug is drunk automatically', () => {
  it('takes about 6 seconds', () => {
    expect(BEER_AUTO_DRINK).toBeGreaterThanOrEqual(5);
    expect(BEER_AUTO_DRINK).toBeLessThanOrEqual(7);
  });

  it('after BEER_AUTO_DRINK seconds of carrying: exactly like pressing use (itemUsed drink, drunkStart, drunk timer)', () => {
    const game = carrying('beer');
    const used = record(game, 'itemUsed');
    const drunk = record(game, 'drunkStart');
    tick(game, AUTO_TICKS - 1);
    expect(used).toEqual([]);
    expect(game.state.carriedItem).toBe('beer');
    game.tick();
    expect(used).toEqual([{ item: 'beer', action: 'drink' }]);
    expect(drunk).toEqual([{ duration: DRUNK_DURATION }]);
    expect(game.state.carriedItem).toBeNull();
    expect(game.state.drunkTimer).toBeCloseTo(DRUNK_DURATION, 5);
  });

  it('is deterministic: always on the same tick', () => {
    expect(usedOnTick(carrying('beer'), 2 * AUTO_TICKS)).toBe(AUTO_TICKS);
    expect(usedOnTick(carrying('beer'), 2 * AUTO_TICKS)).toBe(AUTO_TICKS);
  });

  it('only playing time counts (not while paused)', () => {
    const game = carrying('beer');
    tick(game, 10);
    game.commands.pause();
    tick(game, 2 * AUTO_TICKS);
    expect(game.state.carriedItem).toBe('beer');
    game.commands.resume();
    expect(usedOnTick(game, 2 * AUTO_TICKS)).toBe(AUTO_TICKS - 10);
  });

  for (const item of ['pretzel', 'gingerbread', 'football'] as const) {
    it(`never uses a ${item} by itself`, () => {
      const game = carrying(item);
      expect(usedOnTick(game, 3 * AUTO_TICKS)).toBe(-1);
      expect(game.state.carriedItem).toBe(item);
    });
  }

  it('kid mode never drinks: a Maßkrug carried there is not used by itself', () => {
    const game = carrying('beer', true);
    expect(usedOnTick(game, 3 * AUTO_TICKS)).toBe(-1);
    expect(game.state.drunkTimer).toBe(0);
  });

  it('a new Maßkrug starts its own clock (after drinking the last one by hand)', () => {
    const game = carrying('beer');
    tick(game, AUTO_TICKS - 30);
    game.commands.useItem();
    game.tick();
    game.state.carriedItem = 'beer';
    expect(usedOnTick(game, 2 * AUTO_TICKS)).toBe(AUTO_TICKS);
  });

  it('a crash (which loses the Maßkrug) resets the clock', () => {
    const game = carrying('beer');
    tick(game, AUTO_TICKS - 30);
    obstacle(game, 'bin', PLAYER_X - 2);
    tick(game, 2);
    expect(game.state.carriedItem).toBeNull();
    game.state.carriedItem = 'beer';
    expect(usedOnTick(game, 2 * AUTO_TICKS)).toBe(AUTO_TICKS);
  });

  it('a new run resets the clock', () => {
    const game = carrying('beer');
    tick(game, AUTO_TICKS - 30);
    game.commands.gameOver();
    game.commands.startRun();
    game.state.carriedItem = 'beer';
    expect(usedOnTick(game, 2 * AUTO_TICKS)).toBe(AUTO_TICKS);
  });
});
