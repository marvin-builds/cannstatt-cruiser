import { describe, expect, it } from 'vitest';
import { POPUP_LIFETIME, PopupPool } from './popups';

describe('PopupPool', () => {
  it('shows a popup until its lifetime runs out', () => {
    const pool = new PopupPool(4);
    pool.spawn('+50', 10, 100, '#fff');
    expect(pool.active().length).toBe(1);
    pool.update(POPUP_LIFETIME - 0.01);
    expect(pool.active().length).toBe(1);
    pool.update(0.02);
    expect(pool.active().length).toBe(0);
  });

  it('rises over its lifetime and reports a fading age (0..1)', () => {
    const pool = new PopupPool(4);
    pool.spawn('Grind!', 10, 100, '#fff');
    pool.update(POPUP_LIFETIME / 2);
    const [p] = pool.active();
    expect(p!.y).toBeLessThan(100);
    expect(Number.isInteger(p!.y)).toBe(true);
    expect(p!.age).toBeCloseTo(0.5, 5);
  });

  it('reuses the oldest slot when full instead of growing', () => {
    const pool = new PopupPool(2);
    pool.spawn('a', 0, 0, '#fff');
    pool.update(0.1);
    pool.spawn('b', 0, 0, '#fff');
    pool.spawn('c', 0, 0, '#fff');
    expect(pool.active().map((p) => p.text).sort()).toEqual(['b', 'c']);
  });

  it('stacks popups spawned at the same spot so they do not overlap', () => {
    const pool = new PopupPool(4);
    pool.spawn('+10', 50, 100, '#fff');
    pool.spawn('Stern!', 50, 100, '#fff');
    const [a, b] = pool.active();
    expect(Math.abs(a!.y - b!.y)).toBeGreaterThanOrEqual(9);
  });

  it('clear() removes everything', () => {
    const pool = new PopupPool(2);
    pool.spawn('a', 0, 0, '#fff');
    pool.clear();
    expect(pool.active().length).toBe(0);
  });
});
