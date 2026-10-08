import { describe, expect, it } from 'vitest';
import { PLAYER_X, TICK_DT, VIEW_MAX_W } from '../core/config';
import { Rng } from '../core/rng';
import type { Entity, ParkPlan } from '../types';
import { ZoneRoute } from '../world/zones';
import { speedAt } from './difficulty';
import { anchorOf } from './motion';
import { PARK_MAX_LENGTH, PARK_MIN_SPEED } from './park-line';
import { CHILL_REACH, PARK_ANNOUNCE, PARK_FIRST_SECONDS, Spawner, type SpawnSituation } from './spawner';

const CANNSTATT = 2;

interface Seen {
  e: Entity;
  street: number;
}

interface Ride {
  seen: Seen[];
  /** Every distinct park plan, with the distance at which the spawner first showed it. */
  parks: { plan: ParkPlan; shownAt: number }[];
  /** Speed per tick and the distance it was ridden at. */
  speeds: { distance: number; speed: number }[];
  route: ZoneRoute;
  timeAt(distance: number): number;
}

/** Scrolls a spawner like the live game, the speed from the paused ramp (spawner.rampDistance) or pinned. */
function ride(seed: number, seconds: number, options: { speed?: number; situation?: (t: number) => SpawnSituation } = {}): Ride {
  const route = new ZoneRoute();
  const spawner = new Spawner((street) => route.zoneAt(street), { workPerTick: 400 });
  spawner.reset(new Rng(seed));
  const entities: Entity[] = [];
  const seen: Seen[] = [];
  const parks: Ride['parks'] = [];
  const speeds: Ride['speeds'] = [];
  let distance = 0;
  for (let t = 0; t < seconds / TICK_DT; t++) {
    const speed = options.speed ?? speedAt(spawner.rampDistance(distance));
    speeds.push({ distance, speed });
    const dx = speed * TICK_DT;
    for (const e of entities) e.x -= dx;
    spawner.scroll(dx);
    distance += dx;
    const before = entities.length;
    spawner.spawn(entities, distance, VIEW_MAX_W, options.speed ?? null, options.situation?.(t * TICK_DT));
    for (const e of entities.slice(before)) seen.push({ e, street: anchorOf(e) + distance - PLAYER_X });
    const park = spawner.park;
    if (park && !parks.some((p) => p.plan === park)) parks.push({ plan: park, shownAt: distance });
    for (let i = entities.length - 1; i >= 0; i--) if (entities[i]!.x + entities[i]!.w < -200) entities.splice(i, 1);
  }
  return {
    seen,
    parks,
    speeds,
    route,
    timeAt: (d) => {
      const i = speeds.findIndex((s) => s.distance >= d);
      return i < 0 ? Infinity : i * TICK_DT;
    },
  };
}

/** Cannstatt legs whose whole stretch was ridden. */
function cannstattVisits(r: Ride): [number, number][] {
  const end = r.speeds.at(-1)!.distance;
  const visits: [number, number][] = [];
  for (let k = 0; ; k++) {
    const from = k === 0 ? 0 : r.route.boundary(k);
    if (from > end) break;
    const to = r.route.boundary(k + 1);
    if (r.route.zoneOf(k) === CANNSTATT && to <= end) visits.push([from, to]);
  }
  return visits;
}

const RIDES = [1, 2, 3, 4].map((seed) => ride(seed, 330));
const inPark = (s: Seen, p: ParkPlan) => s.street + s.e.w > p.start && s.street < p.end;

