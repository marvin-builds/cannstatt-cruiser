import { describe, expect, it } from 'vitest';
import { BASE_SPEED, MAX_SPEED, PLAYER_X, TICK_DT, VIEW_MAX_W } from '../core/config';
import { Rng } from '../core/rng';
import { CHILL_JUMP_SCALE } from '../player/tuning';
import type { Entity } from '../types';
import { isObstacle, isPerson, isRail, obstacleRect } from './catalogue';
import { CHILL_SPEED_SCALE } from './chill';
import { speedAt } from './difficulty';
import { EARLY_TAKEOFF_WINDOW, EARLY_WINDOW_DISTANCE, HUMAN_HOLDS, humanFairAtAll, LATE_TAKEOFF_WINDOW, PERSON_ROOM_SECONDS, takeoffWindowAt } from './fairness';
import { ZoneRoute } from '../world/zones';
import { anchorOf, motionOf, moveTo } from './motion';
import { courseOf, type Pattern, type Piece, planPattern } from './patterns';
import { buildCourse } from './course';
import { constantPace, type Pace, Solver } from './solver';
import { Spawner } from './spawner';

const CHILL_LOW = BASE_SPEED * CHILL_SPEED_SCALE;
const PACES = [
  { name: 'min', pace: constantPace(BASE_SPEED) },
  { name: 'max', pace: constantPace(MAX_SPEED) },
  { name: 'chill min', pace: constantPace(CHILL_LOW, CHILL_JUMP_SCALE) },
  { name: 'chill max', pace: constantPace(MAX_SPEED, CHILL_JUMP_SCALE) },
];

const blocking = (p: Pick<Piece, 'kind'>) => isObstacle(p.kind) || isRail(p.kind);

function personPatterns(speeds: number[], chillSpeeds?: number[], count = 120, window = LATE_TAKEOFF_WINDOW, seeds = 40): Pattern[] {
  const out: Pattern[] = [];
  for (let seed = 1; out.length < count && seed <= seeds; seed++) {
    const rng = new Rng(seed);
    for (let i = 0; i < 12; i++) {
      const p = planPattern(rng, 3, speeds, { zone: 1 + (i % 2), chillSpeeds, window });
      if (p.pieces.some((x) => isPerson(x.kind))) out.push(p);
    }
  }
  return out;
}

describe('human take-off window', () => {
  it(`is ${EARLY_TAKEOFF_WINDOW} ticks (+-6) in the first ~90 s and ${LATE_TAKEOFF_WINDOW} ticks (+-5) after`, () => {
    expect(EARLY_TAKEOFF_WINDOW).toBeGreaterThanOrEqual(14);
    expect(LATE_TAKEOFF_WINDOW).toBeGreaterThanOrEqual(12);
    let d = 0;
    for (let t = 0; t < 88 / TICK_DT; t++) d += speedAt(d) * TICK_DT;
    expect(EARLY_WINDOW_DISTANCE).toBeGreaterThan(d);
    expect(takeoffWindowAt(0)).toBe(EARLY_TAKEOFF_WINDOW);
    expect(takeoffWindowAt(EARLY_WINDOW_DISTANCE - 1)).toBe(EARLY_TAKEOFF_WINDOW);
    expect(takeoffWindowAt(EARLY_WINDOW_DISTANCE)).toBe(LATE_TAKEOFF_WINDOW);
    expect(takeoffWindowAt(1e6)).toBe(LATE_TAKEOFF_WINDOW);
  });
});

