import { describe, expect, it } from 'vitest';
import { BASE_SPEED, GROUND_Y } from '../core/config';
import { Rng } from '../core/rng';
import { isObstacle, isRail, obstacleRect } from './catalogue';
import { drunkFairness, EARLY_TAKEOFF_WINDOW } from './fairness';
import { gapAt, speedAt, tierAt, TOP_SPEED } from './difficulty';
import { courseOf, planPattern, TEMPLATE_NAMES } from './patterns';
import { Solver } from './solver';

const SEEDS = Array.from({ length: 40 }, (_, i) => i + 1);

describe('spawn patterns', () => {
  for (const speed of [BASE_SPEED, TOP_SPEED]) {
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

  it('while an effect may be on (`effect`), never an empty star pattern: there is always something to jump', () => {
    for (const speed of [BASE_SPEED, TOP_SPEED]) {
      const rng = new Rng(5);
      const names = Array.from({ length: 300 }, (_, i) => planPattern(rng, 3, [speed], { zone: i % 3, effect: true }).name);
      expect(names).not.toContain('stars');
      expect(names).toContain('single');
    }
  }, 30_000);

  it('while an effect may be on, no empty fallback either: a lone low obstacle, further out if the previous pattern needs it, fair across', () => {
    // After a tall obstacle a drunk landing scatters far, so the next take-off needs a longer run-up.
    const { window, holds, spread } = drunkFairness(EARLY_TAKEOFF_WINDOW);
    let checked = 0;
    for (const speed of [BASE_SPEED, 140, TOP_SPEED]) {
      for (const kind of ['curbGap', 'bench', 'planter', 'bin', 'barrier'] as const) {
        const previous = { kind, ...obstacleRect(kind, 100) };
        // Only after a previous pattern that is drunk-fair itself (planned drunk, it always is).
        if (!new Solver(courseOf({ name: kind, pieces: [previous], length: 250 }), speed).fair(holds, window, undefined, spread)) continue;
        checked++;
        const before = [{ ...previous, x: -150 }];
        const rng = new Rng(11);
        for (let i = 0; i < 20; i++) {
          const p = planPattern(rng, 3, [speed], { drunk: true, effect: true, before, window: EARLY_TAKEOFF_WINDOW });
          expect(p.name, `${speed} after ${kind}`).not.toBe('fallback');
          expect(p.pieces.some((x) => isObstacle(x.kind))).toBe(true);
          expect(new Solver(courseOf(p), speed).fair(holds, window, undefined, spread)).toBe(true);
        }
      }
    }
    expect(checked).toBeGreaterThanOrEqual(6);
  }, 60_000);

  it('uses every template at full difficulty and rarely needs the fallback', () => {
    for (const speed of [BASE_SPEED, TOP_SPEED]) {
      const names: string[] = [];
      const rng = new Rng(3);
      for (let i = 0; i < 400; i++) names.push(planPattern(rng, 3, [speed], { zone: i % 3 }).name);
      for (const name of TEMPLATE_NAMES) expect(names).toContain(name);
      expect(names.filter((n) => n === 'fallback').length).toBeLessThan(20);
    }
  }, 30_000);

  it('leaves >= 1.1 s of free street after every pattern (its runout plus the gap to the next), at every distance', () => {
    const rng = new Rng(9);
    for (let d = 0; d <= 50_000; d += 1000) {
      const v = speedAt(d);
      for (let i = 0; i < 6; i++) {
        const p = planPattern(rng, tierAt(d), [v], { zone: i % 3 });
        const end = Math.max(0, ...p.pieces.filter((x) => isObstacle(x.kind) || isRail(x.kind)).map((x) => x.x + x.w));
        expect((p.length - end + gapAt(d)) / v, `${d}: ${p.name}`).toBeGreaterThanOrEqual(1.1);
      }
    }
  }, 30_000);

  it('obstacles in a row are either close (one jump for both) or >= 0.7 s apart (land, then jump again)', () => {
    for (const speed of [BASE_SPEED, 130, TOP_SPEED]) {
      const rng = new Rng(17);
      for (let i = 0; i < 200; i++) {
        const p = planPattern(rng, 3, [speed]);
        if (p.name !== 'pair' && p.name !== 'triple') continue;
        const row = p.pieces.filter((x) => isObstacle(x.kind)).sort((a, b) => a.x - b.x);
        for (let j = 1; j < row.length; j++) {
          const gap = row[j]!.x - (row[j - 1]!.x + row[j - 1]!.w);
          expect(gap <= 25 || gap >= 0.7 * speed, `${speed} ${p.name} gap ${gap}`).toBe(true);
        }
      }
    }
  }, 30_000);

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
