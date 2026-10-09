import { describe, expect, it } from 'vitest';
import { GROUND_Y, PLAYER_X, VIEW_H } from '../core/config';
import { createStore, type Store } from '../core/storage';
import type { Entity, Rect } from '../types';
import { KEY_E } from './hint-plate';
import {
  HIGH_FIVE_HINT_AHEAD,
  HIGH_FIVE_REACH,
  HIGH_FIVE_TOUCH_LABEL,
  HighFiveHint,
  HIGH_FIVE_HINT_SHOWS,
  handShown,
  highFiveHand,
  highFiveHintPlate,
} from './high-five';
import { HIGH_FIVE_APPROACH } from '../gameplay/high-five';
import { itemButtonRect, itemHintPlace } from './item-button';
import { POPUP_MARGIN } from './layout';

function memoryStore(): Store {
  const raw = new Map<string, string>();
  return createStore({
    getItem: (k: string) => raw.get(k) ?? null,
    setItem: (k: string, v: string) => void raw.set(k, v),
  } as unknown as Storage);
}

const W = 12;
/** A high-fiver whose hand (its middle) is `ahead` px right of the skater's feet. */
const fiver = (ahead: number, id = 1): Entity => ({
  id,
  kind: 'highFiver',
  x: PLAYER_X + ahead - W / 2,
  y: GROUND_Y - 30,
  w: W,
  h: 30,
  done: false,
});

const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

describe('high five hand (gameplay window)', () => {
  it("is pressable in gameplay's window: within reach on both sides and in the approach just before", () => {
    expect(highFiveHand([fiver(0)])).toBe('press');
    expect(highFiveHand([fiver(HIGH_FIVE_REACH)])).toBe('press');
    expect(highFiveHand([fiver(-HIGH_FIVE_REACH)])).toBe('press');
    expect(highFiveHand([fiver(HIGH_FIVE_APPROACH)])).toBe('press');
    expect(highFiveHand([fiver(-HIGH_FIVE_REACH - 2)])).toBeNull();
  });

  it('shows (not yet pressable) from the hint distance on', () => {
    expect(highFiveHand([fiver(HIGH_FIVE_APPROACH + 2)])).toBe('show');
    expect(highFiveHand([fiver(HIGH_FIVE_HINT_AHEAD)])).toBe('show');
    expect(highFiveHand([fiver(HIGH_FIVE_HINT_AHEAD + 2)])).toBeNull();
  });

  it('the hand shows on touch from the hint distance on, on the desktop chip (E) only in the window', () => {
    expect(handShown('show', true)).toBe(true);
    expect(handShown('press', true)).toBe(true);
    expect(handShown('show', false)).toBe(false);
    expect(handShown('press', false)).toBe(true);
    expect(handShown(null, true)).toBe(false);
  });

  it('stays pressable after the high five (gameplay keeps those presses off the item) and ignores everything else', () => {
    expect(highFiveHand([{ ...fiver(0), data: { slapped: 100 } }])).toBe('press');
    expect(highFiveHand([])).toBeNull();
    expect(highFiveHand([{ ...fiver(0), kind: 'kicker' }])).toBeNull();
  });
});

describe('high five hint', () => {
  it('shows the first time a high-fiver approaches, until it has passed', () => {
    const hint = new HighFiveHint(memoryStore());
    hint.update([fiver(HIGH_FIVE_HINT_AHEAD + 10)]);
    expect(hint.visible).toBe(false);
    hint.update([fiver(HIGH_FIVE_HINT_AHEAD)]);
    expect(hint.visible).toBe(true);
    hint.update([fiver(0)]);
    expect(hint.visible).toBe(true);
    hint.update([fiver(-HIGH_FIVE_REACH - 2)]);
    expect(hint.visible).toBe(false);
  });

  it(`repeats for the next high-fiver until ${HIGH_FIVE_HINT_SHOWS} appearances (persisted)`, () => {
    const store = memoryStore();
    let hint = new HighFiveHint(store);
    for (let i = 1; i <= HIGH_FIVE_HINT_SHOWS; i++) {
      hint.runStarted();
      hint.update([fiver(50, i)]);
      expect(hint.visible, `appearance ${i}`).toBe(true);
      hint.update([]);
      hint = new HighFiveHint(store); // counted across reloads
    }
    hint.update([fiver(50, 99)]);
    expect(hint.visible).toBe(false);
  });

  it('a real high five ends it for good (persisted); a missed one does not', () => {
    const store = memoryStore();
    const hint = new HighFiveHint(store);
    hint.update([fiver(50, 1)]);
    hint.update([fiver(-HIGH_FIVE_REACH - 2, 1)]); // passed without a high five
    hint.update([fiver(50, 2)]);
    expect(hint.visible).toBe(true);
    hint.highFived();
    expect(new HighFiveHint(store).visible).toBe(false);
    const reloaded = new HighFiveHint(store);
    reloaded.update([fiver(50, 3)]);
    expect(reloaded.visible).toBe(false);
  });

  it('goes away on the high five and when a run starts', () => {
    const hint = new HighFiveHint(memoryStore());
    hint.update([fiver(10)]);
    hint.highFived();
    expect(hint.visible).toBe(false);
    hint.update([fiver(5)]);
    expect(hint.visible).toBe(false);
    const other = new HighFiveHint(memoryStore());
    other.update([fiver(10)]);
    other.runStarted();
    expect(other.visible).toBe(false);
  });

  it('keyboard: an E key cap and "= High Five!" at the hint spot under the skater', () => {
    for (const viewWidth of [320, 427]) {
      const p = highFiveHintPlate({ touch: false, portrait: false, viewWidth });
      expect(p.kind).toBe('spot');
      if (p.kind !== 'spot') continue;
      expect(p.rows).toEqual([[KEY_E, '= High Five!']]);
      expect(p.rect.y).toBeGreaterThan(GROUND_Y);
      expect(p.rect.y + p.rect.h).toBeLessThanOrEqual(VIEW_H);
      expect(p.rect.x).toBeGreaterThanOrEqual(POPUP_MARGIN);
    }
  });

  it('touch: "Knopf: High Five!" beside the item button, pointing at it', () => {
    for (const portrait of [false, true]) {
      for (const viewWidth of [320, 427]) {
        const display = { touch: true, portrait, viewWidth };
        const p = highFiveHintPlate(display);
        expect(p.kind).toBe('button');
        if (p.kind !== 'button') continue;
        expect(p.label).toBe(HIGH_FIVE_TOUCH_LABEL);
        expect(HIGH_FIVE_TOUCH_LABEL).toBe('Knopf: High Five!');
        const button = itemButtonRect(viewWidth, display);
        expect(overlaps(p.rect, button)).toBe(false);
        expect(p.rect).toMatchObject(itemHintPlace(button, p.rect.w, p.rect.h, viewWidth));
        expect(p.rect.x).toBeGreaterThanOrEqual(0);
        expect(p.rect.x + p.rect.w).toBeLessThanOrEqual(viewWidth);
      }
    }
  });
});
