import { describe, expect, it } from 'vitest';
import { BASE_SPEED, GROUND_Y } from '../core/config';
import { Rng } from '../core/rng';
import { isGrindable, isObstacle, isRail } from './catalogue';
import { COMBO_NAMES } from './combos';
import { TOP_SPEED } from './difficulty';
import { EARLY_TAKEOFF_WINDOW, humanFair, LATE_TAKEOFF_WINDOW, soberFairness, solversFor } from './fairness';
import { railBody } from './jumpsim';
import { courseOf, type Pattern, planPattern, TEMPLATE_NAMES } from './patterns';
import { Solver } from './solver';

const SPEEDS = [BASE_SPEED, 140, TOP_SPEED];
const SEEDS = 12;

/** `count` plans of combo `name` at `speed` with the human window `window`. */
function plans(name: string, speed: number, window: number, count = SEEDS): Pattern[] {
  return Array.from({ length: count }, (_, seed) => planPattern(new Rng(seed + 1), 3, [speed], { zone: seed % 3, window, template: name }));
}

describe('combo patterns (ROADMAP 33)', () => {
  it('are spawn templates', () => {
    expect(COMBO_NAMES.length).toBeGreaterThanOrEqual(3);
    for (const name of COMBO_NAMES) expect(TEMPLATE_NAMES).toContain(name);
  });

  for (const speed of SPEEDS) {
    it(`plan fair at ${speed} px/s: >= ${EARLY_TAKEOFF_WINDOW} ticks early, >= ${LATE_TAKEOFF_WINDOW} ticks late`, () => {
      for (const name of COMBO_NAMES) {
        for (const window of [EARLY_TAKEOFF_WINDOW, LATE_TAKEOFF_WINDOW]) {
          const planned = plans(name, speed, window);
          // The template itself must work most of the time (the planner falls back to empty street otherwise).
          expect(planned.filter((p) => p.name === name).length, `${name} ${speed} ${window}`).toBeGreaterThanOrEqual(SEEDS * 0.75);
          for (const p of planned.filter((x) => x.name === name)) {
            expect(humanFair(solversFor(courseOf(p), [speed]), soberFairness(window)), `${name} ${speed}: ${JSON.stringify(p.pieces)}`).toBe(true);
          }
        }
      }
    }, 120_000);
  }

  for (const speed of SPEEDS) {
    it(`the street path is fair without the combo at ${speed} px/s: no rail or grind needed`, () => {
      for (const name of COMBO_NAMES) {
        for (const p of plans(name, speed, EARLY_TAKEOFF_WINDOW).filter((x) => x.name === name)) {
          const street = { ...p, pieces: p.pieces.filter((x) => !isRail(x.kind)) };
          const solver = new Solver(courseOf(street), speed);
          expect(solver.fair(soberFairness(EARLY_TAKEOFF_WINDOW).holds, EARLY_TAKEOFF_WINDOW), `${name}: ${JSON.stringify(p.pieces)}`).toBe(true);
        }
      }
    }, 120_000);
  }

  for (const speed of SPEEDS) {
    it(`a grind on any piece of the combo never leads into an unfair spot at ${speed} px/s`, () => {
      const { holds } = soberFairness(EARLY_TAKEOFF_WINDOW);
      for (const name of COMBO_NAMES) {
        for (const p of plans(name, speed, EARLY_TAKEOFF_WINDOW).filter((x) => x.name === name)) {
          for (const top of p.pieces.filter((x) => isGrindable(x.kind))) {
            const solver = new Solver(courseOf(p, top.x), speed);
            expect(solver.fair(holds, EARLY_TAKEOFF_WINDOW, railBody(top.y, top.w)), `${name} from ${top.kind}: ${JSON.stringify(p.pieces)}`).toBe(true);
          }
        }
      }
    }, 120_000);
  }

  it('every combo has guiding stars, in the air or on top of its rails', () => {
    for (const name of COMBO_NAMES) {
      for (const p of plans(name, BASE_SPEED, EARLY_TAKEOFF_WINDOW).filter((x) => x.name === name)) {
        const stars = p.pieces.filter((x) => x.kind === 'star');
        expect(stars.length, name).toBeGreaterThanOrEqual(3);
        for (const s of stars) {
          expect(s.y + s.h).toBeLessThanOrEqual(GROUND_Y);
          expect(s.x).toBeGreaterThan(0);
          expect(s.x + s.w).toBeLessThanOrEqual(p.length);
        }
      }
    }
  }, 60_000);

  it('come with a modest weight at full difficulty, never in tier 0 or 1, never while drunk or chilled', () => {
    // About 2 % each (weight 0.5 of 28 at tier 3), together well under a tenth of the street.
    const rng = new Rng(21);
    const names = Array.from({ length: 1200 }, (_, i) => planPattern(rng, 3, [i % 2 ? BASE_SPEED : TOP_SPEED], { zone: i % 3 }).name);
    for (const name of COMBO_NAMES) {
      const share = names.filter((n) => n === name).length / names.length;
      expect(share, name).toBeGreaterThan(0.007);
      expect(share, name).toBeLessThan(0.04);
    }
    expect(names.filter((n) => COMBO_NAMES.includes(n)).length / names.length).toBeLessThan(0.1);
    const easy = (options: Parameters<typeof planPattern>[3], tier: number) =>
      Array.from({ length: 150 }, () => planPattern(rng, tier, [BASE_SPEED], options).name);
    for (const name of [...easy({}, 1), ...easy({ drunk: true, effect: true }, 3)]) expect(COMBO_NAMES).not.toContain(name);
  }, 60_000);

  it('only use existing pieces: rails, ground obstacles and stars', () => {
    for (const name of COMBO_NAMES) {
      for (const p of plans(name, 140, LATE_TAKEOFF_WINDOW, 4)) {
        for (const x of p.pieces) expect(isRail(x.kind) || isObstacle(x.kind) || x.kind === 'star', x.kind).toBe(true);
      }
    }
  });

  it('is deterministic per seed', () => {
    for (const name of COMBO_NAMES) expect(plans(name, 140, LATE_TAKEOFF_WINDOW, 2)).toEqual(plans(name, 140, LATE_TAKEOFF_WINDOW, 2));
  });
});
