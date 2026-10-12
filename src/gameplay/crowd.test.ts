import { describe, expect, it } from 'vitest';
import { GROUND_Y } from '../core/config';
import { Rng } from '../core/rng';
import { isObstacle, isPerson, isRail } from './catalogue';
import {
  CROWD_CHANCE,
  CROWD_HEADS,
  CROWD_LEAD_SECONDS,
  CROWD_ROOM_SECONDS,
  CROWD_SPACING_SECONDS,
  CROWD_TEMPLATE,
  CROWD_ZONE,
  crowdDue,
  crowdOf,
  type CrowdCursor,
  crowdRow,
  planCrowd,
} from './crowd';
import { EARLY_TAKEOFF_WINDOW, HUMAN_HOLDS, LATE_TAKEOFF_WINDOW } from './fairness';
import { itemOf } from './items';
import { courseOf, leadFor, type Pattern } from './patterns';
import { Solver } from './solver';
import { ZoneRoute } from '../world/zones';

function plan(seed: number, speeds: number[], kidMode = false, window = LATE_TAKEOFF_WINDOW): Pattern | null {
  const steps = planCrowd(new Rng(seed), speeds, { kidMode, window });
  for (;;) {
    const step = steps.next();
    if (step.done) return step.value;
  }
}

const heads = (p: Pattern) => p.pieces.filter((x) => isObstacle(x.kind) || isRail(x.kind));

// The speeds a crowd can meet: it never comes in the first minute (~125 px/s and up), up to TOP_SPEED.
const SPEEDS = [[125, 128], [150], [172, 174], [190]];

describe('fan crowd: the pattern (ROADMAP 76)', () => {
  for (const speeds of SPEEDS) {
    for (const kidMode of [false, true]) {
      it(`is a row of ${kidMode ? 'kid mode' : 'adult'} fans of one kind, too wide to jump, passable only head to head (${speeds.join('-')} px/s)`, () => {
        const fast = Math.max(...speeds);
        for (let seed = 1; seed <= 4; seed++) {
          const p = plan(seed, speeds, kidMode)!;
          expect(p, `seed ${seed}`).not.toBeNull();
          expect(p.name).toBe(CROWD_TEMPLATE);
          const row = heads(p);
          const [min, max] = kidMode ? CROWD_HEADS.kid : CROWD_HEADS.adult;
          expect(row.length).toBeGreaterThanOrEqual(min);
          expect(row.length).toBeLessThanOrEqual(max);
          const theme = crowdOf(row[0]!);
          expect(theme).not.toBeNull();
          for (const fan of row) {
            expect(isPerson(fan.kind)).toBe(true);
            expect(crowdOf(fan)).toBe(theme);
            expect(fan.kind).toBe(theme === 'vfb' ? 'vfbFan' : 'wasenGuest');
            // Standing still: every head stays where the bounce expects it.
            expect(fan.data!.walk).toBe(0);
            expect(fan.data!.sway).toBe(0);
            expect(fan.y).toBe(row[0]!.y);
          }
          // Spaced so a plain bounce (~0.23 s up and down) carries the skater from one head to the next.
          for (let i = 1; i < row.length; i++) {
            const gap = row[i]!.x - row[i - 1]!.x;
            expect(gap).toBe(row[1]!.x - row[0]!.x);
            expect(gap).toBeGreaterThanOrEqual(Math.floor(CROWD_SPACING_SECONDS * Math.min(...speeds)) - 4);
            expect(gap).toBeLessThanOrEqual(Math.ceil(CROWD_SPACING_SECONDS * fast) + 4);
          }
          // Alone in its stretch: a long free run-up and free street after the last head.
          expect(row[0]!.x).toBeGreaterThanOrEqual(Math.floor(CROWD_LEAD_SECONDS * fast));
          const last = row[row.length - 1]!;
          expect(p.length - (last.x + last.w)).toBeGreaterThanOrEqual(Math.floor(CROWD_ROOM_SECONDS * fast));
          expect(p.pieces.filter((x) => x.kind !== 'star').length).toBe(row.length);
          const course = courseOf(p);
          for (const v of speeds) {
            expect(new Solver(course, v).solvable(), `seed ${seed}: one jump clears it at ${v}`).toBe(false);
            expect(new Solver(course, v, { stomps: true, maxStomps: 1 }).solvable(), `seed ${seed}: one head is enough at ${v}`).toBe(false);
            expect(new Solver(course, v, { stomps: true }).fair(HUMAN_HOLDS, LATE_TAKEOFF_WINDOW), `seed ${seed}: bouncing is not fair at ${v}`).toBe(true);
          }
        }
      }, 60_000);
    }
  }

  // The design proof (planCrowd only checks the bounce at run time): a row of 4-6 still fans one plain bounce apart
  // is never crossed by a jump or by a single stomp, and bouncing across is fair with the early window, at every speed.
  it('by design: 4-6 heads one bounce apart are too wide for one jump or one stomp and fair to bounce, 100-190 px/s', () => {
    const bad: string[] = [];
    for (const theme of ['vfb', 'wasen'] as const) {
      for (let v = 100; v <= 190; v += 3) {
        for (let n = CROWD_HEADS.kid[0]; n <= CROWD_HEADS.adult[1]; n++) {
          const course = courseOf(crowdRow({ theme, variants: [], banner: 1 }, n, Math.round(CROWD_SPACING_SECONDS * v), v));
          const plain = new Solver(course, v).solvable();
          const once = new Solver(course, v, { stomps: true, maxStomps: 1 }).solvable();
          const fair = new Solver(course, v, { stomps: true }).fair(HUMAN_HOLDS, EARLY_TAKEOFF_WINDOW);
          if (plain || once || !fair) bad.push(`${theme} ${v} px/s ${n} heads: one jump ${plain}, one stomp ${once}, fair ${fair}`);
        }
      }
    }
    expect(bad).toEqual([]);
  }, 60_000);

  it('marks the bounce line with one star arc: onto the first head and over the next ones, starting where a normal lead ends', () => {
    for (const speeds of SPEEDS) {
      for (let seed = 1; seed <= 4; seed++) {
        const p = plan(seed, speeds)!;
        const stars = p.pieces.filter((x) => x.kind === 'star');
        const row = heads(p);
        expect(stars.length, `seed ${seed}`).toBeGreaterThanOrEqual(5);
        expect(new Set(stars.map((x) => x.data?.arc)).size).toBe(1);
        for (const star of stars) expect(star.y + star.h).toBeLessThan(GROUND_Y - 6);
        // Something to react to no later than after a normal pattern's lead (spawner.ts quiet cap).
        expect(Math.min(...stars.map((x) => x.x))).toBeLessThanOrEqual(leadFor(Math.max(...speeds)));
        // The line goes on over the heads: stars above the last but one fan.
        const late = row[row.length - 2]!;
        expect(stars.some((x) => x.x + x.w > late.x && x.y + x.h < late.y)).toBe(true);
        expect(p.length).toBeGreaterThan(Math.max(...stars.map((x) => x.x + x.w)));
      }
    }
  }, 60_000);

  it(`keeps the early take-off window (${EARLY_TAKEOFF_WINDOW} ticks) when asked`, () => {
    const p = plan(3, [130], false, EARLY_TAKEOFF_WINDOW)!;
    expect(new Solver(courseOf(p), 130, { stomps: true }).fair(HUMAN_HOLDS, EARLY_TAKEOFF_WINDOW)).toBe(true);
  }, 30_000);

  it('comes as VfB fans and as Wasen visitors, and a stomp on a Wasen fan never tosses beer, also for adults', () => {
    const themes = new Set<string>();
    for (let seed = 1; seed <= 12; seed++) {
      const p = plan(seed, [160])!;
      for (const fan of heads(p)) {
        themes.add(crowdOf(fan)!);
        expect(itemOf(fan, false)).toBe(crowdOf(fan) === 'vfb' ? 'football' : 'gingerbread');
        expect(itemOf(fan, true)).not.toBe('beer');
      }
    }
    expect([...themes].sort()).toEqual(['vfb', 'wasen']);
  }, 60_000);
});

