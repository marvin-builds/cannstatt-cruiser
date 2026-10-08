import { describe, expect, it } from 'vitest';
import { measureText } from '../core/font';
import type { Rect } from '../types';
import { POPUP_LIFETIME, PopupPool, popupHeight, type Popup } from './popups';

/** The box a popup covers: its text (1 px outline round it) centred on x. */
const box = (p: Popup): Rect => {
  const w = measureText(p.text, p.scale) + 2;
  return { x: p.x - w / 2, y: p.y - 1, w, h: 8 * p.scale + 2 };
};
const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** Asserts no two live popups share a row: each lies wholly above or below the other. */
function expectApart(live: readonly Popup[]): void {
  const rows = [...live].sort((a, b) => a.y - b.y);
  for (let i = 1; i < rows.length; i++) expect(rows[i]!.y - rows[i - 1]!.y).toBeGreaterThanOrEqual(popupHeight(rows[i - 1]!.scale));
}


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

  it('moves a merged repeat to the newest (bottom) slot and restarts its rise from the new spot', () => {
    const pool = new PopupPool(3);
    pool.ceiling = 20;
    pool.spawn('Achtung, der Ball!', 64, 100, '#f00');
    pool.update(0.2);
    pool.spawn('Treffer!', 64, 100, '#fff');
    pool.update(0.2);
    pool.spawn('Achtung, der Ball!', 64, 110, '#f00');
    const find = (t: string) => pool.active().find((p) => p.text === t)!;
    expect(find('Achtung, der Ball! x2').y).toBeGreaterThan(find('Treffer!').y);
    expect(find('Achtung, der Ball! x2').y).toBe(110);
    expectApart(pool.active());
    pool.update(0.2);
    expect(find('Achtung, der Ball! x2').y).toBeLessThan(110);
    expect(find('Achtung, der Ball! x2').y).toBeGreaterThan(find('Treffer!').y);
  });

  it('starts counting again once the merged popup is gone', () => {
    const pool = new PopupPool(4);
    pool.spawn('Stern!', 50, 100, '#ff0');
    pool.update(POPUP_LIFETIME + 0.01);
    pool.spawn('Stern!', 50, 100, '#ff0');
    expect(pool.active().map((p) => p.text)).toEqual(['Stern!']);
  });

  it('drops the oldest popups that the ceiling would push below the floor, so the column never piles up', () => {
    const pool = new PopupPool(3);
    pool.ceiling = 100;
    pool.floor = 100 + 2 * popupHeight(2);
    pool.spawn('Stern!', 50, 120, '#fff', 2);
    pool.spawn('Grind!', 50, 120, '#fff', 2);
    pool.spawn('+50', 50, 120, '#fff', 2);
    const live = pool.active();
    expect(live.map((p) => p.text).sort()).toEqual(['+50', 'Grind!']);
    for (const p of live) expect(p.y + popupHeight(p.scale)).toBeLessThanOrEqual(pool.floor);
    expectApart(live);
  });

  it('keeps the newest popup even when nothing fits under the floor', () => {
    const pool = new PopupPool(3);
    pool.ceiling = 100;
    pool.floor = 105;
    pool.spawn('a', 50, 120, '#fff');
    pool.spawn('b', 50, 120, '#fff');
    expect(pool.active().map((p) => p.text)).toEqual(['b']);
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

  it('a popup spawned while another rises never runs into it ("Wurf!" then "Achtung, der Ball!")', () => {
    const pool = new PopupPool(3);
    pool.ceiling = 40;
    pool.spawn('Wurf!', 64, 100, '#fff');
    for (let i = 0; i < 18; i++) pool.update(1 / 60);
    pool.spawn('Achtung, der Ball!', 64, 100, '#f00');
    for (let i = 0; i < 60; i++) {
      expectApart(pool.active());
      pool.update(1 / 60);
    }
  });

  it('stacks the newest popup at the bottom, older ones above it', () => {
    const pool = new PopupPool(3);
    pool.ceiling = 20;
    pool.spawn('a', 64, 100, '#fff');
    pool.update(0.2);
    pool.spawn('b', 64, 100, '#fff');
    pool.update(0.2);
    pool.spawn('c', 64, 100, '#fff');
    const y = (t: string) => pool.active().find((p) => p.text === t)!.y;
    expect(y('a')).toBeLessThan(y('b'));
    expect(y('b')).toBeLessThan(y('c'));
  });

  it('three big portrait popups at once stay apart and below the HUD for their whole life', () => {
    const pool = new PopupPool(3);
    pool.ceiling = 56;
    for (const t of ['Wurf!', 'Achtung, der Ball!', '+150']) {
      pool.spawn(t, 64, 80, '#fff', 2);
      pool.update(0.1);
    }
    expect(pool.active()).toHaveLength(3);
    for (let i = 0; i < 60; i++) {
      expectApart(pool.active());
      for (const p of pool.active()) expect(p.y).toBeGreaterThanOrEqual(56);
      pool.update(1 / 60);
    }
  });

  it('mixed scales keep the gap of the popup above', () => {
    const pool = new PopupPool(3);
    pool.spawn('Ball geschnappt!', 64, 100, '#fff', 2);
    pool.spawn('+50', 64, 100, '#fff', 1);
    for (let i = 0; i < 50; i++) {
      expectApart(pool.active());
      pool.update(1 / 60);
    }
  });

  it('clear() removes everything', () => {
    const pool = new PopupPool(2);
    pool.spawn('a', 0, 0, '#fff');
    pool.clear();
    expect(pool.active().length).toBe(0);
  });

  describe('keeps clear of the skater (avoid)', () => {
    const skater: Rect = { x: 50, y: 116, w: 30, h: 34 };

    it('a popup spawned above the head stays where it is', () => {
      const pool = new PopupPool(3);
      pool.avoid = [skater];
      pool.spawn('Air-Trick! +150', 64, skater.y - 20, '#fff', 2);
      const [p] = pool.active();
      expect(p!.x).toBe(64);
      expect(overlaps(box(p!), skater)).toBe(false);
    });

    it('a popup that would cover the skater (pushed down by the ceiling) moves beside him, in every phase', () => {
      const high: Rect = { x: 50, y: 40, w: 30, h: 34 };
      const pool = new PopupPool(3);
      pool.ceiling = 45;
      pool.avoid = [high];
      pool.spawn('Air-Trick! +150', 64, high.y - 20, '#fff', 2);
      pool.spawn('Grind!', 64, high.y - 20, '#fff', 2);
      for (let t = 0; t < 8; t++) {
        for (const p of pool.active()) {
          expect(overlaps(box(p), high)).toBe(false);
          expect(box(p).x).toBeGreaterThanOrEqual(high.x + high.w);
        }
        pool.update(POPUP_LIFETIME / 10);
      }
    });

    it('several boxes (the portrait item button left of the skater): right of every box it would cover', () => {
      const button: Rect = { x: 2, y: 47, w: 46, h: 46 };
      const pool = new PopupPool(3);
      pool.avoid = [button, skater];
      pool.spawn('High Five! +100', 64, 85, '#fff', 2);
      const [p] = pool.active();
      expect(overlaps(box(p!), button)).toBe(false);
      expect(overlaps(box(p!), skater)).toBe(false);
      expect(box(p!).x).toBeGreaterThanOrEqual(button.x + button.w);
    });

    it('once moved aside a popup stays there, also when the skater moves away again', () => {
      const pool = new PopupPool(3);
      const jumping: Rect = { ...skater, y: 80 };
      pool.avoid = [jumping];
      pool.spawn('Stern!', 64, 90, '#fff', 2);
      const aside = pool.active()[0]!.x;
      expect(aside).toBeGreaterThan(64);
      jumping.y = 116;
      pool.update(0.05);
      expect(pool.active()[0]!.x).toBe(aside);
    });

    it('without a box to avoid nothing moves aside', () => {
      const pool = new PopupPool(3);
      pool.spawn('Grind!', 64, 120, '#fff', 2);
      expect(pool.active()[0]!.x).toBe(64);
    });
  });
});
