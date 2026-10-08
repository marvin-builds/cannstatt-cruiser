import { describe, expect, it } from 'vitest';
import { PLAYER_X } from '../core/config';
import type { Entity } from '../types';
import { anchorOf, type Motion, motionOf, motionOffset, moveTo, SWAY_WAVELENGTH, swayOffset, withMotion } from './motion';

const walker: Motion = { walk: 0.1, sway: 0, phase: 0 };
const swayer: Motion = { walk: 0, sway: 3, phase: 1 };

describe('people motion (a pure function of the distance to the player)', () => {
  it('a walker comes towards the player: further right while far away, at rest when level', () => {
    expect(motionOffset(walker, 0)).toBe(0);
    expect(motionOffset(walker, 200)).toBeCloseTo(20, 6);
    // Walks left on the street: the offset shrinks as the gap closes.
    expect(motionOffset(walker, 100)).toBeLessThan(motionOffset(walker, 200));
  });

  it('a swayer rocks back and forth within its amplitude, one cycle per wavelength', () => {
    const offsets = Array.from({ length: 200 }, (_, gap) => motionOffset(swayer, gap));
    expect(Math.max(...offsets)).toBeLessThanOrEqual(3);
    expect(Math.min(...offsets)).toBeGreaterThanOrEqual(-3);
    expect(Math.max(...offsets) - Math.min(...offsets)).toBeGreaterThan(5);
    expect(motionOffset(swayer, 17 + SWAY_WAVELENGTH)).toBeCloseTo(motionOffset(swayer, 17), 6);
  });

  it('stores the motion on an entity and moves its x (and so its collision box) with the anchor', () => {
    const e: Entity = { id: 1, kind: 'vfbFan', x: 0, y: 120, w: 12, h: 26, done: false };
    withMotion(e, walker, PLAYER_X + 300);
    expect(anchorOf(e)).toBe(PLAYER_X + 300);
    expect(motionOf(e)).toEqual(walker);
    expect(e.x).toBeCloseTo(PLAYER_X + 300 + 30, 6);
    moveTo(e, PLAYER_X + 100);
    expect(anchorOf(e)).toBe(PLAYER_X + 100);
    expect(e.x).toBeCloseTo(PLAYER_X + 100 + 10, 6);
  });

  it('leaves entities without motion alone', () => {
    const e: Entity = { id: 2, kind: 'bin', x: 50, y: 120, w: 12, h: 18, done: false };
    expect(motionOf(e)).toBeNull();
    moveTo(e, 40);
    expect(e.x).toBe(40);
  });
});

describe('swayOffset (drawing)', () => {
  it('is the sway part of motionOffset, 0 without a motion', () => {
    const m = { walk: 0.1, sway: 2.5, phase: 1.2 };
    const e = { data: { ...m, ax: 100 } };
    for (const gap of [0, 13, 40, 77]) expect(swayOffset(e, gap)).toBeCloseTo(motionOffset({ ...m, walk: 0 }, gap), 12);
    expect(swayOffset({ data: { variant: 1 } }, 20)).toBe(0);
  });
});
