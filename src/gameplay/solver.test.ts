import { describe, expect, it } from 'vitest';
import { BASE_SPEED, GROUND_Y, MAX_SPEED } from '../core/config';
import { railRect } from './catalogue';
import { type Course, Solver } from './solver';

function block(x: number, w: number, h: number) {
  return { x, y: GROUND_Y - h, w, h };
}

function course(obstacles: Course['obstacles'], rails: Course['rails'] = []): Course {
  const goal = Math.max(0, ...[...obstacles, ...rails].map((r) => r.x + r.w));
  return { obstacles, overhead: [], rails, goal, limit: goal + 400 };
}

describe('clearability solver', () => {
  it('needs no jump on an empty course', () => {
    const s = new Solver(course([]), BASE_SPEED);
    expect(s.solvable()).toBe(true);
    expect(s.bestJump()).toBeNull();
  });

  for (const speed of [BASE_SPEED, MAX_SPEED]) {
    it(`clears a single 18 px bin at ${speed} px/s and plans a jump over it`, () => {
      const s = new Solver(course([block(80, 10, 18)]), speed);
      expect(s.solvable()).toBe(true);
      const jump = s.bestJump()!;
      expect(jump.hold).toBeGreaterThan(0);
      expect(jump.path.length).toBeGreaterThan(3);
      expect(jump.path.every((p) => p.y < GROUND_Y)).toBe(true);
    });
  }

  it('rejects a wall higher than the full jump', () => {
    expect(new Solver(course([block(80, 10, 60)]), BASE_SPEED).solvable()).toBe(false);
  });

  it('a long block is too wide to jump at base speed but not at max speed', () => {
    const c = course([block(100, 60, 24)]);
    expect(new Solver(c, BASE_SPEED).solvable()).toBe(false);
    expect(new Solver(c, MAX_SPEED).solvable()).toBe(true);
  });

  it('a long low wall is only passable by grinding the rail above it', () => {
    const wall = block(60, 220, 10);
    expect(new Solver(course([wall]), BASE_SPEED).solvable()).toBe(false);
    const rail = railRect(40, 22, 260);
    const s = new Solver(course([wall], [rail]), BASE_SPEED);
    expect(s.solvable()).toBe(true);
    expect(s.bestJump()!.grinds).toBe(true);
  });

  it('demands the landing before the limit', () => {
    const c = course([block(40, 10, 18)]);
    expect(new Solver({ ...c, limit: c.goal + 6 }, MAX_SPEED).solvable()).toBe(false);
  });

  it('plans from the middle of the widest take-off window', () => {
    const s = new Solver(course([block(120, 10, 12)]), BASE_SPEED);
    const jump = s.bestJump()!;
    // Jumping one tick earlier and later must also work (not an edge of the window).
    for (const tick of [jump.tick - 1, jump.tick + 1]) expect(s.jumpWorks(tick, jump.hold)).toBe(true);
  });
});
