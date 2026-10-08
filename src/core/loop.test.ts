import { describe, expect, it } from 'vitest';
import { FixedTimestep } from './loop';
import { Rng } from './rng';

const STEP = 1 / 60;

describe('FixedTimestep', () => {
  it('runs one update per elapsed step and keeps the remainder', () => {
    const loop = new FixedTimestep(STEP);
    let ticks = 0;
    loop.advance(STEP * 2.5, () => ticks++);
    expect(ticks).toBe(2);
    expect(loop.alpha).toBeCloseTo(0.5, 5);
    loop.advance(STEP * 0.5, () => ticks++);
    expect(ticks).toBe(3);
  });

  it('runs nothing when clearly less than one step elapsed (0.9 steps counts as one jittered frame)', () => {
    const loop = new FixedTimestep(STEP);
    let ticks = 0;
    loop.advance(STEP * 0.6, () => ticks++);
    expect(ticks).toBe(0);
  });

  it('clamps huge frame times to avoid a spiral of death', () => {
    const loop = new FixedTimestep(STEP, 0.25);
    let ticks = 0;
    loop.advance(10, () => ticks++);
    expect(ticks).toBe(15);
  });

  it('scales elapsed time with timeScale', () => {
    const loop = new FixedTimestep(STEP);
    loop.timeScale = 2;
    let ticks = 0;
    loop.advance(STEP * 3, () => ticks++);
    expect(ticks).toBe(6);
  });

  it('ignores negative elapsed time', () => {
    const loop = new FixedTimestep(STEP);
    let ticks = 0;
    loop.advance(-1, () => ticks++);
    expect(ticks).toBe(0);
  });
});

/** Real frame timestamps: `interval` ms apart, each shifted by up to +-`jitter` ms (seeded). */
function timestamps(interval: number, jitter: number, frames: number, seed = 1): number[] {
  const rng = new Rng(seed);
  return Array.from({ length: frames }, (_, i) => i * interval + rng.range(-jitter, jitter));
}

/** Updates per rAF frame when the loop is fed the elapsed times between `stamps`. */
function updatesPerFrame(stamps: number[], loop = new FixedTimestep(STEP)): number[] {
  const counts: number[] = [];
  for (let i = 1; i < stamps.length; i++) {
    let n = 0;
    loop.advance((stamps[i]! - stamps[i - 1]!) / 1000, () => n++);
    counts.push(n);
  }
  return counts.slice(30); // the cadence estimate settles within the first frames
}

function longestRun(values: number[], value: number): number {
  let best = 0;
  let run = 0;
  for (const v of values) {
    run = v === value ? run + 1 : 0;
    best = Math.max(best, run);
  }
  return best;
}

describe('FixedTimestep on real display cadences', () => {
  it('runs exactly one update per frame at 60 Hz with +-2 ms timestamp jitter', () => {
    for (const seed of [1, 2, 3]) {
      const counts = updatesPerFrame(timestamps(1000 / 60, 2, 3000, seed));
      const single = counts.filter((n) => n === 1).length / counts.length;
      expect(single, `seed ${seed}`).toBeGreaterThanOrEqual(0.99);
    }
  });

  it('runs exactly one update per frame on a slightly slow 59.94 Hz display', () => {
    const counts = updatesPerFrame(timestamps(1000 / 59.94, 0.3, 6000));
    expect(counts.every((n) => n === 1)).toBe(true);
  });

  it('alternates cleanly at 120 Hz: never two updates, never long gaps', () => {
    const counts = updatesPerFrame(timestamps(1000 / 120, 1, 3000));
    expect(Math.max(...counts)).toBe(1);
    expect(longestRun(counts, 0)).toBeLessThanOrEqual(2);
    expect(counts.filter((n) => n === 1).length / counts.length).toBeCloseTo(0.5, 2);
  });

  it('spreads updates evenly at 144 Hz', () => {
    const counts = updatesPerFrame(timestamps(1000 / 144, 0.5, 3000));
    expect(Math.max(...counts)).toBe(1);
    expect(longestRun(counts, 0)).toBeLessThanOrEqual(2);
  });

  it('catches up after a missed vsync with the right number of updates', () => {
    const stamps = timestamps(1000 / 60, 0.5, 100);
    for (let i = 60; i < stamps.length; i++) stamps[i]! += 1000 / 60; // frame 60 arrives one vsync late
    const counts = updatesPerFrame(stamps);
    expect(counts.reduce((a, b) => a + b, 0)).toBe(counts.length + 1);
    expect(counts.filter((n) => n === 2)).toHaveLength(1);
  });

  it('reports the number of updates it ran', () => {
    const loop = new FixedTimestep(STEP);
    expect(loop.advance(STEP * 2, () => {})).toBe(2);
  });
});