describe('fair people: patterns', () => {
  it('a person always comes alone: no other obstacle or rail in its pattern', () => {
    for (const p of personPatterns([BASE_SPEED, MAX_SPEED], undefined, 100)) {
      expect(p.pieces.filter(blocking).map((x) => x.kind), p.name).toHaveLength(1);
    }
  }, 30_000);

  for (const { name, pace } of PACES) {
    it(`every person pattern leaves a human take-off window of >= ${LATE_TAKEOFF_WINDOW} ticks (${name} speed)`, () => {
      const chill = name.startsWith('chill');
      const v = pace.x(1) / TICK_DT;
      // Chilled at the slowest speed the low jump hangs over a person too briefly: the planner leaves people out there
      // (so a few seeds suffice to check that any it does place are fair).
      const patterns = chill ? personPatterns([v], [v], 40, LATE_TAKEOFF_WINDOW, name === 'chill min' ? 6 : 40) : personPatterns([v], undefined, 40);
      if (name !== 'chill min') expect(patterns.length).toBeGreaterThan(20);
      for (const p of patterns) {
        const window = new Solver(courseOf(p), pace).takeoffWindow(HUMAN_HOLDS);
        expect(window, JSON.stringify(p.pieces)).toBeGreaterThanOrEqual(LATE_TAKEOFF_WINDOW);
      }
    }, 30_000);
  }

  it(`early in the run every person pattern leaves >= ${EARLY_TAKEOFF_WINDOW} ticks`, () => {
    const patterns = personPatterns([BASE_SPEED, speedAt(EARLY_WINDOW_DISTANCE)], undefined, 20, EARLY_TAKEOFF_WINDOW);
    expect(patterns.length).toBeGreaterThan(12);
    for (const p of patterns) {
      for (const v of [BASE_SPEED, speedAt(EARLY_WINDOW_DISTANCE)]) {
        expect(new Solver(courseOf(p), v).takeoffWindow(HUMAN_HOLDS), JSON.stringify(p.pieces)).toBeGreaterThanOrEqual(EARLY_TAKEOFF_WINDOW);
      }
    }
  }, 30_000);

  it('a pattern is checked together with the end of the previous one (across the boundary)', () => {
    // A previous piece reaching into this pattern's run-up (an overhead sign at x 20) rules out jumping right after it.
    const before: Piece[] = [{ kind: 'banner', ...obstacleRect('banner', 20) }];
    for (const v of [BASE_SPEED, MAX_SPEED]) {
      const rng = new Rng(4);
      for (let i = 0; i < 60; i++) {
        const pattern = planPattern(rng, 3, [v], { zone: i % 3, before });
        const course = courseOf({ ...pattern, pieces: [...before, ...pattern.pieces] }, -60);
        expect(new Solver(course, v).solvable(), `${v} ${JSON.stringify(pattern.pieces)}`).toBe(true);
      }
    }
  }, 30_000);
});

describe('fair for humans: every pattern, not only people', () => {
  it('rejects a pair whose only way through needs an in-between hold (planter + barrier 28 px apart, 98 px/s)', () => {
    const pieces: Piece[] = [
      { kind: 'planter', ...obstacleRect('planter', 110) },
      { kind: 'barrier', ...obstacleRect('barrier', 156) },
    ];
    const course = courseOf({ name: 'tight', pieces, length: 240 });
    expect(new Solver(course, 98).solvable()).toBe(true);
    expect(new Solver(course, 98).takeoffWindow(HUMAN_HOLDS)).toBeLessThan(LATE_TAKEOFF_WINDOW);
    expect(humanFairAtAll(course, [98])).toBe(false);
  });

  it('a lone bin is fair at every speed: one window, nothing after it', () => {
    const course = courseOf({ name: 'bin', pieces: [{ kind: 'bin', ...obstacleRect('bin', 60) }], length: 140 });
    expect(humanFairAtAll(course, [BASE_SPEED, MAX_SPEED, constantPace(MAX_SPEED, CHILL_JUMP_SCALE)])).toBe(true);
  });

  for (const [stage, window, speeds] of [
    ['early', EARLY_TAKEOFF_WINDOW, [96, 110]],
    ['later', LATE_TAKEOFF_WINDOW, [135, MAX_SPEED]],
  ] as const) {
    it(`every take-off a pattern asks for, also after landing, has a human window of >= ${window} ticks (${stage}, all tiers, ${speeds.join('-')} px/s)`, () => {
      const tight: string[] = [];
      for (let seed = 1; seed <= 12; seed++) {
        const rng = new Rng(seed);
        for (const v of speeds) {
          for (let i = 0; i < 10; i++) {
            const p = planPattern(rng, 1 + (i % 3), [v], { zone: i % 3, window });
            // fair() checks the first take-off too (a run may mix grind and ground landings, which takeoffWindow splits).
            if (!humanFairAtAll(courseOf(p), [v], window)) tight.push(`${v} ${p.name}: ${JSON.stringify(p.pieces.map((x) => [x.kind, x.x]))}`);
          }
        }
      }
      expect(tight).toEqual([]);
    }, 30_000);
  }
});

interface Seen {
  e: Entity;
  /** Street x of the anchor (x + distance at spawn). */
  street: number;
  speed: number;
}

