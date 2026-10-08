import { describe, expect, it } from 'vitest';
import type { CarriedItem } from '../types';
import { catchPopup } from './item-look';

const ITEMS: CarriedItem[] = ['football', 'pretzel', 'beer', 'gingerbread'];

describe('catch popups', () => {
  it('adult mode: Ball geschnappt!, Brezel!, Prost!, Lebkuchenherz!', () => {
    expect(ITEMS.map((i) => catchPopup(i, false).text)).toEqual(['Ball geschnappt!', 'Brezel!', 'Prost!', 'Lebkuchenherz!']);
  });

  it('kid mode never says Prost! or mentions beer', () => {
    for (const item of ITEMS) {
      const { text } = catchPopup(item, true);
      expect(text).not.toMatch(/prost|bier|maß/i);
    }
    expect(catchPopup('gingerbread', true).text).toBe('Lebkuchenherz!');
    expect(catchPopup('pretzel', true).text).toBe('Brezel!');
    expect(catchPopup('football', true).text).toBe('Ball geschnappt!');
  });

  it('every popup has a colour', () => {
    for (const item of ITEMS) for (const kid of [false, true]) expect(catchPopup(item, kid).color).toMatch(/^#/);
  });
});
