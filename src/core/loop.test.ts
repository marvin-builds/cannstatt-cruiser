import { describe, expect, it } from 'vitest';
import { FixedTimestep } from './loop';

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

  it('runs nothing when less than one step elapsed', () => {
    const loop = new FixedTimestep(STEP);
    let ticks = 0;
    loop.advance(STEP * 0.9, () => ticks++);
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
