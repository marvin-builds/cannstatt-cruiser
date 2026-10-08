import { describe, expect, it } from 'vitest';
import { parseSprite, rowsFromString } from '../core/sprite-data';
import type { CarriedItem } from '../types';
import { B, BODY_W, HEAD_AT } from './art';
import { carriedItemDraw, HOLD_AT, ITEM_ART, ITEM_PALETTE, itemSize } from './carry';
import { isCrashTimeline, TIMELINES, type TimelineName } from './poses';

const ITEMS: CarriedItem[] = ['football', 'pretzel', 'beer', 'gingerbread'];
const names = Object.keys(TIMELINES) as TimelineName[];
const bodiesOf = (name: TimelineName) => TIMELINES[name].steps.map((s) => s.body);

describe('carried item art', () => {
  it.each(ITEMS)('%s is a small sprite with the skater outline', (item) => {
    const { w, h } = itemSize(item);
    expect(w).toBeGreaterThanOrEqual(5);
    expect(w).toBeLessThanOrEqual(9);
    expect(h).toBeGreaterThanOrEqual(5);
    expect(h).toBeLessThanOrEqual(9);
    const parsed = parseSprite(rowsFromString(ITEM_ART[item]), ITEM_PALETTE);
    expect(parsed).toMatchObject({ width: w, height: h });
    expect(ITEM_ART[item]).toContain('k');
  });

  it('rims the gingerbread heart with light icing so it stands out against the red hoodie', () => {
    const rows = rowsFromString(ITEM_ART.gingerbread);
    const icing = rows.join('').split('i').length - 1;
    expect(icing).toBeGreaterThanOrEqual(6);
    // Both upper lobes carry icing next to the outline.
    expect(rows[2]).toMatch(/^ki.*ik$/);
  });

  it('draws the football black-and-white like the ball people toss (gameplay item art)', () => {
    const used = new Set(rowsFromString(ITEM_ART.football).join('').replace(/\./g, ''));
    const colours = [...used].map((ch) => ITEM_PALETTE[ch as keyof typeof ITEM_PALETTE]);
    expect(colours.sort()).toEqual([ITEM_PALETTE.k, '#2a2a2e', '#f4f1ea'].sort());
  });

  it('gives every item its own art', () => {
    expect(new Set(ITEMS.map((i) => ITEM_ART[i])).size).toBe(ITEMS.length);
  });
});

describe('carried item placement', () => {
  it('draws nothing without an item', () => {
    expect(carriedItemDraw(null, 'ride', B.ride, false)).toBeNull();
  });

  it('draws nothing during the crash (gameplay clears the item then)', () => {
    for (const body of bodiesOf('crash')) expect(carriedItemDraw('beer', 'crash', body, false)).toBeNull();
    for (const body of bodiesOf('binCrash')) expect(carriedItemDraw('beer', 'binCrash', body, false)).toBeNull();
  });

  it.each(ITEMS)('carries the %s in every pose but the crash, at the hand of that frame', (item) => {
    for (const name of names.filter((n) => !isCrashTimeline(n))) {
      for (const body of bodiesOf(name)) {
        const d = carriedItemDraw(item, name, body, false);
        const hold = HOLD_AT[body];
        expect(hold, `${name} body ${body}`).toBeTruthy();
        expect(d, `${name} body ${body}`).toMatchObject({ item, grip: hold!.grip, hand: hold!.hand });
        const { w, h } = itemSize(item);
        // The item touches the hand: the hand is inside the item box or right next to it.
        expect(d!.hand.x).toBeGreaterThanOrEqual(d!.x - 1);
        expect(d!.hand.x).toBeLessThanOrEqual(d!.x + w);
        expect(d!.hand.y).toBeGreaterThanOrEqual(d!.y - 1);
        expect(d!.hand.y).toBeLessThanOrEqual(d!.y + h);
        expect(d!.x + w).toBeLessThanOrEqual(BODY_W + 4);
      }
    }
  });

  it('tucks it under the arm on the ground, lets it hang from the outstretched hand and lifts it with the raised arm', () => {
    for (const body of [B.ride, B.pushDown, B.pushBack, B.pushSwing, B.crouch, B.duck]) expect(HOLD_AT[body]!.grip).toBe('side');
    for (const body of [B.airRise, B.landSquash, B.grindA, B.grindB]) expect(HOLD_AT[body]!.grip).toBe('hang');
    expect(HOLD_AT[B.airFall]!.grip).toBe('raise');
  });

  it('a hanging item is below the hand, a raised one above it, a tucked one around it', () => {
    const hang = carriedItemDraw('beer', 'grind', B.grindA, false)!;
    expect(hang.y).toBe(hang.hand.y + 1);
    const raise = carriedItemDraw('beer', 'airFall', B.airFall, false)!;
    expect(raise.y + itemSize('beer').h).toBe(raise.hand.y);
    const side = carriedItemDraw('beer', 'ride', B.ride, false)!;
    expect(side.y).toBeLessThan(side.hand.y);
    expect(side.y + itemSize('beer').h).toBeGreaterThan(side.hand.y);
  });

  it('while catching, holds the item up above the cap in every pose with a face', () => {
    for (const name of names.filter((n) => !isCrashTimeline(n))) {
      for (const body of bodiesOf(name)) {
        const d = carriedItemDraw('football', name, body, true)!;
        expect(d.grip, `${name} body ${body}`).toBe('catch');
        expect(d.y + itemSize('football').h).toBeLessThanOrEqual(HEAD_AT[body]!.y);
      }
    }
  });
});
