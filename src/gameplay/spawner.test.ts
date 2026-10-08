import { describe, expect, it } from 'vitest';
import { PLAYER_X, TICK_DT, VIEW_MAX_W, VIEW_W } from '../core/config';
import { Rng } from '../core/rng';
import type { Entity } from '../types';
import { ZoneRoute } from '../world/zones';
import { isOverhead, isPerson, isRail } from './catalogue';
import { speedAt } from './difficulty';
import { itemOf } from './items';
import { anchorOf } from './motion';
import { BEER_AUTO_DRINK } from './auto-drink';
import { BEER_REACH, PLAN_WORK_PER_TICK, Spawner, type SpawnSituation } from './spawner';
import { TOSS_TIME } from './toss';
import { DRUNK_DURATION } from './use';

interface Spawned {
  kind: Entity['kind'];
  data?: Entity['data'];
  /** Street x (anchor for people) + distance: where it sits along the street, independent of when it appeared. */
  street: number;
  y: number;
  /** Screen x at the moment it was spawned. */
  spawnX: number;
  time: number;
}

interface RideOptions {
  workPerTick?: number;
  /** The situation at `time` seconds (default: sober, adult mode). */
  situation?: (time: number) => SpawnSituation;
  /** Background zone (themes the people) at the start; the route goes on from there. */
  zone?: number;
  /** Background zone all the way instead (no route). */
  fixedZone?: number;
  /** Called with the spawner's work after every tick. */
  work?: (units: number) => void;
  /** Street distance the ride starts at (default 0). */
  from?: number;
  /** Every Wasen visitor with a Maßkrug is stomped as it reaches the player, and the player may be drunk for this many seconds after. */
  beerSeconds?: number;
}

/** Scrolls a spawner like the live system does, recording every new entity. */
function ride(seed: number, viewWidth: number, seconds: number, options: RideOptions = {}): Spawned[] {
  // Without a zone: Stuttgart-Mitte all the way (no people), like a plain Spawner.
  const route = new ZoneRoute();
  route.snap(options.zone ?? 0, 0);
  const fixed = options.fixedZone;
  const zoneAt = fixed !== undefined ? () => fixed : options.zone === undefined ? undefined : (street: number) => route.zoneAt(street);
  const spawner = new Spawner(zoneAt, { workPerTick: options.workPerTick });
  spawner.reset(new Rng(seed));
  const entities: Entity[] = [];
  const seen: Spawned[] = [];
  let distance = options.from ?? 0;
  let drunkUntil = -Infinity;
  for (let t = 0; t < seconds / TICK_DT; t++) {
    const dx = speedAt(distance) * TICK_DT;
    for (const e of entities) e.x -= dx;
    spawner.scroll(dx);
    const before = entities.length;
    distance += dx;
    if (options.beerSeconds !== undefined) {
      for (const e of entities) {
        if (e.done || e.kind !== 'wasenGuest' || itemOf(e, false) !== 'beer' || e.x > PLAYER_X) continue;
        e.done = true;
        drunkUntil = t * TICK_DT + options.beerSeconds;
      }
    }
    const beer = t * TICK_DT < drunkUntil ? { drunk: true, kidMode: false } : undefined;
    spawner.spawn(entities, distance, viewWidth, null, beer ?? options.situation?.(t * TICK_DT));
    options.work?.(spawner.lastWork);
    for (const e of entities.slice(before)) {
      seen.push({ kind: e.kind, data: e.data, street: anchorOf(e) + distance, y: e.y, spawnX: e.x, time: t * TICK_DT });
    }
  }
  return seen;
}

describe('spawner', () => {
  it('is deterministic per seed and differs between seeds', () => {
    const a = ride(1, VIEW_MAX_W, 90);
    expect(a.length).toBeGreaterThan(30);
    expect(ride(1, VIEW_MAX_W, 90)).toEqual(a);
    expect(ride(2, VIEW_MAX_W, 90)).not.toEqual(a);
  });

  it('places the same street layout on every screen width (timing is distance based)', () => {
    const wide = ride(4, VIEW_MAX_W, 60);
    const narrow = ride(4, VIEW_W, 60);
    expect(narrow.length).toBeGreaterThan(20);
    narrow.forEach((e, i) => {
      expect(e.kind).toBe(wide[i]!.kind);
      expect(e.y).toBe(wide[i]!.y);
      expect(e.street).toBeCloseTo(wide[i]!.street, 6);
    });
  });

  it('spawns everything beyond the right edge, so nothing pops in', () => {
    for (const width of [VIEW_W, 380, VIEW_MAX_W]) {
      for (const e of ride(9, width, 60)) expect(e.spawnX).toBeGreaterThanOrEqual(width);
    }
  });

  it('leaves the first seconds of a run empty', () => {
    const first = ride(1, VIEW_MAX_W, 30)[0]!;
    // Reaches the player (x 64) no earlier than 3.5 s into the run.
    expect(first.time + (first.spawnX - 64) / speedAt(0)).toBeGreaterThan(3.5);
  });

  it('gets denser over time', () => {
    const all = ride(6, VIEW_MAX_W, 200).filter((e) => e.kind !== 'star');
    const early = all.filter((e) => e.time < 40).length;
    const late = all.filter((e) => e.time >= 160).length;
    expect(late).toBeGreaterThan(early);
  });
});

