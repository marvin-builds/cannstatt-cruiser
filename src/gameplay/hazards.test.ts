import { describe, expect, it } from 'vitest';
import { BASE_SPEED, PLAYER_X, TICK_DT } from '../core/config';
import { Rng } from '../core/rng';
import { tick } from '../player/testing';
import { isObstacle, isPerson, OBSTACLES } from './catalogue';
import { buildCourse } from './course';
import { TOP_SPEED } from './difficulty';
import { EARLY_TAKEOFF_WINDOW, humanFair, LATE_TAKEOFF_WINDOW, soberFairness, solversFor } from './fairness';
import { isPigeons, isScooter, PIGEONS, SCOOTER, scooterPiece } from './hazards';
import { motionOf } from './motion';
import { courseOf, leadFor, mixAt, type Pattern, planPattern, TEMPLATE_NAMES } from './patterns';
import { Solver } from './solver';
import { quietGame } from './test-kit';

const SPEEDS = [BASE_SPEED, TOP_SPEED];

function plans(name: string, speed: number, window: number, count = 6, kidMode = false): Pattern[] {
  return Array.from({ length: count }, (_, seed) => planPattern(new Rng(seed + 1), 2, [speed], { zone: seed % 3, window, template: name, kidMode }));
}

describe('moving local hazards (ROADMAP 52 Phase 2, point 7)', () => {
  it('the e-scooter and the pigeons are spawn templates from tier 2 on, in every zone', () => {
    for (const name of ['scooter', 'pigeons']) {
      expect(TEMPLATE_NAMES).toContain(name);
      for (const zone of [0, 1, 2]) {
        expect(mixAt(1, zone)[name] ?? 0, name).toBe(0);
        expect(mixAt(2, zone)[name], `${name} zone ${zone}`).toBeGreaterThan(0.03);
      }
    }
  });
});

describe('e-scooter', () => {
  it('is a rider coming towards the skater, faster than the street: stompable like a person', () => {
    for (const p of plans('scooter', 140, LATE_TAKEOFF_WINDOW)) {
      expect(p.name).toBe('scooter');
      const riders = p.pieces.filter((x) => isScooter(x));
      expect(riders).toHaveLength(1);
      const rider = riders[0]!;
      expect(isPerson(rider.kind)).toBe(true);
      const m = motionOf(rider)!;
      expect(m.walk).toBeGreaterThanOrEqual(SCOOTER.walk[0]);
      expect(m.walk).toBeLessThanOrEqual(SCOOTER.walk[1]);
      expect(m.sway).toBe(0);
      // Alone in its pattern (stars aside), like a person.
      expect(p.pieces.filter((x) => isObstacle(x.kind))).toHaveLength(1);
    }
  });

  it('kid mode: gentler, it comes in slower', () => {
    expect(SCOOTER.kidWalk[1]).toBeLessThan(SCOOTER.walk[0]);
    for (const p of plans('scooter', 140, LATE_TAKEOFF_WINDOW, 6, true)) {
      const walk = motionOf(p.pieces.find((x) => isScooter(x))!)!.walk;
      expect(walk).toBeGreaterThanOrEqual(SCOOTER.kidWalk[0]);
      expect(walk).toBeLessThanOrEqual(SCOOTER.kidWalk[1]);
    }
  });

  for (const speed of SPEEDS) {
    it(`keeps the full take-off window with its real motion, and every stomp leads on (${speed} px/s)`, () => {
      for (const kidMode of [false, true]) {
        for (const window of [EARLY_TAKEOFF_WINDOW, LATE_TAKEOFF_WINDOW]) {
          for (const p of plans('scooter', speed, window, 6, kidMode)) {
            expect(p.name).toBe('scooter');
            const course = courseOf(p);
            // The solver sees the rider moving: its real walk, not a standing person.
            expect(course.movers).toHaveLength(1);
            expect(course.movers![0]!.motion.walk).toBe(motionOf(p.pieces.find((x) => isScooter(x))!)!.walk);
            expect(humanFair(solversFor(course, [speed]), soberFairness(window)), JSON.stringify(p.pieces)).toBe(true);
            const rider = p.pieces.find((x) => isScooter(x))!;
            const stomping = new Solver(courseOf(p, rider.x - leadFor(speed)), speed, { stomps: true });
            expect(stomping.stompsLeadOn(soberFairness(window).holds, window)).toBe(true);
          }
        }
      }
    }, 120_000);
  }

  it('on the street it closes in faster than the scroll and is drawn where it collides', () => {
    const game = quietGame(120);
    const rider = { id: 31_000, ...scooterPiece(new Rng(1), 300, false), done: false };
    game.state.entities.push(rider);
    tick(game, 1);
    const before = rider.x;
    tick(game, 10);
    const moved = before - rider.x;
    expect(moved).toBeGreaterThan(120 * TICK_DT * 10 * (1 + SCOOTER.walk[0]) - 1);
    expect(rider.x).toBeGreaterThan(PLAYER_X);
  });
});

describe('pigeons', () => {
  it('are a flock on the street, harmless for the solver, followed by an easy low obstacle', () => {
    for (const p of plans('pigeons', 140, LATE_TAKEOFF_WINDOW)) {
      expect(p.name).toBe('pigeons');
      expect(p.pieces.filter((x) => isPigeons(x))).toHaveLength(1);
      const flock = p.pieces.find((x) => isPigeons(x))!;
      expect(flock.w).toBe(PIGEONS.w);
      const lows = p.pieces.filter((x) => isObstacle(x.kind));
      expect(lows.length).toBeGreaterThanOrEqual(1);
      for (const o of lows) {
        expect(OBSTACLES[o.kind as keyof typeof OBSTACLES].elevation).toBe(0);
        expect(isPerson(o.kind)).toBe(false);
        expect(o.x).toBeGreaterThan(flock.x + flock.w);
      }
      // Live, nothing about the flock can crash: the course of the entities leaves it out.
      const live = buildCourse(p.pieces, 0, (goal) => goal + 200);
      const boxes = [...live.obstacles, ...live.ledges!.map((l) => l.box), ...live.overhead];
      expect(boxes).toHaveLength(lows.length);
      for (const box of boxes) expect(box.x).toBeGreaterThan(flock.x + flock.w);
    }
  });

  for (const speed of SPEEDS) {
    it(`a jump over the flock (rewarded) still leaves the full window for what follows (${speed} px/s)`, () => {
      for (const window of [EARLY_TAKEOFF_WINDOW, LATE_TAKEOFF_WINDOW]) {
        for (const p of plans('pigeons', speed, window)) {
          expect(p.name).toBe('pigeons');
          // Planned with the flock as a low obstacle: every path jumps it, and is fair.
          const course = courseOf(p);
          const flock = p.pieces.find((x) => isPigeons(x))!;
          expect(course.obstacles.some((o) => o.x >= flock.x && o.x + o.w <= flock.x + flock.w)).toBe(true);
          expect(humanFair(solversFor(course, [speed]), soberFairness(window)), JSON.stringify(p.pieces)).toBe(true);
          // Riding through (or ducking under) and jumping the rest: fair too.
          const street = { ...p, pieces: p.pieces.filter((x) => !isPigeons(x)) };
          expect(humanFair(solversFor(courseOf(street), [speed]), soberFairness(window))).toBe(true);
        }
      }
    }, 60_000);
  }
});
