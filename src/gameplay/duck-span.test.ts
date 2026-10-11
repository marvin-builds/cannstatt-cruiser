import { describe, expect, it } from 'vitest';
import { BASE_SPEED, TICK_DT } from '../core/config';
import { SWIPE_DUCK_TICKS } from '../core/input';
import type { ObstacleKind } from '../types';
import { obstacleRect } from './catalogue';
import { TOP_SPEED } from './difficulty';
import { DUCK_REPEAT_SECONDS, duckGroups, longestOneGo, MAX_ONE_GO_SIGNS, MIN_STAND_UP_SECONDS, ONE_GO_DUCK_SECONDS, SWIPE_DUCK_SECONDS, touchDuckable } from './duck-span';
import type { Piece } from './course';

const piece = (kind: ObstacleKind, x: number): Piece => ({ kind, ...obstacleRect(kind, Math.round(x)) });

/** Overheads (and ground obstacles) laid one after the other: each entry is the street gap in seconds at `speed` before it. */
function street(speed: number, steps: [ObstacleKind, number][]): Piece[] {
  const out: Piece[] = [];
  let end = 0;
  for (const [kind, gap] of steps) {
    const p = piece(kind, end + gap * speed);
    out.push(p);
    end = p.x + p.w;
  }
  return out;
}

describe('touch duck limit (ROADMAP 66)', () => {
  it('a swipe duck lasts SWIPE_DUCK_TICKS; one go is about 1 s with margin below it', () => {
    expect(SWIPE_DUCK_SECONDS).toBeCloseTo(SWIPE_DUCK_TICKS * TICK_DT, 9);
    expect(ONE_GO_DUCK_SECONDS).toBeLessThanOrEqual(SWIPE_DUCK_SECONDS - 0.15);
    expect(ONE_GO_DUCK_SECONDS).toBeGreaterThanOrEqual(0.9);
  });

  it('the next duck group starts >= the swipe duck plus a stand-up after the previous one (no jump between)', () => {
    expect(DUCK_REPEAT_SECONDS).toBeGreaterThanOrEqual(SWIPE_DUCK_SECONDS + 0.25);
    // The least free street between two groups: what is left after the longest one-go group.
    expect(MIN_STAND_UP_SECONDS).toBeCloseTo(DUCK_REPEAT_SECONDS - ONE_GO_DUCK_SECONDS, 9);
    expect(MIN_STAND_UP_SECONDS).toBeGreaterThanOrEqual(0.45);
  });

  for (const speed of [BASE_SPEED, 140, TOP_SPEED]) {
    it(`rejects the reported chain: a sign and 3 more close behind (0.15-0.5 s apart) at ${speed} px/s`, () => {
      for (const gap of [0.15, 0.3, 0.5]) {
        const chain = street(speed, [
          ['banner', 1],
          ['stopSign', gap],
          ['banner', gap],
          ['stopSign', gap],
        ]);
        expect(touchDuckable(chain, [speed]), `gap ${gap}`).toBe(false);
        expect(longestOneGo(chain, speed)).toBeGreaterThan(ONE_GO_DUCK_SECONDS);
      }
    });

    it(`a lone sign is one short duck at ${speed} px/s`, () => {
      for (const kind of ['banner', 'stopSign'] as const) {
        const one = [piece(kind, 50)];
        expect(duckGroups(one, speed)).toHaveLength(1);
        expect(longestOneGo(one, speed)).toBeLessThan(0.75);
        expect(touchDuckable(one, [speed])).toBe(true);
      }
    });
  }

  it('measures one go from entering the first sign to leaving the last, plus the duck transition', () => {
    // Two stop signs (box 14 px wide, 2 px into the sprite) 40 px apart at 100 px/s.
    const a = piece('stopSign', 100);
    const b = piece('stopSign', a.x + a.w + 40);
    const [group] = duckGroups([a, b], 100);
    // Feet range where a standing hitbox (10 px) overlaps a box grown by the solver's 1 px safety.
    expect(group!.from).toBe(a.x + 2 - 1 - 5);
    expect(group!.to).toBe(b.x + 2 + 14 + 1 + 5);
    expect(group!.signs).toBe(2);
    expect(longestOneGo([a, b], 100)).toBeCloseTo((group!.to - group!.from) / 100 + 0.06, 9);
  });

  it('two signs ducked in one go at top speed take too long at the start speed (no room to swipe twice either)', () => {
    const pair = street(TOP_SPEED, [
      ['banner', 1],
      ['banner', 0.3],
    ]);
    expect(touchDuckable(pair, [TOP_SPEED])).toBe(true);
    expect(touchDuckable(pair, [BASE_SPEED])).toBe(false);
  });

  it(`never more than ${MAX_ONE_GO_SIGNS} signs in one go, even when they would fit in time`, () => {
    const three = street(TOP_SPEED, [
      ['stopSign', 1],
      ['stopSign', 0.12],
      ['stopSign', 0.12],
    ]);
    expect(longestOneGo(three, TOP_SPEED)).toBeLessThanOrEqual(ONE_GO_DUCK_SECONDS);
    expect(touchDuckable(three, [TOP_SPEED])).toBe(false);
    expect(touchDuckable(three.slice(0, MAX_ONE_GO_SIGNS), [TOP_SPEED])).toBe(true);
  });

  it('a sign that comes before the swipe ran out and after one go is unfair: no room to stand up and swipe again', () => {
    for (const speed of [BASE_SPEED, TOP_SPEED]) {
      // Entries 1.2 s apart: the first swipe ends right under the second sign.
      const a = piece('stopSign', 50);
      const b = piece('stopSign', a.x + 1.2 * speed);
      expect(touchDuckable([a, b], [speed]), `${speed}`).toBe(false);
      // DUCK_REPEAT_SECONDS apart: two separate ducks.
      const c = piece('stopSign', a.x + DUCK_REPEAT_SECONDS * speed);
      expect(duckGroups([a, c], speed)).toHaveLength(2);
      expect(touchDuckable([a, c], [speed]), `${speed}`).toBe(true);
    }
  });

  it('a jump between two signs ends the duck: a ground obstacle between them splits the groups', () => {
    const speed = 140;
    const s = street(speed, [
      ['stopSign', 1],
      ['bin', 0.5],
      ['stopSign', 0.55],
    ]);
    expect(duckGroups(s, speed)).toHaveLength(2);
    expect(touchDuckable(s, [speed])).toBe(true);
  });

  it('checks every speed given and only the groups that reach `from` and beyond (the previous pattern was checked before)', () => {
    const chain = street(BASE_SPEED, [
      ['banner', 0],
      ['banner', 0.3],
      ['banner', 0.3],
    ]).map((p) => ({ ...p, x: p.x - 1000 }));
    expect(touchDuckable(chain, [TOP_SPEED, BASE_SPEED])).toBe(false);
    expect(touchDuckable(chain, [TOP_SPEED, BASE_SPEED], 0)).toBe(true);
    expect(touchDuckable([...chain, piece('banner', 0)], [BASE_SPEED], 0)).toBe(true);
  });
});
