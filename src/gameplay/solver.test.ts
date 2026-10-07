import { describe, expect, it } from 'vitest';
import { BASE_SPEED, GROUND_Y, MAX_SPEED } from '../core/config';
import { CHILL_JUMP_SCALE } from '../player/tuning';
import { railRect } from './catalogue';
import type { Motion } from './motion';
import { constantPace, type Course, Solver } from './solver';

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

  it('jumps lower with the chill jump scale: a wall the normal jump clears stops the chilled one', () => {
    const wall = course([block(80, 4, 42)]);
    expect(new Solver(wall, BASE_SPEED).solvable()).toBe(true);
    expect(new Solver(wall, constantPace(BASE_SPEED, CHILL_JUMP_SCALE)).solvable()).toBe(false);
  });
});

describe('solver with ledges (grindable obstacles such as the bench)', () => {
  /** A bench-like ledge: top edge at `h`, solid box 2 px below its top. */
  function ledge(x: number, w: number, h: number) {
    const top = { x, y: GROUND_Y - h, w, h };
    return { top, box: { x: x + 1, y: top.y + 2, w: w - 2, h: h - 2 } };
  }

  for (const speed of [BASE_SPEED, MAX_SPEED]) {
    it(`lands on the top of a bench and grinds it at ${speed} px/s`, () => {
      const c: Course = { ...course([]), ledges: [ledge(90, 24, 12)], goal: 114, limit: 514 };
      const s = new Solver(c, speed);
      expect(s.solvable()).toBe(true);
      expect(s.bestJump()!.grinds).toBe(true);
    });
  }

  it('a ledge too long to jump over is passed only by grinding its top', () => {
    const long = ledge(60, 220, 12);
    const c: Course = { ...course([]), ledges: [long], goal: 280, limit: 680 };
    const s = new Solver(c, BASE_SPEED);
    expect(s.solvable()).toBe(true);
    expect(s.bestJump()!.grinds).toBe(true);
    // The same box without a top to land on is a wall.
    expect(new Solver(course([long.box]), BASE_SPEED).solvable()).toBe(false);
  });
});

describe('solver with moving obstacles', () => {
  const walker: Motion = { walk: 0.3, sway: 0, phase: 0 };

  it('models the motion: some take-offs that clear the resting box hit the walker, and it is still solvable', () => {
    const box = block(120, 6, 22);
    const still = new Solver(course([box]), BASE_SPEED);
    const moving = new Solver({ ...course([]), movers: [{ box, anchor: 120, motion: walker }], goal: 126, limit: 526 }, BASE_SPEED);
    expect(moving.solvable()).toBe(true);
    let differs = 0;
    for (let tick = 0; tick < 90; tick++) {
      for (const hold of [6, 20]) if (still.jumpWorks(tick, hold) !== moving.jumpWorks(tick, hold)) differs++;
    }
    expect(differs).toBeGreaterThan(0);
  });
});