/** Ground obstacles only: no people, nothing overhead, no rails. */
const easy = (e: Spawned) => !isPerson(e.kind) && !isOverhead(e.kind) && !isRail(e.kind);

describe('spawner planning ahead with a work budget', () => {
  it('no tick plans more than its budget, and the street stays as busy as without a budget', () => {
    for (const seed of [1, 2, 3]) {
      let most = 0;
      const budgeted = ride(seed, VIEW_MAX_W, 120, { workPerTick: PLAN_WORK_PER_TICK, zone: 2, work: (u) => (most = Math.max(most, u)) });
      expect(most).toBeLessThanOrEqual(PLAN_WORK_PER_TICK);
      const plain = ride(seed, VIEW_MAX_W, 120, { zone: 2 });
      expect(budgeted.length).toBeGreaterThan(plain.length * 0.85);
    }
  }, 60_000);

  it('stays within its budget late in a run where every Maßkrug is stomped and drunk (plans thrown away for drunk ones)', () => {
    const beerSeconds = TOSS_TIME + BEER_AUTO_DRINK + DRUNK_DURATION;
    let most = 0;
    let stomps = 0;
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const seen = ride(seed, VIEW_MAX_W, 100, { workPerTick: PLAN_WORK_PER_TICK, fixedZone: 2, from: 14000, beerSeconds, work: (u) => (most = Math.max(most, u)) });
      stomps += seen.filter((e) => e.kind === 'wasenGuest' && itemOf(e, false) === 'beer').length;
    }
    expect(stomps).toBeGreaterThan(3);
    expect(most).toBeLessThanOrEqual(PLAN_WORK_PER_TICK);
  }, 60_000);

  it('a tick plans little enough for a slow phone (~1 ms at 4x CPU throttling)', () => {
    expect(PLAN_WORK_PER_TICK).toBeLessThanOrEqual(400);
  });

  it('with a budget large enough to never wait, lays exactly the unbudgeted street', () => {
    const plain = ride(5, VIEW_MAX_W, 90, { zone: 2 });
    const roomy = ride(5, VIEW_MAX_W, 90, { workPerTick: 1e9, zone: 2 });
    expect(roomy.map((e) => [e.kind, Math.round(e.street)])).toEqual(plain.map((e) => [e.kind, Math.round(e.street)]));
  });

  it('is deterministic per seed', () => {
    const a = ride(7, VIEW_MAX_W, 60, { workPerTick: PLAN_WORK_PER_TICK, zone: 1 });
    expect(ride(7, VIEW_MAX_W, 60, { workPerTick: PLAN_WORK_PER_TICK, zone: 1 })).toEqual(a);
  });
});

describe('spawner while the player may be drunk', () => {
  for (const workPerTick of [undefined, PLAN_WORK_PER_TICK]) {
    it(`everything that comes onto the street while drunk is easy (${workPerTick ? 'budgeted' : 'unbudgeted'})`, () => {
      for (const seed of [1, 2, 3, 4]) {
        const drunkFrom = 40;
        const seen = ride(seed, VIEW_MAX_W, 70, { workPerTick, zone: 2, situation: (t) => ({ drunk: t >= drunkFrom, kidMode: false }) });
        const whileDrunk = seen.filter((e) => e.time >= drunkFrom);
        expect(whileDrunk.length).toBeGreaterThan(3);
        expect(whileDrunk.filter((e) => !easy(e))).toEqual([]);
        // Sober before: people and harder patterns do come.
        expect(seen.some((e) => e.time < drunkFrom && !easy(e))).toBe(true);
      }
    }, 60_000);
  }

  it('lays no joint while the player may be drunk (the chill effect waits until sober)', () => {
    const sober = ride(1, VIEW_MAX_W, 120);
    expect(sober.some((e) => e.kind === 'joint')).toBe(true);
    const drunk = ride(1, VIEW_MAX_W, 120, { situation: () => ({ drunk: true, kidMode: false }) });
    expect(drunk.filter((e) => e.kind === 'joint')).toEqual([]);
  }, 60_000);

  it('after a Wasen visitor with a Maßkrug, the street a quick drinker reaches drunk is easy (adult mode)', () => {
    let guests = 0;
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const seen = ride(seed, VIEW_MAX_W, 120, { workPerTick: PLAN_WORK_PER_TICK, zone: 2 });
      for (const guest of seen.filter((e) => e.kind === 'wasenGuest' && itemOf(e, false) === 'beer')) {
        guests++;
        const after = seen.filter((e) => e.street > guest.street + 20 && e.street < guest.street + BEER_REACH);
        expect(after.filter((e) => !easy(e))).toEqual([]);
      }
    }
    expect(guests).toBeGreaterThan(2);
  }, 60_000);
});
