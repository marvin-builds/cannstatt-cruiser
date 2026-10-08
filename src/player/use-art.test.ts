import { describe, expect, it } from 'vitest';
import { parseSprite } from '../core/sprite-data';
import type { CarriedItem, ItemAction } from '../types';
import { BODY_FRAMES, FACE_AT } from './art';
import { ITEM_PALETTE } from './carry';
import { isCrashTimeline, TIMELINES, type TimelineName } from './poses';
import { ITEM_USE_TIME, itemUseFrame } from './use';
import { armLine, flailArm, TOSSED_MUG, USE_ITEM_ART, useDraw } from './use-art';

const names = (Object.keys(TIMELINES) as TimelineName[]).filter((n) => !isCrashTimeline(n));
const USES: [CarriedItem, ItemAction][] = [
  ['beer', 'drink'],
  ['pretzel', 'eat'],
  ['gingerbread', 'eat'],
  ['football', 'throw'],
];

describe('item use overlay geometry', () => {
  it('has valid item sprites in the item palette', () => {
    for (const [, art] of USE_ITEM_ART) expect(() => parseSprite(art, ITEM_PALETTE)).not.toThrow();
    for (const art of TOSSED_MUG) expect(() => parseSprite(art, ITEM_PALETTE)).not.toThrow();
  });

  it.each(USES)('%s (%s) plays in every pose but the crash, with the item at the lips', (item, action) => {
    for (const name of names) {
      for (const step of TIMELINES[name].steps) {
        for (let t = 0; t < ITEM_USE_TIME[action]; t += 1 / 30) {
          const frame = itemUseFrame(action, t)!;
          const d = useDraw(item, frame, name, step.body);
          expect(d, `${name} body ${step.body}`).not.toBeNull();
          if (!d!.sprite) continue;
          expect(USE_ITEM_ART.has(d!.sprite)).toBe(true);
          if (frame.arm === 'drink' || frame.arm === 'tip' || frame.arm === 'bite') {
            const { mouth } = FACE_AT[step.body]!;
            expect(d!.x).toBe(mouth.x + 1);
            const h = USE_ITEM_ART.get(d!.sprite)!.length;
            expect(d!.y).toBeLessThanOrEqual(mouth.y);
            expect(d!.y + h).toBeGreaterThan(mouth.y);
          }
        }
      }
    }
  });

  it('draws nothing in the crash', () => {
    const frame = itemUseFrame('drink', 0.3)!;
    for (const step of TIMELINES.crash.steps) expect(useDraw('beer', frame, 'crash', step.body)).toBeNull();
  });

  it('the football never shows in the hand (gameplay draws the thrown ball)', () => {
    for (let t = 0; t < ITEM_USE_TIME.throw; t += 1 / 60) expect(useDraw('football', itemUseFrame('throw', t)!, 'ride', 0)!.sprite).toBeNull();
  });

  it('eating drops crumbs below the mouth', () => {
    const bite = [0.1, 0.15, 0.2, 0.3].map((t) => useDraw('pretzel', itemUseFrame('eat', t)!, 'grind', TIMELINES.grind.steps[0]!.body)!);
    const crumbs = bite.flatMap((d) => d.crumbs);
    expect(crumbs.length).toBeGreaterThan(0);
    const { mouth } = FACE_AT[TIMELINES.grind.steps[0]!.body]!;
    for (const c of crumbs) expect(c.y).toBeGreaterThan(mouth.y);
  });

  it('the bitten looks get smaller', () => {
    const px = (s: 'pretzel-full' | 'pretzel-bitten' | 'pretzel-crumb') => USE_ITEM_ART.get(s)!.join('').replace(/\./g, '').length;
    expect(px('pretzel-bitten')).toBeLessThan(px('pretzel-full'));
    expect(px('pretzel-crumb')).toBeLessThan(px('pretzel-bitten'));
  });

  it('arm lines are connected and end at the hand', () => {
    const line = armLine({ x: 3, y: 10 }, { x: 9, y: 2 });
    expect(line[0]).toEqual({ x: 3, y: 10 });
    expect(line.at(-1)).toEqual({ x: 9, y: 2 });
    for (let i = 1; i < line.length; i++) {
      expect(Math.abs(line[i]!.x - line[i - 1]!.x)).toBeLessThanOrEqual(1);
      expect(Math.abs(line[i]!.y - line[i - 1]!.y)).toBeLessThanOrEqual(1);
    }
  });

  it('the drunk flail throws the hand up above the shoulder in every pose with a face', () => {
    BODY_FRAMES.forEach((_, body) => {
      if (!FACE_AT[body]) return;
      const arm = flailArm(body, true);
      if (!arm) return;
      expect(arm.hand.y).toBeLessThan(arm.shoulder.y);
    });
  });
});
