import { describe, expect, it } from 'vitest';
import { PLAYER_X, TICK_DT, VIEW_MAX_W } from '../core/config';
import { Rng } from '../core/rng';
import type { Entity } from '../types';
import { ZoneRoute } from '../world/zones';
import { isObstacle, isRail } from './catalogue';
import { CROWD_FIRST_SECONDS, CROWD_HEADS, CROWD_LEAD_SECONDS, CROWD_ROOM_SECONDS, CROWD_TEMPLATE, CROWD_ZONE, crowdOf } from './crowd';
import { speedAt } from './difficulty';
import { anchorOf } from './motion';
import type { Pattern } from './patterns';
import { Spawner, type SpawnSituation } from './spawner';

interface Laid {
  pattern: Pattern;
  /** Street distance of the pattern's start (x = 0, the player's x when it starts). */
  street: number;
}

interface Ride {
  laid: Laid[];
  /** Every blocking entity with the street x of its anchor (in pattern street space). */
  blocking: { e: Entity; street: number }[];
  route: ZoneRoute;
  timeAt(distance: number): number;
}

/** Scrolls a spawner like the live game (planning on the game's budget) and logs every pattern it lays. */
function ride(seed: number, seconds: number, situation?: SpawnSituation): Ride {
  const route = new ZoneRoute();
  const laid: Laid[] = [];
  const spawner = new Spawner((street) => route.zoneAt(street), { workPerTick: 400, onSpawn: (pattern, street) => laid.push({ pattern, street }) });
  spawner.reset(new Rng(seed));
  const entities: Entity[] = [];
  const blocking: Ride['blocking'] = [];
  const distances: number[] = [];
  let distance = 0;
  for (let t = 0; t < seconds / TICK_DT; t++) {
    distances.push(distance);
    const dx = speedAt(spawner.rampDistance(distance)) * TICK_DT;
    for (const e of entities) e.x -= dx;
    spawner.scroll(dx);
    distance += dx;
    const before = entities.length;
    spawner.spawn(entities, distance, VIEW_MAX_W, null, situation);
    for (const e of entities.slice(before)) if (isObstacle(e.kind) || isRail(e.kind)) blocking.push({ e, street: anchorOf(e) + distance - PLAYER_X });
    for (let i = entities.length - 1; i >= 0; i--) if (entities[i]!.x + entities[i]!.w < -200) entities.splice(i, 1);
  }
  return {
    laid,
    blocking,
    route,
    timeAt: (d) => {
      const i = distances.findIndex((x) => x >= d);
      return i < 0 ? Infinity : i * TICK_DT;
    },
  };
}

const crowdsOf = (r: Ride) => r.laid.filter((l) => l.pattern.name === CROWD_TEMPLATE);

const ADULT = [1, 2, 3, 4, 5, 6].map((seed) => ride(seed, 330));

describe('fan crowds in the spawner (ROADMAP 76)', { timeout: 180_000 }, () => {
  it(`come only in Bad Cannstatt, never in the first ${CROWD_FIRST_SECONDS} s, at most once per visit`, () => {
    let crowds = 0;
    for (const r of ADULT) {
      const legs = new Set<number>();
      for (const { pattern, street } of crowdsOf(r)) {
        crowds++;
        expect(r.route.zoneAt(street)).toBe(CROWD_ZONE);
        expect(r.route.zoneAt(street + pattern.length)).toBe(CROWD_ZONE);
        expect(r.timeAt(street)).toBeGreaterThanOrEqual(CROWD_FIRST_SECONDS);
        const leg = r.route.legAt(street);
        expect(legs.has(leg), `two crowds in leg ${leg}`).toBe(false);
        legs.add(leg);
      }
    }
    expect(crowds).toBeGreaterThanOrEqual(2);
  });

  it('stand alone in their stretch: nothing else blocks the run-up before the first head or the street after the last', () => {
    for (const r of ADULT) {
      for (const { pattern, street } of crowdsOf(r)) {
        const heads = pattern.pieces.map((p) => street + p.x);
        const fast = speedAt(street + pattern.length);
        const from = Math.min(...heads) - Math.floor(CROWD_LEAD_SECONDS * speedAt(street));
        const to = Math.max(...heads) + 14 + Math.floor(CROWD_ROOM_SECONDS * fast);
        const others = r.blocking.filter((b) => !crowdOf(b.e) && b.street + b.e.w > from && b.street < to);
        expect(others.map((o) => `${o.e.kind} at ${Math.round(o.street)}`), `crowd at ${Math.round(street)}`).toEqual([]);
      }
    }
  });

  it('come in kid mode too, as the smaller row', () => {
    let crowds = 0;
    for (const seed of [1, 2, 3, 4]) {
      for (const { pattern } of crowdsOf(ride(seed, 330, { drunk: false, kidMode: true }))) {
        crowds++;
        expect(pattern.pieces.filter((p) => crowdOf(p)).length).toBe(CROWD_HEADS.kid[0]);
      }
    }
    expect(crowds).toBeGreaterThanOrEqual(1);
  });

  it('never while the player may be drunk', () => {
    for (const seed of [1, 2]) expect(crowdsOf(ride(seed, 330, { drunk: true, kidMode: false }))).toEqual([]);
  });
});
