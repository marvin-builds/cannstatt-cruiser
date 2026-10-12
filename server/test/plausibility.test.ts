import { describe, expect, it } from 'vitest';
import { isPlausible, MAX_SPEED_M_PER_S } from '../src/plausibility';

/** Best recorded playtest run: 28507 points over 4069 m (about five minutes). */
const realTopRun = { score: 28507, distance: 4069, duration: 300 };

describe('isPlausible', () => {
  it('derives the top speed from the game (190 px/s at 10 px per metre)', () => {
    expect(MAX_SPEED_M_PER_S).toBe(19);
  });

  it('accepts a real top run and a short early crash', () => {
    expect(isPlausible(realTopRun)).toBe(true);
    expect(isPlausible({ score: 0, distance: 12, duration: 2 })).toBe(true);
    expect(isPlausible({ score: 1200, distance: 40, duration: 5 })).toBe(true);
  });

  it('accepts a top run that also takes every star and star arc at multiplier 5 (ROADMAP 65)', () => {
    // Measured over 5 min of the spawner: about 350 stars in 65 arcs per 4000 m.
    const everyStar = (350 * 10 + 65 * 50) * 5;
    expect(isPlausible({ ...realTopRun, score: realTopRun.score + everyStar })).toBe(true);
  });

  it('accepts a skilled run that keeps x5 through short street touches (combo grace, ROADMAP 84)', () => {
    // One 150-point obstacle at x5 every 8-10 m is about 75-95 points per metre, plus every star.
    expect(isPlausible({ score: 100_000, distance: 1000, duration: 70 })).toBe(true);
  });

  it('accepts a run at full speed with a 10 % margin, not beyond', () => {
    expect(isPlausible({ score: 0, distance: Math.floor(100 * 19 * 1.1), duration: 100 })).toBe(true);
    expect(isPlausible({ score: 0, distance: Math.ceil(100 * 19 * 1.1) + 20, duration: 100 })).toBe(false);
  });

  it('rejects inflated scores for the distance or the time', () => {
    expect(isPlausible({ ...realTopRun, score: 1_000_000 })).toBe(false);
    expect(isPlausible({ score: 50_000, distance: 100, duration: 20 })).toBe(false);
  });

  it('rejects zero duration and absurd values', () => {
    expect(isPlausible({ score: 0, distance: 0, duration: 0 })).toBe(false);
    expect(isPlausible({ score: 0, distance: 0, duration: 999_999 })).toBe(false);
    expect(isPlausible({ score: 1e12, distance: 1e9, duration: 1e8 })).toBe(false);
  });
});
