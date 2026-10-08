import { describe, expect, it } from 'vitest';
import type { CarriedItem } from '../types';
import { itemOf, PROPS } from './items';

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