/** Scrolls a spawner like the live system and calls `visit` every tick with the live entities. */
function ride(seed: number, seconds: number, visit: (entities: Entity[], distance: number) => void): Seen[] {
  const route = new ZoneRoute();
  route.snap(0, 0);
  const spawner = new Spawner((street) => route.zoneAt(street));
  spawner.reset(new Rng(seed));
  const entities: Entity[] = [];
  const seen: Seen[] = [];
  let distance = 0;
  for (let t = 0; t < seconds / TICK_DT; t++) {
    const speed = speedAt(distance);
    const dx = speed * TICK_DT;
    for (const e of entities) moveTo(e, anchorOf(e) - dx);
    spawner.scroll(dx);
    distance += dx;
    const before = entities.length;
    spawner.spawn(entities, distance, VIEW_MAX_W, null);
    for (const e of entities.slice(before)) seen.push({ e, street: anchorOf(e) + distance, speed: speedAt(distance) });
    visit(entities, distance);
    for (let i = entities.length - 1; i >= 0; i--) if (entities[i]!.x + entities[i]!.w < -40) entities.splice(i, 1);
  }
  return seen;
}

describe('fair people: the street around them (spawner rides, 20 seeds x 3 min)', () => {
  it(`keeps >= ${PERSON_ROOM_SECONDS} s of free street before and after every person, and nobody walks into an obstacle`, () => {
    let people = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const overlaps: string[] = [];
      const seen = ride(seed, 180, (entities) => {
        for (const p of entities) {
          if (!isPerson(p.kind) || p.x > VIEW_MAX_W) continue;
          for (const o of entities) {
            if (o === p || !blocking(o) || o.x > VIEW_MAX_W) continue;
            if (p.x < o.x + o.w && o.x < p.x + p.w) overlaps.push(`${p.kind} ${o.kind} at ${Math.round(p.x)}`);
          }
        }
      });
      expect(overlaps, `seed ${seed}`).toEqual([]);
      const solid = seen.filter((s) => blocking(s.e));
      for (const s of solid.filter((x) => isPerson(x.e.kind))) {
        people++;
        const room = PERSON_ROOM_SECONDS * s.speed;
        const sway = motionOf(s.e)!.sway;
        for (const o of solid) {
          if (o === s) continue;
          const gap = o.street > s.street ? o.street - (s.street + s.e.w + sway) : s.street - sway - (o.street + o.e.w);
          expect(gap, `seed ${seed}: ${s.e.kind} at ${Math.round(s.street)} vs ${o.e.kind} at ${Math.round(o.street)}`).toBeGreaterThanOrEqual(room);
        }
      }
    }
    expect(people).toBeGreaterThan(100);
  }, 60_000);
});

/** The street ridden from distance 0 at the difficulty speed: course x (= distance) after `tick` ticks. */
function rampPace(): Pace {
  const xs = [0];
  return {
    x(tick) {
      for (let t = xs.length; t <= tick; t++) xs.push(xs[t - 1]! + speedAt(xs[t - 1]!) * TICK_DT);
      return xs[tick]!;
    },
    jumpScale: () => 1,
  };
}

describe('fair for humans: the whole street of a run (spawner rides, real speed ramp)', () => {
  it(`every take-off of a 3 min run, across all pattern boundaries, has a human window of >= ${EARLY_TAKEOFF_WINDOW} ticks in the first ~90 s and >= ${LATE_TAKEOFF_WINDOW} after`, () => {
    for (const seed of [1, 2, 3]) {
      // Street x of every piece, so x = 0 is the player at the run start.
      const pieces: Piece[] = ride(seed, 180, () => {})
        .filter((s) => blocking(s.e))
        .map((s) => ({ ...s.e, x: s.street - PLAYER_X, data: s.e.data && { ...s.e.data, ax: s.street - PLAYER_X } }));
      const early = pieces.filter((p) => p.x + p.w < EARLY_WINDOW_DISTANCE);
      const earlyCourse = buildCourse(early, 0, (goal) => goal + 400);
      expect(new Solver(earlyCourse, rampPace()).fair(HUMAN_HOLDS, EARLY_TAKEOFF_WINDOW), `seed ${seed} early`).toBe(true);
      const course = buildCourse(pieces, 0, (goal) => goal + 400);
      expect(new Solver(course, rampPace()).fair(HUMAN_HOLDS, LATE_TAKEOFF_WINDOW), `seed ${seed}`).toBe(true);
    }
  }, 60_000);
});
