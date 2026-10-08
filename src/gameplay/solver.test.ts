import { describe, expect, it } from 'vitest';
import { BASE_SPEED, GROUND_Y, MAX_SPEED, TICK_DT } from '../core/config';
import { CHILL_JUMP_SCALE } from '../player/tuning';
import { railRect } from './catalogue';
import type { Motion } from './motion';
import { groundBody, railBody } from './jumpsim';
import { constantPace, type Course, OUT_OF_WORK, Solver, type WorkBudget } from './solver';

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

describe('planning from a rail', () => {
  it('never plans a hop back onto the rail being ridden: rolling off the end is the plan', () => {
    const rail = railRect(-20, 14, 140);
    const s = new Solver(course([], [rail]), BASE_SPEED);
    expect(s.bestJump(railBody(rail.y, rail.x + rail.w))).toBeNull();
  });

  it('times a jump after rolling off a rail end by the real tick count (the fall takes ticks too)', () => {
    const rail = railRect(-20, 14, 60);
    const s = new Solver(course([block(140, 10, 18)], [rail]), BASE_SPEED);
    const start = railBody(rail.y, rail.x + rail.w);
    const jump = s.bestJump(start)!;
    expect(jump).not.toBeNull();
    // The flight starts where the player is after jump.tick real ticks.
    expect(jump.path[0]!.x).toBeCloseTo(BASE_SPEED * TICK_DT * (jump.tick + 1), 0);
    expect(s.jumpWorks(jump.tick, jump.hold, start)).toBe(true);
  });

  it('plans a jump off the rail over an obstacle after it', () => {
    const rail = railRect(-20, 14, 100);
    const s = new Solver(course([block(110, 10, 18)], [rail]), BASE_SPEED);
    const jump = s.bestJump(railBody(rail.y, rail.x + rail.w))!;
    expect(jump.grinds).toBe(false);
    expect(jump.path.at(-1)!.x).toBeGreaterThan(110);
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

describe('take-off window (human margin)', () => {
  it('plans like a human with a `humanWindow`: a rail landing only when its window is that wide', () => {
    // A barrier, then a low handrail 50 px on: grinding it needs a 2-tick take-off, jumping past it gets ~19.
    const c = course([block(61, 7, 21)], [railRect(118, 10, 60)]);
    const s = new Solver(c, 122);
    expect(s.bestJump(undefined, [3, 10, 20])!.grinds).toBe(true);
    const human = s.bestJump(undefined, [3, 10, 20], 9)!;
    expect(human.grinds).toBe(false);
    for (let t = human.tick - 4; t <= human.tick + 4; t++) expect(s.jumpWorks(t, human.hold), `tick ${t}`).toBe(true);
  });


  it('counts the consecutive take-off ticks of the best hold that pass the course', () => {
    const c = course([block(80, 10, 18)]);
    const s = new Solver(c, BASE_SPEED);
    const window = s.takeoffWindow([20]);
    let best = 0;
    let run = 0;
    for (let t = 0; t < 120; t++) {
      run = s.jumpWorks(t, 20) ? run + 1 : 0;
      best = Math.max(best, run);
    }
    expect(window).toBe(best);
    expect(window).toBeGreaterThan(5);
  });

  it('is 0 when nothing can be jumped and narrower when obstacles crowd the landing', () => {
    expect(new Solver(course([block(80, 10, 60)]), BASE_SPEED).takeoffWindow([3, 10, 20])).toBe(0);
    const lone = new Solver(course([block(80, 8, 22)]), MAX_SPEED).takeoffWindow([20]);
    const crowded = new Solver(course([block(80, 8, 22), block(150, 10, 18)]), MAX_SPEED).takeoffWindow([20]);
    expect(crowded).toBeLessThan(lone);
  });
});

describe('stomps in the solver', () => {
  const still: Motion = { walk: 0, sway: 0, phase: 0 };
  const person = { box: { x: 83, y: GROUND_Y - 22, w: 6, h: 22 }, anchor: 80, motion: still };
  const personCourse = (): Course => ({ obstacles: [], overhead: [], rails: [], movers: [person], goal: 89, limit: 89 + 400 });

  /** Jumps (take-off tick, hold) that pass with stomps on but crash without: they land on the head. */
  function onlyWithStomps(speed: number): { tick: number; hold: number }[] {
    const plain = new Solver(personCourse(), speed);
    const stomping = new Solver(personCourse(), speed, { stomps: true });
    const found: { tick: number; hold: number }[] = [];
    for (const hold of [1, 3, 6, 10]) {
      for (let tick = 0; tick < 50; tick++) if (stomping.jumpWorks(tick, hold) && !plain.jumpWorks(tick, hold)) found.push({ tick, hold });
    }
    return found;
  }

  for (const speed of [BASE_SPEED, MAX_SPEED]) {
    it(`a fall onto the head is a valid path with stomps on and a crash without (${speed} px/s)`, () => {
      expect(onlyWithStomps(speed).length).toBeGreaterThan(0);
    });
  }

  it('stomps are off by default: patterns are checked without them, so they never require one', () => {
    const s = new Solver(personCourse(), BASE_SPEED);
    expect(s.solvable()).toBe(true);
    const stomping = new Solver(personCourse(), BASE_SPEED, { stomps: true });
    for (let tick = 0; tick < 50; tick++) if (s.jumpWorks(tick, 20)) expect(stomping.jumpWorks(tick, 20)).toBe(true);
  });
});

describe('work budget (planning spread over ticks)', () => {
  const busy = () => course([block(60, 10, 17), block(150, 16, 12), block(230, 7, 21)]);

  /** Runs `work` with a fresh budget of `units` per try until it finishes; returns the result and the tries. */
  function sliced<T>(budget: WorkBudget, units: number, work: () => T): { result: T; tries: number } {
    for (let tries = 1; ; tries++) {
      budget.left = units;
      try {
        return { result: work(), tries };
      } catch (e) {
        if (e !== OUT_OF_WORK) throw e;
      }
    }
  }

  it('throws OUT_OF_WORK when the budget runs out, and resumed tries give the same answers as an unbudgeted solver', () => {
    for (const speed of [BASE_SPEED, 130, MAX_SPEED]) {
      const plain = new Solver(busy(), speed);
      const budget: WorkBudget = { left: 0 };
      const budgeted = new Solver(busy(), speed, { budget });
      const solvable = sliced(budget, 200, () => budgeted.solvable());
      expect(solvable.result).toBe(plain.solvable());
      expect(solvable.tries).toBeGreaterThan(1);
      expect(sliced(budget, 200, () => budgeted.fair([3, 10, 20], 12)).result).toBe(plain.fair([3, 10, 20], 12));
      expect(sliced(budget, 200, () => budgeted.bestJump()).result).toEqual(plain.bestJump());
    }
  });

  it('an unlimited budget never throws', () => {
    const s = new Solver(busy(), BASE_SPEED, { budget: { left: Infinity } });
    expect(() => s.fair([3, 10, 20], 12)).not.toThrow();
  });
});

describe('hold spread (drunk input: the release comes early or late)', () => {
  it('a pair fair for exact holds is unfair when every hold may come out up to 5 ticks shorter or longer', () => {
    // A bin and a planter-high block 60 px later at 120 px/s: only an exact hold lands in between.
    const s = new Solver(course([block(80, 10, 17), block(150, 12, 12)]), 120);
    expect(s.fair([3, 10, 20], 9)).toBe(true);
    expect(s.fair([3, 10, 20], 9, groundBody(), 5)).toBe(false);
  });

  it('a lone bin stays fair with the drunk hold spread and a wider window', () => {
    const s = new Solver(course([block(80, 10, 17)]), BASE_SPEED);
    expect(s.fair([3, 10, 20], 12, groundBody(), 5)).toBe(true);
  });

  it('a spread can only make a course less fair, never more', () => {
    for (const gap of [20, 40, 60, 80, 100, 120]) {
      const s = new Solver(course([block(80, 12, 17), block(92 + gap, 16, 12)]), 120);
      if (s.fair([3, 10, 20], 9, groundBody(), 5)) expect(s.fair([3, 10, 20], 9)).toBe(true);
    }
  });
});

describe('holds longer than a full press (a drunk player holding on)', () => {
  it('fly exactly like the full press: holding longer adds no height, even far beyond the hold keys', () => {
    const c = course([block(80, 10, 18)]);
    for (let tick = 0; tick < 40; tick++) {
      const primed = new Solver(c, BASE_SPEED);
      // The next tick's full press is cached first: a long hold must not read another take-off's flight.
      primed.jumpWorks(tick + 1, 20);
      expect(primed.jumpWorks(tick, 20 + 64), `tick ${tick}`).toBe(new Solver(c, BASE_SPEED).jumpWorks(tick, 20));
    }
  });
});
