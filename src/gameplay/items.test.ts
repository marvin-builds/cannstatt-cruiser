import { describe, expect, it } from 'vitest';
import { Rng } from '../core/rng';
import type { CarriedItem } from '../types';
import { brezelShare, drawProp, HEAL_SHARE, itemOf, LATE_HEAL_SHARE, PROPS } from './items';

const fan = (prop: number) => ({ kind: 'vfbFan' as const, data: { prop } });
const guest = (prop: number) => ({ kind: 'wasenGuest' as const, data: { prop } });

describe('what people carry', () => {
  it('fans carry a football in both modes', () => {
    for (let prop = 0; prop < PROPS; prop++) {
      expect(itemOf(fan(prop), false)).toBe('football');
      expect(itemOf(fan(prop), true)).toBe('football');
    }
  });

  it('Wasen visitors hold a Maßkrug or a Brezel (adult mode)', () => {
    const items = new Set(Array.from({ length: PROPS }, (_, p) => itemOf(guest(p), false)));
    expect(items).toEqual(new Set<CarriedItem>(['beer', 'pretzel']));
  });

  it('kid mode: a Brezel or a Lebkuchenherz, never beer', () => {
    const items = new Set(Array.from({ length: PROPS }, (_, p) => itemOf(guest(p), true)));
    expect(items).toEqual(new Set<CarriedItem>(['gingerbread', 'pretzel']));
  });

  it('a missing prop (placed by hand) falls back to the first one', () => {
    expect(itemOf({ kind: 'wasenGuest' }, false)).toBe('beer');
    expect(itemOf({ kind: 'wasenGuest' }, true)).toBe('gingerbread');
  });
});

describe('scarcer healing late in a run (ROADMAP 52 point 8)', () => {
  /** Share of Wasen visitors (adult mode) whose drawn prop is a Brezel, over many seeded draws. */
  function healingShare(share: number, kidMode = false, draws = 20_000): number {
    const rng = new Rng(7);
    let healing = 0;
    for (let i = 0; i < draws; i++) {
      const item = itemOf(guest(drawProp(rng, share)), kidMode);
      if (item === 'pretzel' || item === 'gingerbread') healing++;
    }
    return healing / draws;
  }

  it('halves the Brezel share once the ramp is through, after ramping down linearly', () => {
    expect(LATE_HEAL_SHARE).toBeCloseTo(HEAL_SHARE / 2);
    expect(brezelShare(0, false)).toBe(HEAL_SHARE);
    expect(brezelShare(0.5, false)).toBeCloseTo((HEAL_SHARE + LATE_HEAL_SHARE) / 2);
    expect(brezelShare(1, false)).toBe(LATE_HEAL_SHARE);
    expect(brezelShare(2, false)).toBe(LATE_HEAL_SHARE);
  });

  it('kid mode keeps the share of today', () => {
    for (const late of [0, 0.5, 1]) expect(brezelShare(late, true)).toBe(HEAL_SHARE);
  });

  it('early in a run the props are drawn exactly as before (one draw, same result as rng.int(0, PROPS - 1))', () => {
    const a = new Rng(3);
    const b = new Rng(3);
    for (let i = 0; i < 1000; i++) expect(drawProp(a, HEAL_SHARE)).toBe(b.int(0, PROPS - 1));
  });

  it('measurably fewer healing items late in adult mode, unchanged in kid mode', () => {
    const early = healingShare(brezelShare(0, false));
    const late = healingShare(brezelShare(1, false));
    expect(early).toBeCloseTo(0.5, 1);
    expect(late).toBeCloseTo(0.25, 1);
    expect(late).toBeLessThan(early * 0.6);
    expect(healingShare(brezelShare(1, true), true)).toBe(1);
  });
});
