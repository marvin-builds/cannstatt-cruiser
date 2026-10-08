import { describe, expect, it } from 'vitest';
import { createStore, type Store } from '../core/storage';
import type { Rect } from '../types';
import { hudButtons, uiMetrics } from './layout';
import { ITEM_HINT_TIME, ItemHint, itemButtonRect, itemControl, keycapChip } from './item-button';

const TOUCH_LANDSCAPE = { touch: true, portrait: false };
const TOUCH_PORTRAIT = { touch: true, portrait: true };
const DESKTOP = { touch: false, portrait: false };

const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

function memoryStore(): Store {
  const raw = new Map<string, string>();
  return createStore({
    getItem: (k: string) => raw.get(k) ?? null,
    setItem: (k: string, v: string) => void raw.set(k, v),
  } as unknown as Storage);
}

describe('item control', () => {
  it('touch: the big button only while carrying during a run', () => {
    expect(itemControl(TOUCH_LANDSCAPE, 'playing', 'beer')).toBe('button');
    expect(itemControl(TOUCH_PORTRAIT, 'playing', 'football')).toBe('button');
    expect(itemControl(TOUCH_LANDSCAPE, 'playing', null)).toBeNull();
    expect(itemControl(TOUCH_LANDSCAPE, 'paused', 'beer')).toBeNull();
    expect(itemControl(TOUCH_LANDSCAPE, 'gameover', 'beer')).toBeNull();
  });

  it('desktop: an E key cap next to the item, also on the pause screen', () => {
    expect(itemControl(DESKTOP, 'playing', 'pretzel')).toBe('keycap');
    expect(itemControl(DESKTOP, 'paused', 'pretzel')).toBe('keycap');
    expect(itemControl(DESKTOP, 'playing', null)).toBeNull();
    expect(itemControl(DESKTOP, 'title', 'pretzel')).toBeNull();
  });

  it('the touch button is >= 44 CSS px and clear of the HUD buttons at every width', () => {
    for (const [display, cssPerViewPx] of [[TOUCH_LANDSCAPE, 2], [TOUCH_PORTRAIT, 1]] as const) {
      const m = uiMetrics(display);
      for (let w = 320; w <= 427; w++) {
        const r = itemButtonRect(w, display);
        expect(r.w * cssPerViewPx).toBeGreaterThanOrEqual(44);
        expect(r.h * cssPerViewPx).toBeGreaterThanOrEqual(44);
        expect(r.x + r.w).toBeLessThanOrEqual(w);
        const b = hudButtons(w, true, m, true);
        for (const hud of [b.pause, b.mute, b.fullscreen!]) expect(overlaps(r, hud)).toBe(false);
        // Above the street: overhead obstacles hang lower than this.
        expect(r.y + r.h).toBeLessThanOrEqual(100);
      }
    }
  });

  it('the desktop chip sits right of the stats plate', () => {
    const plate = { x: 2, y: 2, w: 80, h: 40 };
    const chip = keycapChip(plate);
    expect(chip.x).toBeGreaterThan(plate.x + plate.w);
    expect(chip.y).toBe(plate.y);
  });
});

describe('first-time item hint (touch)', () => {
  it('shows on the first catch only, for a few seconds', () => {
    const store = memoryStore();
    const hint = new ItemHint(store);
    hint.caught(true);
    expect(hint.visible).toBe(true);
    hint.update(ITEM_HINT_TIME + 0.01);
    expect(hint.visible).toBe(false);
    hint.caught(true);
    expect(hint.visible).toBe(false);
    const later = new ItemHint(store);
    later.caught(true);
    expect(later.visible).toBe(false);
  });

  it('never on desktop, and it goes away when the item is used', () => {
    const hint = new ItemHint(memoryStore());
    hint.caught(false);
    expect(hint.visible).toBe(false);
    hint.caught(true);
    expect(hint.visible).toBe(true);
    hint.hide();
    expect(hint.visible).toBe(false);
  });
});
