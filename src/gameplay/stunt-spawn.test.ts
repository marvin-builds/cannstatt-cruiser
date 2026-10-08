import { describe, expect, it } from 'vitest';
import { PLAYER_X, TICK_DT, VIEW_MAX_W } from '../core/config';
import { Rng } from '../core/rng';
import type { Entity } from '../types';
import { ZoneRoute } from '../world/zones';
import { isObstacle, isRail } from './catalogue';
import { speedAt } from './difficulty';
import { anchorOf } from './motion';
import { CHILL_REACH, Spawner, type SpawnSituation, STUNT_FIRST_SECONDS, STUNT_LINE_INTERVAL } from './spawner';
import { stuntWorstLanding } from './stunt-line';

interface Seen {
  e: Entity;
  /** Street position (anchor + distance) when it appeared. */
  street: number;
  time: number;
}

interface Ride {
  seen: Seen[];
  /** Run time (s) at which the player reached street distance d. */
  timeAt(street: number): number;
}

/** Scrolls a spawner like the live game (speed from the difficulty or pinned) and records every entity. */
function ride(seed: number, seconds: number, options: { speed?: number; situation?: (t: number) => SpawnSituation; from?: number } = {}): Ride {
  const route = new ZoneRoute();
  const spawner = new Spawner((street) => route.zoneAt(street));
  spawner.reset(new Rng(seed));
  const entities: Entity[] = [];
  const seen: Seen[] = [];
  const marks: number[] = [];
  let distance = options.from ?? 0;
  for (let t = 0; t < seconds / TICK_DT; t++) {
    const speed = options.speed ?? speedAt(distance);
    const dx = speed * TICK_DT;
    for (const e of entities) e.x -= dx;
    spawner.scroll(dx);
    distance += dx;
    marks.push(distance);
    const before = entities.length;
    spawner.spawn(entities, distance, VIEW_MAX_W, options.speed ?? null, options.situation?.(t * TICK_DT));
    for (const e of entities.slice(before)) seen.push({ e, street: anchorOf(e) + distance, time: t * TICK_DT });
    // Keep the array short like the live game's despawn.
    for (let i = entities.length - 1; i >= 0; i--) if (entities[i]!.x + entities[i]!.w < -200) entities.splice(i, 1);
  }
  return {
    seen,
    timeAt: (street) => {
      const reach = street - PLAYER_X;
      const i = marks.findIndex((d) => d >= reach);
      return i < 0 ? Infinity : i * TICK_DT;
    },
  };
}

/** Each line's first kicker. */
const lineStarts = (r: Ride) => r.seen.filter((s) => s.e.kind === 'kicker' && s.e.data?.step === 1);

/** The pieces of each line (by line id). */
function linesOf(r: Ride): Map<number, Seen[]> {
  const lines = new Map<number, Seen[]>();
  for (const s of r.seen) {
    if (s.e.kind !== 'kicker' && s.e.kind !== 'ledge') continue;
    const id = Number(s.e.data!.line);
    lines.set(id, [...(lines.get(id) ?? []), s]);
  }
  return lines;
}

const RIDES = [1, 2, 3].map((seed) => ride(seed, 300));

describe('stunt lines in the spawner', { timeout: 120_000 }, () => {
  it(`come about every ${STUNT_LINE_INTERVAL[0]}-${STUNT_LINE_INTERVAL[1]} s of riding, never in the first ${STUNT_FIRST_SECONDS} s`, () => {
    for (const r of RIDES) {
      const times = lineStarts(r)
        .map((s) => r.timeAt(s.street))
        .filter((t) => t < Infinity);
      expect(times.length).toBeGreaterThanOrEqual(6);
      expect(times[0]!).toBeGreaterThanOrEqual(20);
      for (let i = 1; i < times.length; i++) {
        const gap = times[i]! - times[i - 1]!;
        expect(gap).toBeGreaterThanOrEqual(STUNT_LINE_INTERVAL[0] - 1);
        expect(gap).toBeLessThanOrEqual(STUNT_LINE_INTERVAL[1] + 6);
      }
    }
  });

  it('the street under a line holds nothing but its kickers, and every way off it lands well before the next pattern', () => {
    for (const r of RIDES) {
      const street = r.seen.filter((s) => isObstacle(s.e.kind) || isRail(s.e.kind));
      for (const pieces of linesOf(r).values()) {
        const start = pieces[0]!.street;
        // Pieces are laid in one go: their street offset from the kicker is their pattern offset.
        const fast = speedAt(start + 700);
        const worst = start + stuntWorstLanding(pieces.map((p) => ({ ...p.e, x: p.street - start })), fast);
        const next = Math.min(...street.filter((s) => s.street + s.e.w > start - 40).map((s) => s.street));
        expect(next).toBeGreaterThanOrEqual(worst + 20 + 0.3 * fast);
        const before = street.filter((s) => s.street < start).map((s) => s.street + s.e.w);
        expect(start - Math.max(...before)).toBeGreaterThan(60);
      }
    }
  });

  it('comes at a pinned top speed (190) too, with the street under it free', () => {
    const r = ride(4, 160, { speed: 190 });
    expect(lineStarts(r).length).toBeGreaterThanOrEqual(3);
    const street = r.seen.filter((s) => isObstacle(s.e.kind) || isRail(s.e.kind));
    for (const pieces of linesOf(r).values()) {
      const start = pieces[0]!.street;
      const worst = start + stuntWorstLanding(pieces.map((p) => ({ ...p.e, x: p.street - start })), 190);
      expect(street.some((s) => s.street + s.e.w > start - 40 && s.street < worst + 20 + 0.3 * 190)).toBe(false);
    }
  });

  it('never while the player may be drunk', () => {
    const r = ride(1, 200, { situation: () => ({ drunk: true, kidMode: false }) });
    expect(lineStarts(r)).toEqual([]);
  });

  it('never in the street the chill effect reaches after a joint, and the same in kid mode', () => {
    let lines = 0;
    for (const seed of [1, 2, 3, 5]) {
      const r = ride(seed, 300, { situation: () => ({ drunk: false, kidMode: seed === 5 }) });
      const joints = r.seen.filter((s) => s.e.kind === 'joint').map((s) => s.street);
      for (const k of lineStarts(r)) {
        lines++;
        for (const j of joints) expect(k.street < j || k.street > j + CHILL_REACH).toBe(true);
      }
    }
    expect(lines).toBeGreaterThan(20);
  });
});
