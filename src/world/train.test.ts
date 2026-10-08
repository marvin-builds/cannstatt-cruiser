import { describe, expect, it } from 'vitest';
import { Rng } from '../core/rng';
import { TrainRunner } from './train';

const OPTS = { width: 100, speed: 60, interval: [5, 10] as const, firstDelay: 0.5 };

describe('TrainRunner', () => {
  it('stays away while disabled', () => {
    const train = new TrainRunner(new Rng(1), OPTS);
    train.restart();
    for (let i = 0; i < 600; i++) train.update(1 / 60, 0, 320, false);
    expect(train.screenX(0)).toBeNull();
  });

  it('enters from the right edge after the first delay and drives left', () => {
    const train = new TrainRunner(new Rng(1), OPTS);
    train.restart();
    for (let i = 0; i < 29; i++) train.update(1 / 60, 0, 360, true);
    expect(train.screenX(0)).toBeNull();
    train.update(1 / 60, 0, 360, true);
    const x0 = train.screenX(0)!;
    expect(x0).toBeGreaterThanOrEqual(360);
    train.update(1, 0, 360, true);
    expect(train.screenX(0)).toBe(x0 - 60);
  });

  it('leaves once off the left edge and returns within the interval', () => {
    const train = new TrainRunner(new Rng(2), OPTS);
    train.restart();
    let t = 0;
    let gone = -1;
    let back = -1;
    while (t < 60 && back < 0) {
      train.update(0.1, 0, 320, true);
      t += 0.1;
      const x = train.screenX(0);
      if (x === null && gone < 0 && t > 1) gone = t;
      if (x !== null && gone >= 0) back = t;
    }
    expect(gone).toBeGreaterThan(0);
    expect(back - gone).toBeGreaterThanOrEqual(5 - 0.11);
    expect(back - gone).toBeLessThanOrEqual(10 + 0.11);
  });

  it('positions relative to the layer scroll', () => {
    const train = new TrainRunner(new Rng(1), OPTS);
    train.restart();
    train.update(0.6, 500, 320, true);
    expect(train.screenX(500)).toBe(train.screenX(400)! - 100);
  });

  it('extrapolates its own drive for a frame drawn between ticks', () => {
    const train = new TrainRunner(new Rng(1), OPTS);
    train.restart();
    train.update(0.6, 0, 320, true);
    expect(train.screenX(0, 0.5)).toBe(train.screenX(0)! - 30);
  });
});
