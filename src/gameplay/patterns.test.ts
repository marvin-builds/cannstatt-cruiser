import { describe, expect, it } from 'vitest';
import { BASE_SPEED, GROUND_Y, MAX_SPEED } from '../core/config';
import { Rng } from '../core/rng';
import { isObstacle, isRail } from './catalogue';
import { courseOf, planPattern, TEMPLATE_NAMES } from './patterns';
import { Solver } from './solver';

const SEEDS = Array.from({ length: 40 }, (_, i) => i + 1);

describe('spawn patterns', () => {
  for (const speed of [BASE_SPEED, MAX_SPEED]) {
    it(`every generated pattern (all tiers and zones, people moving) is clearable with the real jump arcs at ${speed} px/s`, () => {
      for (const seed of SEEDS) {
        const rng = new Rng(seed);
        for (let tier = 0; tier <= 3; tier++) {
          for (const zone of [0, 1, 2]) {
            for (let n = 0; n < 2; n++) {
              const pattern = planPattern(rng, tier, [speed], { zone });
              const ok = new Solver(courseOf(pattern), speed).solvable();
              if (!ok) throw new Error(`seed ${seed} tier ${tier} zone ${zone}: ${JSON.stringify(pattern)}`);
            }
          }
        }
      }
    }, 30_000);
  }

  it('a pattern verified for a speed range is clearable at both ends', () => {
    const rng = new Rng(7);
    for (let i = 0; i < 60; i++) {
      const pattern = planPattern(rng, 3, [150, 160]);
      expect(new Solver(courseOf(pattern), 150).solvable()).toBe(true);
      expect(new Solver(courseOf(pattern), 160).solvable()).toBe(true);
    }
  });

  it('uses every template at full difficulty and rarely needs the fallback', () => {
    for (const speed of [BASE_SPEED, MAX_SPEED]) {
      const names: string[] = [];
      const rng = new Rng(3);
      for (let i = 0; i < 400; i++) names.push(planPattern(rng, 3, [speed], { zone: i % 3 }).name);
      for (const name of TEMPLATE_NAMES) expect(names).toContain(name);
      expect(names.filter((n) => n === 'fallback').length).toBeLessThan(20);
    }
  });

  it('tier 0 has single obstacles only, no rails', () => {
    const rng = new Rng(11);
    for (let i = 0; i < 100; i++) {
      const pieces = planPattern(rng, 0, [BASE_SPEED]).pieces;
      expect(pieces.filter((p) => isObstacle(p.kind)).length).toBeLessThanOrEqual(1);
      expect(pieces.some((p) => isRail(p.kind))).toBe(false);
    }
  });

  it('is deterministic per seed', () => {
    const a = new Rng(5);
    const b = new Rng(5);
    for (let i = 0; i < 30; i++) expect(planPattern(a, 3, [120])).toEqual(planPattern(b, 3, [120]));
  });

  it('places guiding stars on the planned jump, in the air and ahead of the start', () => {
    const rng = new Rng(2);
    const stars = Array.from({ length: 80 }, () => planPattern(rng, 3, [BASE_SPEED]))
      .flatMap((p) => p.pieces)
      .filter((p) => p.kind === 'star');
    expect(stars.length).toBeGreaterThan(20);
    for (const s of stars) {
      expect(s.y + s.h).toBeLessThanOrEqual(GROUND_Y);
      expect(s.x).toBeGreaterThan(0);
    }
  });
});
