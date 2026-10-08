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

  it('merges a repeat of a live popup into one counted popup', () => {
    const pool = new PopupPool(4);
    pool.spawn('Stern!', 50, 100, '#ff0');
    pool.update(0.2);
    pool.spawn('Stern!', 50, 100, '#ff0');
    pool.spawn('Stern!', 50, 100, '#ff0');
    const live = pool.active();
    expect(live.map((p) => p.text)).toEqual(['Stern! x3']);
    expect(live[0]!.age).toBe(0);
  });

  it('starts counting again once the merged popup is gone', () => {
    const pool = new PopupPool(4);
    pool.spawn('Stern!', 50, 100, '#ff0');
    pool.update(POPUP_LIFETIME + 0.01);
    pool.spawn('Stern!', 50, 100, '#ff0');
    expect(pool.active().map((p) => p.text)).toEqual(['Stern!']);
  });

  it('never lets a popup rise above the ceiling, even when stacked', () => {
    const pool = new PopupPool(3);
    pool.ceiling = 60;
    for (const t of ['a', 'b', 'c']) pool.spawn(t, 64, 62, '#fff');
    const ys = () => pool.active().map((p) => p.y);
    for (let i = 0; i < 60; i++) {
      for (const y of ys()) expect(y).toBeGreaterThanOrEqual(60);
      pool.update(1 / 60);
    }
  });

  it('keeps stacked popups apart when the ceiling pushes them down', () => {
    const pool = new PopupPool(3);
    pool.ceiling = 60;
    for (const t of ['a', 'b', 'c']) pool.spawn(t, 64, 62, '#fff');
    const ys = pool.active().map((p) => p.y).sort((a, b) => a - b);
    expect(ys[1]! - ys[0]!).toBeGreaterThanOrEqual(9);
    expect(ys[2]! - ys[1]!).toBeGreaterThanOrEqual(9);
  });

  it('stacks big (scale 2) popups twice as far apart', () => {
    const pool = new PopupPool(3);
    for (const t of ['a', 'b', 'c']) pool.spawn(t, 50, 120, '#fff', 2);
    const ys = pool.active().map((p) => p.y).sort((a, b) => a - b);
    expect(ys[1]! - ys[0]!).toBeGreaterThanOrEqual(18);
    expect(ys[2]! - ys[1]!).toBeGreaterThanOrEqual(18);
  });

  it('keeps the text scale of each popup', () => {
    const pool = new PopupPool(2);
    pool.spawn('Prost!', 50, 100, '#ff0', 2);
    pool.spawn('+50', 50, 140, '#fff');
    expect(pool.active().map((p) => p.scale)).toEqual([2, 1]);
  });

  it('keeps a popup icon', () => {
    const pool = new PopupPool(2);
    pool.spawn('Lecker! +1', 50, 100, '#f8b', 1, 'heart');
    pool.spawn('+50', 50, 140, '#fff');
    expect(pool.active().map((p) => p.icon)).toEqual(['heart', null]);
  });

  it('clear() removes everything', () => {
    const pool = new PopupPool(2);
    pool.spawn('a', 0, 0, '#fff');
    pool.clear();
    expect(pool.active().length).toBe(0);
  });
});
