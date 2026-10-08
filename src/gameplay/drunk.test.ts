import { describe, expect, it } from 'vitest';
import { BASE_SPEED, TICK_DT } from '../core/config';
import { drunkWindow } from '../core/drunk';
import { Game } from '../core/game';
import { Rng } from '../core/rng';
import type { EntityKind } from '../types';
import { createGameplaySystem } from './index';
import { isObstacle, isOverhead, isPerson, isRail } from './catalogue';
import { speedAt } from './difficulty';
import { MAX_JUMP_HOLD } from '../player/tuning';
import { DRUNK_HOLD, DRUNK_TEMPLATES, drunkFairness, FULL_PRESS, LATE_TAKEOFF_WINDOW } from './fairness';
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
  it('the drunk margin follows drunkWindow: the press may come pressMax - pressMin ticks later, and the player holds on so long that every outcome is a full jump', () => {
    const { window, holds, spread } = drunkFairness(LATE_TAKEOFF_WINDOW);
    const w = drunkWindow(DRUNK_HOLD);
    expect(window).toBe(LATE_TAKEOFF_WINDOW + w.pressMax - w.pressMin);
    expect(holds).toEqual([DRUNK_HOLD]);
    // The shortest outcome is still a full press (holding longer adds no height): the hold wobble cannot shrink the jump.
    expect(DRUNK_HOLD - spread).toBe(w.holdMin);
    expect(DRUNK_HOLD + spread).toBe(w.holdMax);
    expect(w.holdMin).toBe(FULL_PRESS);
    expect(FULL_PRESS).toBe(Math.ceil(MAX_JUMP_HOLD / TICK_DT));
    expect(drunkWindow(DRUNK_HOLD - 1).holdMin).toBeLessThan(FULL_PRESS);
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

  it('every drunk pattern is fair with the worst-case drunk delay (wider window, every hold outcome)', () => {
    for (const { speed, pattern } of drunkPatterns()) {
      const { window, holds, spread } = drunkFairness(LATE_TAKEOFF_WINDOW);
      const s = new Solver(courseOf(pattern), speed);
      expect(s.fair(holds, window, undefined, spread), JSON.stringify(pattern)).toBe(true);
    }
  });

  it('still has obstacles most of the time (not just empty street)', () => {
    const all = drunkPatterns();
    const withObstacles = all.filter(({ pattern }) => pattern.pieces.some((p) => isObstacle(p.kind)));
    expect(withObstacles.length / all.length).toBeGreaterThan(0.4);
  });
  it('has more than curb gaps: taller obstacles come too (a longer run-up leaves room for the drunk take-off window)', () => {
    const kinds = new Set(drunkPatterns().flatMap(({ pattern }) => pattern.pieces.filter((p) => isObstacle(p.kind)).map((p) => p.kind)));
    expect([...kinds].filter((k) => k !== 'curbGap'), [...kinds].join()).toHaveLength(4);
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
