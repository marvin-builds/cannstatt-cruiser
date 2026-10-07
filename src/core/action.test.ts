import { describe, expect, it } from 'vitest';
import { ActionButton } from './action';

const DT = 1 / 60;

describe('ActionButton', () => {
  it('reports pressed only on the first tick after a press', () => {
    const b = new ActionButton();
    b.press('key');
    const first = b.tick(DT);
    expect(first).toMatchObject({ pressed: true, held: true, released: false });
    const second = b.tick(DT);
    expect(second).toMatchObject({ pressed: false, held: true, released: false });
  });

  it('accumulates hold duration while held and resets on a new press', () => {
    const b = new ActionButton();
    b.press('key');
    b.tick(DT);
    b.tick(DT);
    expect(b.tick(DT).holdTime).toBeCloseTo(3 * DT, 6);
    b.release('key');
    const rel = b.tick(DT);
    expect(rel).toMatchObject({ pressed: false, held: false, released: true });
    expect(rel.holdTime).toBeCloseTo(3 * DT, 6);
    b.press('key');
    expect(b.tick(DT).holdTime).toBeCloseTo(DT, 6);
  });

  it('keeps a press and release that happen between two ticks', () => {
    const b = new ActionButton();
    b.press('touch:1');
    b.release('touch:1');
    expect(b.tick(DT)).toMatchObject({ pressed: true, held: false, released: true });
    expect(b.tick(DT)).toMatchObject({ pressed: false, held: false, released: false });
  });

  it('treats several sources as one button', () => {
    const b = new ActionButton();
    b.press('key');
    b.press('mouse');
    expect(b.tick(DT).pressed).toBe(true);
    b.release('key');
    expect(b.tick(DT)).toMatchObject({ held: true, released: false });
    b.release('mouse');
    expect(b.tick(DT)).toMatchObject({ held: false, released: true });
  });

  it('ignores key repeat of a source that is already down', () => {
    const b = new ActionButton();
    b.press('key');
    b.tick(DT);
    b.press('key');
    expect(b.tick(DT).pressed).toBe(false);
  });

  it('releases everything on reset', () => {
    const b = new ActionButton();
    b.press('key');
    b.tick(DT);
    b.releaseAll();
    expect(b.tick(DT)).toMatchObject({ held: false, released: true });
  });
});
