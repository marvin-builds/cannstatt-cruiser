import { describe, expect, it } from 'vitest';
import { BASE_SPEED, MAX_SPEED, PLAYER_X, TICK_DT } from '../core/config';
import { Rng } from '../core/rng';
import { tick } from '../player/testing';
import { CHILL_JUMP_SCALE } from '../player/tuning';
import type { EntityKind } from '../types';
import { isPerson, OBSTACLES } from './catalogue';
import { CHILL_SPEED_SCALE } from './chill';
import { anchorOf, type Motion, motionOf, motionOffset } from './motion';
import { courseOf, planPattern } from './patterns';
import { constantPace, Solver } from './solver';
import { obstacle, playBot, quietGame, record } from './test-kit';

const fanWalk: Motion = { walk: 0.12, sway: 0, phase: 0 };
const tipsy: Motion = { walk: 0.02, sway: 3, phase: 2 };

describe('people obstacles', () => {
  it("are people, about the skater's scale, low enough to jump", () => {
    for (const kind of ['vfbFan', 'wasenGuest'] as const) {
      expect(isPerson(kind)).toBe(true);
      expect(OBSTACLES[kind].h).toBeGreaterThanOrEqual(24);
      expect(OBSTACLES[kind].box.h).toBeLessThanOrEqual(22);
    }
    expect(isPerson('bin')).toBe(false);
  });

  it('move with their motion while the street scrolls, and the collision follows them', () => {
    const game = quietGame(120);
    const fan = obstacle(game, 'vfbFan', PLAYER_X + 300, fanWalk);
    tick(game, 30);
    const anchor = PLAYER_X + 300 - 120 * 30 * TICK_DT;
    expect(anchorOf(fan)).toBeCloseTo(anchor, 6);
    expect(fan.x).toBeCloseTo(anchor + motionOffset(fanWalk, anchor - PLAYER_X), 6);
  });

  it('a crash is a friendly bump: crash event, the person reacts', () => {
    const game = quietGame();
    const crashes = record(game, 'crash');
    const guest = obstacle(game, 'wasenGuest', PLAYER_X + 40, tipsy);
    tick(game, 60);
    expect(crashes).toEqual([expect.objectContaining({ entityId: guest.id, kind: 'wasenGuest' })]);
    expect(guest.data?.hit).toBe(true);
  });

  for (const speed of [BASE_SPEED, MAX_SPEED]) {
    it(`the bot jumps a walking fan and a swaying Wasen visitor at ${speed} px/s`, () => {
      const game = quietGame(speed);
      const crashes = record(game, 'crash');
      const clears = record(game, 'obstacleCleared');
      obstacle(game, 'vfbFan', PLAYER_X + 140, fanWalk);
      obstacle(game, 'wasenGuest', PLAYER_X + 330, tipsy);
      playBot(game, 400);
      expect(crashes).toEqual([]);
      expect(clears.map((c) => c.kind)).toEqual(['vfbFan', 'wasenGuest']);
    });
  }

  it('the solver models the motion: a person is clearable with the chilled jump at chill speed', () => {
    for (const kind of ['vfbFan', 'wasenGuest'] as const) {
      for (const motion of [fanWalk, tipsy]) {
        const pattern = { name: 't', pieces: [{ kind, x: 80, y: 150 - OBSTACLES[kind].h, w: OBSTACLES[kind].w, h: OBSTACLES[kind].h, data: { ...motion, ax: 80 } }], length: 200 };
        const course = courseOf(pattern);
        expect(course.movers).toHaveLength(1);
        for (const v of [BASE_SPEED * CHILL_SPEED_SCALE, MAX_SPEED]) {
          expect(new Solver(course, constantPace(v, CHILL_JUMP_SCALE)).solvable(), `${kind} ${v}`).toBe(true);
        }
      }
    }
  });
});

describe('zone-themed people in the patterns', () => {
  function kindsIn(zone: number): string[] {
    const rng = new Rng(21);
    return Array.from({ length: 300 }, () => planPattern(rng, 3, [120], { zone })).flatMap((p) => p.pieces.map((x): EntityKind => x.kind));
  }

  it('VfB fans walk at the Neckar (zone 1), Wasen visitors sway in Bad Cannstatt (zone 2), nobody in Mitte', () => {
    expect(kindsIn(0).some((k) => isPerson(k as EntityKind))).toBe(false);
    const neckar = kindsIn(1);
    expect(neckar).toContain('vfbFan');
    expect(neckar).not.toContain('wasenGuest');
    const cannstatt = kindsIn(2);
    expect(cannstatt).toContain('wasenGuest');
    expect(cannstatt).not.toContain('vfbFan');
  }, 30_000);

  it('people pieces carry a motion within the catalogue ranges', () => {
    const rng = new Rng(5);
    const people = Array.from({ length: 300 }, () => planPattern(rng, 3, [120], { zone: 1 + (rng.next() < 0.5 ? 1 : 0) }))
      .flatMap((p) => p.pieces)
      .filter((p) => isPerson(p.kind));
    expect(people.length).toBeGreaterThan(20);
    for (const p of people) {
      const m = motionOf(p)!;
      const spec = OBSTACLES[p.kind as 'vfbFan' | 'wasenGuest'].motion!;
      expect(m.walk).toBeGreaterThanOrEqual(spec.walk[0]);
      expect(m.walk).toBeLessThanOrEqual(spec.walk[1]);
      expect(m.sway).toBeGreaterThanOrEqual(spec.sway[0]);
      expect(m.sway).toBeLessThanOrEqual(spec.sway[1]);
      expect(anchorOf(p)).toBe(p.x);
    }
  });
});