describe('the NorDIY park in the spawner', { timeout: 120_000 }, () => {
  it(`is planned once per Bad Cannstatt visit, inside its stretch, never in the first ${PARK_FIRST_SECONDS} s`, () => {
    for (const r of RIDES) {
      const visits = cannstattVisits(r);
      expect(visits.length).toBeGreaterThanOrEqual(2);
      for (const [from, to] of visits) {
        const parks = r.parks.filter((p) => p.plan.start >= from && p.plan.start < to);
        expect(parks.length, `visit ${from}-${to}`).toBe(1);
        const { plan } = parks[0]!;
        expect(plan.end).toBeLessThanOrEqual(to);
        expect(plan.end - plan.start).toBeLessThanOrEqual(PARK_MAX_LENGTH);
        expect(r.timeAt(plan.start)).toBeGreaterThanOrEqual(PARK_FIRST_SECONDS);
      }
      // No park outside Bad Cannstatt.
      for (const { plan } of r.parks) expect(r.route.zoneAt(plan.start) === CANNSTATT && r.route.zoneAt(plan.end) === CANNSTATT).toBe(true);
    }
  });

  it(`shows the plan at least PARK_ANNOUNCE (${PARK_ANNOUNCE}) px before its start reaches the skater, more than a view width ahead of the screen`, () => {
    expect(PARK_ANNOUNCE).toBeGreaterThanOrEqual(2 * VIEW_MAX_W - PLAYER_X);
    for (const r of RIDES) for (const { plan, shownAt } of r.parks) expect(plan.start - shownAt).toBeGreaterThanOrEqual(PARK_ANNOUNCE);
  });

  it('lays the park line, the high fiver and stars only in [start, end): no obstacle, person, rail, joint or other line', () => {
    for (const r of RIDES) {
      for (const { plan } of r.parks) {
        const inside = r.seen.filter((s) => inPark(s, plan));
        expect(inside.some((s) => s.e.kind === 'highFiver')).toBe(true);
        for (const s of inside) {
          const ok = s.e.kind === 'star' || s.e.kind === 'highFiver' || ((s.e.kind === 'kicker' || s.e.kind === 'ledge') && s.e.data?.park !== undefined);
          expect(ok, `${s.e.kind} at ${s.street} in park ${plan.start}-${plan.end}`).toBe(true);
        }
        // The park's pieces are its entities, 1:1 in run distance.
        const structures = inside.filter((s) => s.e.data?.park !== undefined).sort((a, b) => a.street - b.street);
        expect(structures.map((s) => ({ kind: s.e.data!.park, from: s.street, to: s.street + s.e.w }))).toEqual(
          plan.pieces.map(({ kind, from, to }) => ({ kind, from: expect.closeTo(from, 6), to: expect.closeTo(to, 6) })),
        );
      }
    }
  });

  it('keeps other stunt lines apart from the park', () => {
    for (const r of RIDES) {
      for (const { plan } of r.parks) {
        const lines = r.seen.filter((s) => s.e.kind === 'kicker' && s.e.data?.park === undefined);
        for (const k of lines) expect(k.street < plan.start - 300 || k.street > plan.end).toBe(true);
      }
    }
  });

  it('the speed ramp pauses inside the park and goes on from the same speed after it', () => {
    for (const r of RIDES) {
      for (const { plan } of r.parks) {
        const inside = r.speeds.filter((s) => s.distance >= plan.start && s.distance < plan.end).map((s) => s.speed);
        expect(inside.length).toBeGreaterThan(100);
        expect(Math.max(...inside) - Math.min(...inside)).toBe(0);
        const i = r.speeds.findIndex((s) => s.distance >= plan.end);
        const steps = r.speeds.slice(i - 5, i + 60).map((s, j, all) => (j === 0 ? 0 : s.speed - all[j - 1]!.speed));
        for (const d of steps) {
          expect(d).toBeGreaterThanOrEqual(0);
          expect(d).toBeLessThan(0.05);
        }
        // The paused ramp: after the park the speed is the plain ramp's at the distance minus the parks ridden.
        const later = r.speeds[i + 120]!;
        const paused = r.parks.filter((p) => p.plan.end <= later.distance).reduce((sum, p) => sum + p.plan.end - p.plan.start, 0);
        expect(later.speed).toBeCloseTo(speedAt(later.distance - paused), 6);
      }
    }
  });

  it('is deterministic with the run seed', () => {
    const again = ride(2, 330);
    expect(again.parks.map((p) => p.plan)).toEqual(RIDES[1]!.parks.map((p) => p.plan));
  });

  it('never while the player may be drunk, nor in the street the chill effect reaches', () => {
    expect(ride(1, 120, { situation: () => ({ drunk: true, kidMode: false }) }).parks).toEqual([]);
    for (const r of RIDES) {
      const joints = r.seen.filter((s) => s.e.kind === 'joint').map((s) => s.street);
      for (const { plan } of r.parks) for (const j of joints) expect(plan.start < j || plan.start > j + CHILL_REACH).toBe(true);
    }
  });

  it('comes at a pinned speed too (the debug and playtest speed)', () => {
    const r = ride(5, 40, { speed: 120 });
    expect(r.parks.length).toBe(1);
  });

  it(`never at a pinned crawl or standstill (below PARK_MIN_SPEED), and stays armed for when the speed is free`, () => {
    // Pinned at 0 from the run's first tick the spawner never finishes planning (not the park's doing);
    // a pin at 0 mid-run is low-speed.test.ts's live game.
    for (const speed of [30, PARK_MIN_SPEED - 1]) expect(ride(5, 20, { speed }).parks.length).toBe(0);
  });

  it('keeps a reserved park span (the debug park) free of other patterns and pauses the ramp there', () => {
    const spawner = new Spawner(() => 1, { workPerTick: 400 });
    spawner.reset(new Rng(3));
    const entities: Entity[] = [];
    let distance = 0;
    const step = (ticks: number) => {
      for (let t = 0; t < ticks; t++) {
        const dx = speedAt(spawner.rampDistance(distance)) * TICK_DT;
        for (const e of entities) e.x -= dx;
        spawner.scroll(dx);
        distance += dx;
        spawner.spawn(entities, distance, VIEW_MAX_W, null);
      }
    };
    step(600);
    const start = distance + VIEW_MAX_W;
    const end = start + 800;
    spawner.reserve(start, end, distance);
    expect(spawner.rampDistance(end + 100)).toBeCloseTo(end + 100 - 800, 6);
    const before = new Set(entities);
    step(60 * 20);
    const later = entities.filter((e) => !before.has(e));
    expect(later.length).toBeGreaterThan(0);
    for (const e of later) expect(e.x + distance - PLAYER_X >= end || e.x + e.w + distance - PLAYER_X <= start).toBe(true);
  });
});
