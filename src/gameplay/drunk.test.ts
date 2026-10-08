import { describe, expect, it } from 'vitest';
import { BASE_SPEED, DRUNK_DELAY_MAX, DRUNK_DELAY_MIN } from '../core/config';
import { drunkWindow } from '../core/drunk';
import { Game } from '../core/game';
import { Rng } from '../core/rng';
import type { EntityKind } from '../types';
import { createGameplaySystem } from './index';
import { isObstacle, isOverhead, isPerson, isRail } from './catalogue';
import { speedAt } from './difficulty';
import { DRUNK_TEMPLATES, drunkFairness, HUMAN_HOLDS, LATE_TAKEOFF_WINDOW } from './fairness';
import { courseOf, planPattern, planSteps } from './patterns';
import { Solver, type WorkBudget } from './solver';

/** Patterns planned while drunk, all tiers and zones, at the start and the top speed. */
function drunkPatterns() {
  const out = [];
  for (let seed = 1; seed <= 12; seed++) {
    const rng = new Rng(seed);
    for (const speed of [BASE_SPEED, speedAt(1e9)]) {
      for (let i = 0; i < 6; i++) out.push({ speed, pattern: planPattern(rng, 3, [speed], { zone: i % 3, drunk: true }) });
    }
  }
  return out;
}

describe('patterns while drunk', () => {
  it('the drunk margin follows drunkWindow: the press may come DRUNK_DELAY_MAX - MIN ticks later, each hold that much shorter or longer', () => {
    const spread = DRUNK_DELAY_MAX - DRUNK_DELAY_MIN;
    const w = drunkWindow(10);
    expect(w.holdMax - 10).toBe(spread);
    expect(drunkFairness(LATE_TAKEOFF_WINDOW)).toEqual({ window: LATE_TAKEOFF_WINDOW + w.pressMax - w.pressMin, spread });
  });

  it('only easy templates: no people, nothing overhead, no rails, at most a pair', () => {
    expect(DRUNK_TEMPLATES).not.toContain('person');
    for (const { pattern } of drunkPatterns()) {
      expect(DRUNK_TEMPLATES).toContain(pattern.name === 'fallback' ? DRUNK_TEMPLATES[0] : pattern.name);
      const blocking = pattern.pieces.filter((p) => isObstacle(p.kind) || isRail(p.kind));
      expect(blocking.length).toBeLessThanOrEqual(2);
      for (const p of blocking) {
        expect(isPerson(p.kind) || isOverhead(p.kind) || isRail(p.kind)).toBe(false);
      }
    }
  });

  it('every drunk pattern is fair with the worst-case drunk delay (wider window, holds +-spread)', () => {
    for (const { speed, pattern } of drunkPatterns()) {
      const { window, spread } = drunkFairness(LATE_TAKEOFF_WINDOW);
      const s = new Solver(courseOf(pattern), speed);
      expect(s.fair(HUMAN_HOLDS, window, undefined, spread), JSON.stringify(pattern)).toBe(true);
    }
  });

  it('still has obstacles most of the time (not just empty street)', () => {
    const all = drunkPatterns();
    const withObstacles = all.filter(({ pattern }) => pattern.pieces.some((p) => isObstacle(p.kind)));
    expect(withObstacles.length / all.length).toBeGreaterThan(0.4);
  });
});

describe('resumable planning (planSteps)', () => {
  it('with a small budget per step it yields many times and plans exactly what planPattern plans', () => {
    for (let seed = 1; seed <= 6; seed++) {
      const expected = planPattern(new Rng(seed), 3, [130, 140], { zone: 2, before: [] });
      const budget: WorkBudget = { left: 0 };
      const steps = planSteps(new Rng(seed), 3, [130, 140], { zone: 2, before: [], budget });
      let yields = 0;
      for (;;) {
        budget.left = 300;
        const r = steps.next();
        if (r.done) {
          expect(r.value).toEqual(expected);
          break;
        }
        yields++;
      }
      expect(yields).toBeGreaterThan(0);
    }
  });
});

describe('the gameplay system plans for a drunk player', () => {
  it('while a Maßkrug is carried or drunk, everything that comes onto the street is easy', () => {
    const game = new Game({ systems: [createGameplaySystem()] });
    game.seed(3);
    game.commands.startRun();
    game.state.distance = 30000;
    game.state.carriedItem = 'beer';
    // Nobody rides (no player system): never crash, so the Maßkrug stays in hand.
    game.state.player.invulnerableTimer = Infinity;
    const kinds = new Set<string>();
    for (let i = 0; i < 60 * 25; i++) {
      // It is drunk by itself after a while (auto-drink.ts): hand over the next one.
      game.state.carriedItem ??= 'beer';
      game.tick();
      for (const e of game.state.entities) kinds.add(e.kind);
    }
    expect([...kinds].filter((k) => isObstacle(k as EntityKind)).length).toBeGreaterThan(1);
    expect([...kinds].filter((k) => isPerson(k as EntityKind) || isOverhead(k as EntityKind) || isRail(k as EntityKind))).toEqual([]);
  });
});