describe('fan crowd: when it comes (crowdDue, ROADMAP 76)', () => {
  const fresh = (): CrowdCursor => ({ crowdArmed: true, crowdAt: null });
  /** Every pattern start of a long ride through the zone route (~200 px apart), with the crowd decisions. */
  function ride(seed: number, first: number, until = 400_000) {
    const route = new ZoneRoute();
    route.snap(CROWD_ZONE, 0);
    const rng = new Rng(seed);
    const cursor = fresh();
    const due: { street: number; leg: number }[] = [];
    const visits = new Set<number>();
    for (let street = 0; street < until; street += 200) {
      const zone = route.zoneAt(street);
      if (zone === CROWD_ZONE && street >= first) visits.add(route.legAt(street));
      if (crowdDue(cursor, zone, street, first, rng)) {
        due.push({ street, leg: route.legAt(street) });
        // The spawner lays it: no second crowd in this visit.
        cursor.crowdAt = null;
      }
    }
    return { due, visits, route };
  }

  it('only in Bad Cannstatt, never before the first minute, at most once per visit', () => {
    const first = 5000;
    for (let seed = 1; seed <= 20; seed++) {
      const { due, route } = ride(seed, first, 120_000);
      const legs = new Set<number>();
      for (const d of due) {
        expect(route.zoneAt(d.street)).toBe(CROWD_ZONE);
        expect(d.street).toBeGreaterThanOrEqual(first);
        expect(legs.has(d.leg), `seed ${seed}: two crowds in leg ${d.leg}`).toBe(false);
        legs.add(d.leg);
      }
    }
  });

  it(`comes in about ${CROWD_CHANCE * 100} % of the Cannstatt visits`, () => {
    let visits = 0;
    let crowds = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const ridden = ride(seed, 0);
      visits += ridden.visits.size;
      crowds += ridden.due.length;
    }
    expect(visits).toBeGreaterThan(1000);
    expect(Math.abs(crowds / visits - CROWD_CHANCE)).toBeLessThan(0.04);
  });

  it('stays due inside the visit until the spawner lays it, and is re-armed by the next visit', () => {
    const rng = new Rng(1);
    const cursor = fresh();
    // Force the draw to hit: find a seed whose first draw is a crowd.
    let seed = 1;
    while (!new Rng(seed).chance(CROWD_CHANCE)) seed++;
    const hit = new Rng(seed);
    expect(crowdDue(cursor, 1, 0, 0, rng)).toBe(false);
    crowdDue(cursor, CROWD_ZONE, 1000, 0, hit);
    expect(cursor.crowdAt).not.toBeNull();
    const at = cursor.crowdAt!;
    expect(crowdDue(cursor, CROWD_ZONE, at - 1, 0, hit)).toBe(false);
    expect(crowdDue(cursor, CROWD_ZONE, at, 0, hit)).toBe(true);
    expect(crowdDue(cursor, CROWD_ZONE, at + 300, 0, hit)).toBe(true);
    // Leaving the zone drops a crowd not laid and arms the next visit.
    expect(crowdDue(cursor, 1, at + 4000, 0, hit)).toBe(false);
    expect(cursor).toEqual({ crowdArmed: true, crowdAt: null });
  });
});
