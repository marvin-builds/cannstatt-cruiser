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
  highFiveHintPlate,
  highFiveOpen,
} from './high-five';
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

describe('high five window (same rule as gameplay)', () => {
  it('is open while a high-fiver is within reach of the skater, on both sides', () => {
    expect(highFiveOpen([fiver(0)])).toBe(true);
    expect(highFiveOpen([fiver(HIGH_FIVE_REACH)])).toBe(true);
    expect(highFiveOpen([fiver(-HIGH_FIVE_REACH)])).toBe(true);
    expect(highFiveOpen([fiver(HIGH_FIVE_REACH + 2)])).toBe(false);
    expect(highFiveOpen([fiver(-HIGH_FIVE_REACH - 2)])).toBe(false);
  });

  it('stays open after the high five (gameplay keeps those presses off the item) and ignores everything else', () => {
    expect(highFiveOpen([{ ...fiver(0), data: { slapped: 100 } }])).toBe(true);
    expect(highFiveOpen([])).toBe(false);
    expect(highFiveOpen([{ ...fiver(0), kind: 'kicker' }])).toBe(false);
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

  it('shows once ever (persisted): not for the next high-fiver, not after a reload', () => {
    const store = memoryStore();
    const hint = new HighFiveHint(store);
    hint.update([fiver(50)]);
    expect(hint.visible).toBe(true);
    hint.update([]);
    hint.runStarted();
    hint.update([fiver(50, 2)]);
    expect(hint.visible).toBe(false);
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
