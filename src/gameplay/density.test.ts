import { describe, expect, it } from 'vitest';
import { BASE_SPEED, MAX_HEALTH, PLAYER_X, TICK_DT, VIEW_MAX_W } from '../core/config';
import { Rng } from '../core/rng';
import { createInitialState } from '../core/state';
import type { Entity, GameState } from '../types';
import { ZoneRoute } from '../world/zones';
import { isObstacle, isRail } from './catalogue';
import { buildCourse } from './course';
import { crowdOf } from './crowd';
import { AdaptiveDensity, DENSE_TIER_FROM, DENSITY_FROM_SECONDS, DENSITY_FULL_SECONDS, denseGap, denseQuiet, denseTier } from './density';
import { TOP_SPEED } from './difficulty';
import { EARLY_TAKEOFF_WINDOW, EARLY_WINDOW_DISTANCE, HUMAN_HOLDS, LATE_TAKEOFF_WINDOW } from './fairness';
import { anchorOf, moveTo } from './motion';
import type { Piece } from './patterns';
import { constantPace, Solver } from './solver';
import { QUIET_SECONDS, Spawner } from './spawner';

/** Runs `seconds` of playing ticks through the density meter. */
function ride(density: AdaptiveDensity, state: GameState, seconds: number): void {
  for (let t = 0; t < Math.round(seconds / TICK_DT); t++) density.update(state, TICK_DT);
}

function fullHealth(kidMode = false): GameState {
  const state = createInitialState();
  state.health = MAX_HEALTH;
  state.kidMode = kidMode;
  return state;
}

describe('adaptive density (ROADMAP 52 point 12)', () => {
  it('stays 0 for the first stretch at full hearts, then rises to 1', () => {
    const density = new AdaptiveDensity();
    const state = fullHealth();
    ride(density, state, DENSITY_FROM_SECONDS - 1);
    expect(density.factor).toBe(0);
    let last = 0;
    for (let s = DENSITY_FROM_SECONDS; s <= DENSITY_FULL_SECONDS + 10; s += 5) {
      ride(density, state, 5);
      expect(density.factor).toBeGreaterThanOrEqual(last);
      last = density.factor;
    }
    expect(last).toBe(1);
  });

  it('is about 45 s of full hearts before it starts, as the brief asks', () => {
    expect(DENSITY_FROM_SECONDS).toBeGreaterThanOrEqual(40);
    expect(DENSITY_FULL_SECONDS).toBeGreaterThan(DENSITY_FROM_SECONDS);
  });

  it('drops back to 0 on a crash, and the full-heart time starts over', () => {
    const density = new AdaptiveDensity();
    const state = fullHealth();
    ride(density, state, DENSITY_FULL_SECONDS);
    expect(density.factor).toBe(1);
    density.crashed();
    expect(density.factor).toBe(0);
    ride(density, state, DENSITY_FROM_SECONDS - 1);
    expect(density.factor).toBe(0);
  });

  it('counts only time at full hearts: a lost heart holds it at 0 until healed', () => {
    const density = new AdaptiveDensity();
    const state = fullHealth();
    state.health = MAX_HEALTH - 1;
    ride(density, state, DENSITY_FULL_SECONDS + 10);
    expect(density.factor).toBe(0);
    state.health = MAX_HEALTH;
    ride(density, state, DENSITY_FROM_SECONDS - 1);
    expect(density.factor).toBe(0);
  });

  it('is never on in kid mode', () => {
    const density = new AdaptiveDensity();
    const state = fullHealth(true);
    ride(density, state, DENSITY_FULL_SECONDS * 3);
    expect(density.factor).toBe(0);
  });

  it('a new run starts at 0', () => {
    const density = new AdaptiveDensity();
    const state = fullHealth();
    ride(density, state, DENSITY_FULL_SECONDS);
    density.reset();
    expect(density.factor).toBe(0);
  });

  it('at 0 the street stays as it was; at 1 the gap and the quiet cap shrink a little and the tier steps up', () => {
    expect(denseGap(200, 0)).toBe(200);
    expect(denseQuiet(QUIET_SECONDS, 0)).toBe(QUIET_SECONDS);
    expect(denseTier(2, 0)).toBe(2);
    expect(denseGap(200, 1)).toBeLessThan(200);
    expect(denseGap(200, 1)).toBeGreaterThanOrEqual(140);
    expect(denseQuiet(QUIET_SECONDS, 1)).toBeLessThan(QUIET_SECONDS);
    expect(denseQuiet(QUIET_SECONDS, 1)).toBeGreaterThanOrEqual(QUIET_SECONDS * 0.8);
    expect(denseTier(1, 1)).toBe(2);
    expect(denseTier(2, 1)).toBe(3);
    // Tier 3 is the top: nothing harder exists.
    expect(denseTier(3, 1)).toBe(3);
    // Tier 0 (the first seconds) never steps up, and the step needs most of the density.
    expect(denseTier(0, 1)).toBe(0);
    expect(denseTier(1, DENSE_TIER_FROM - 0.01)).toBe(1);
  });
});

