import { describe, expect, it } from 'vitest';
import { GROUND_Y } from '../core/config';
import { Game } from '../core/game';
import { createPlayerSystem } from '../player';
import { createGameplaySystem } from './index';
import { type Course, Solver } from './solver';

// Planning must degrade gracefully at any scroll speed: at 0 or a crawl no
// course can be passed in time, so the solver answers "no" (and the spawner
// lays empty street) instead of recursing tick by tick until the call stack
// overflows.

const bin = { x: 80, y: GROUND_Y - 18, w: 10, h: 18 };
/** How many calls of `nest` fit on the stack. */
function stackDepth(): number {
  let depth = 0;
  const nest = (): void => {
    depth++;
    nest();
  };
  try {
    nest();
  } catch {
    // RangeError: the stack is full.
  }
  return depth;
}

/** Runs `work` with three quarters of the stack already used. */
function onQuarterStack<T>(work: () => T): T {
  const nest = (n: number): T => (n === 0 ? work() : nest(n - 1));
  return nest(Math.floor(stackDepth() * 0.75));
}

const binCourse = (): Course => ({ obstacles: [bin], overhead: [], rails: [], goal: 90, limit: 490 });

// A crawl searches thousands of ticks: alone it takes about a second, under the
// full parallel suite it can pass the default 5 s.
const SLOW_SEARCH_TIMEOUT = 20_000;

describe('solver at a standstill or a crawl', () => {
  for (const speed of [0, 0.1, 0.5, 3]) {
    it(`answers every question at ${speed} px/s without overflowing the stack`, () => {
      const s = new Solver(binCourse(), speed);
      expect(onQuarterStack(() => s.solvable())).toBe(false);
      expect(onQuarterStack(() => s.fair([3, 10, 20], 12))).toBe(false);
      expect(onQuarterStack(() => s.fair([3, 10, 20], 12, undefined, 5))).toBe(false);
      expect(onQuarterStack(() => s.bestJump())).toBeNull();
      expect(onQuarterStack(() => s.takeoffWindow())).toBe(0);
    }, SLOW_SEARCH_TIMEOUT);
  }

  it('an empty course is still solvable at a crawl that reaches its end in time', () => {
    const empty: Course = { obstacles: [], overhead: [], rails: [], goal: 40, limit: 440 };
    expect(new Solver(empty, 10).solvable()).toBe(true);
  });

  it('searches thousands of ticks deep without recursing per tick', () => {
    // A long overhead roof (duck under it, every jump hits it): over 3000 ticks of
    // waiting to the goal, which a search one call deep per tick overflowed
    // (on a phone's smaller stack too: here only a quarter of the stack is left).
    const roof = { x: 0, y: GROUND_Y - 60, w: 520, h: 36 };
    const long: Course = { obstacles: [], overhead: [roof], rails: [], goal: 520, limit: 900 };
    const s = new Solver(long, 9);
    expect(onQuarterStack(() => s.solvable())).toBe(true);
    expect(onQuarterStack(() => s.fair([3, 10, 20], 12))).toBe(true);
  }, SLOW_SEARCH_TIMEOUT);
});

describe('the live game with the speed pinned at 0', () => {
  /** The Wave 5c repro: seed 1, speed pinned to `speed`, then a Maßkrug in hand (drunk planning). */
  function pinnedRun(speed: number): Game {
    const game = new Game({ systems: [createPlayerSystem(), createGameplaySystem()] });
    game.seed(1);
    game.commands.startRun();
    for (let i = 0; i < 100; i++) game.tick();
    game.setSpeedOverride(speed);
    for (let i = 0; i < 30; i++) game.tick();
    // Adult mode: only there the Maßkrug means drunk planning.
    game.state.kidMode = false;
    game.state.carriedItem = 'beer';
    return game;
  }

  for (const speed of [0, 0.5]) {
    it(`plans drunk at ${speed} px/s without a stack overflow`, () => {
      const game = pinnedRun(speed);
      expect(() => {
        for (let i = 0; i < 900; i++) game.tick();
      }).not.toThrow();
    });
  }

  it('lays patterns again once the speed is free', () => {
    const game = pinnedRun(0);
    for (let i = 0; i < 300; i++) game.tick();
    game.setSpeedOverride(null);
    game.state.carriedItem = null;
    const seen = new Set<number>();
    for (let i = 0; i < 60 * 30; i++) {
      game.tick();
      game.state.health = 5;
      for (const e of game.state.entities) seen.add(e.id);
    }
    expect(seen.size).toBeGreaterThan(5);
  });
});