interface Laid {
  e: Entity;
  street: number;
}

/** Scrolls a spawner like the live system at a pinned speed with a fixed density; every entity with its street x. */
function spawnRide(seed: number, seconds: number, density: number, speed: number): Laid[] {
  const route = new ZoneRoute();
  route.snap(0, 0);
  const spawner = new Spawner((street) => route.zoneAt(street));
  spawner.reset(new Rng(seed));
  const entities: Entity[] = [];
  const seen: Laid[] = [];
  let distance = 0;
  for (let t = 0; t < seconds / TICK_DT; t++) {
    const dx = speed * TICK_DT;
    for (const e of entities) moveTo(e, anchorOf(e) - dx);
    spawner.scroll(dx);
    distance += dx;
    const before = entities.length;
    spawner.spawn(entities, distance, VIEW_MAX_W, speed, { drunk: false, kidMode: false, density });
    for (const e of entities.slice(before)) seen.push({ e, street: anchorOf(e) + distance });
    for (let i = entities.length - 1; i >= 0; i--) if (entities[i]!.x + entities[i]!.w < -40) entities.splice(i, 1);
  }
  return seen;
}

const blocking = (e: Entity) => isObstacle(e.kind) || isRail(e.kind);

/** Street x of every piece to react to, x = 0 being the player at the run start (fan crowds left out: crowd-spawn.test.ts checks them with stomps). */
function streetPieces(laid: Laid[]): Piece[] {
  return laid
    .filter((s) => blocking(s.e) && !crowdOf(s.e))
    .map((s) => ({ ...s.e, x: s.street - PLAYER_X, data: s.e.data && { ...s.e.data, ax: s.street - PLAYER_X } }));
}

describe('adaptive density on the street (spawner rides)', () => {
  it('lays more to react to at full density than at none (same seeds, pinned speed)', () => {
    let calm = 0;
    let dense = 0;
    for (const seed of [1, 2, 3]) {
      calm += streetPieces(spawnRide(seed, 150, 0, 140)).length;
      dense += streetPieces(spawnRide(seed, 150, 1, 140)).length;
    }
    expect(dense).toBeGreaterThan(calm * 1.08);
  }, 120_000);

  for (const speed of [BASE_SPEED, TOP_SPEED]) {
    it(`every take-off at full density keeps the human window (whole street, ${speed} px/s, all pattern boundaries)`, () => {
      for (const seed of [1, 2]) {
        const pieces = streetPieces(spawnRide(seed, 120, 1, speed));
        expect(pieces.length).toBeGreaterThan(40);
        const early = pieces.filter((p) => p.x + p.w < EARLY_WINDOW_DISTANCE);
        expect(new Solver(buildCourse(early, 0, (goal) => goal + 400), constantPace(speed)).fair(HUMAN_HOLDS, EARLY_TAKEOFF_WINDOW), `seed ${seed} early`).toBe(true);
        expect(new Solver(buildCourse(pieces, 0, (goal) => goal + 400), constantPace(speed)).fair(HUMAN_HOLDS, LATE_TAKEOFF_WINDOW), `seed ${seed}`).toBe(true);
      }
    }, 120_000);
  }
});
