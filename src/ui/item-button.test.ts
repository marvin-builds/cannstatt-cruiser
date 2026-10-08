import { describe, expect, it } from 'vitest';
import { createStore, type Store } from '../core/storage';
import type { Rect } from '../types';
import { buttonPlate, hudButtons, popupScale, uiMetrics } from './layout';
import { GROUND_Y, PLAYER_X } from '../core/config';
import {
  ITEM_HINT_TIME,
  ItemHint,
  itemButtonRect,
  itemControl,
  itemHintPlace,
  itemHintRect,
  keycapChip,
  popupAvoid,
  popupCeiling,
} from './item-button';
import { measureText } from '../core/font';
import { POPUP_LIFETIME, popupHeight, PopupPool } from './popups';
import { SKATER_CLEAR } from './menu-layout';
import { statsLayout } from './stats';

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

  it('during a high five window it shows even with empty hands; outside it only while carrying', () => {
    expect(itemControl(TOUCH_LANDSCAPE, 'playing', null, true)).toBe('button');
    expect(itemControl(TOUCH_PORTRAIT, 'playing', null, true)).toBe('button');
    expect(itemControl(TOUCH_LANDSCAPE, 'playing', 'beer', true)).toBe('button');
    expect(itemControl(DESKTOP, 'playing', null, true)).toBe('keycap');
    expect(itemControl(TOUCH_LANDSCAPE, 'playing', null, false)).toBeNull();
    expect(itemControl(TOUCH_LANDSCAPE, 'paused', null, true)).toBeNull();
    expect(itemControl(DESKTOP, 'gameover', null, true)).toBeNull();
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
        if (!display.portrait) expect(r.y + r.h).toBeLessThanOrEqual(100);
      }
    }
  });

  it('portrait: under the tallest stats plate on the left, so it never hides the stars coming in from the right', () => {
    const tallest = statsLayout(200, true, true).plate;
    for (const w of [320, 360, 384, 390, 427]) {
      const r = itemButtonRect(w, TOUCH_PORTRAIT);
      expect(r.x).toBe(tallest.x);
      expect(r.y).toBeGreaterThan(tallest.y + tallest.h);
      // Behind the skater: stars and obstacles ahead of it stay visible.
      expect(r.x + r.w).toBeLessThanOrEqual(SKATER_CLEAR.x);
      expect(r.y + r.h).toBeLessThanOrEqual(SKATER_CLEAR.y);
    }
  });

  it('landscape: the button plate keeps the edge margin of the HUD plates and never overlaps a HUD button', () => {
    for (const display of [TOUCH_LANDSCAPE]) {
      const m = uiMetrics(display);
      for (const w of [320, 384, 427]) {
        const r = itemButtonRect(w, display);
        for (const withPause of [true, false]) {
          const b = hudButtons(w, true, m, withPause);
          const hud = [b.pause, b.mute, b.fullscreen!];
          const plateRight = Math.max(...hud.map((h) => buttonPlate(h, m)).map((p) => p.x + p.w));
          if (withPause) expect(r.x + r.w).toBe(plateRight);
          for (const h of hud) expect(overlaps(r, h)).toBe(false);
        }
        expect(w - (r.x + r.w)).toBeGreaterThanOrEqual(4);
      }
    }
  });

  it('the first-time hint sits beside the button, pointing at it, inside the view', () => {
    for (const display of [TOUCH_LANDSCAPE, TOUCH_PORTRAIT]) {
      for (const w of [320, 384, 427]) {
        const b = itemButtonRect(w, display);
        const p = itemHintPlace(b, 180, 20, w);
        expect(p.x).toBeGreaterThanOrEqual(0);
        expect(p.x + 180).toBeLessThanOrEqual(w);
        expect(overlaps({ x: p.x, y: p.y, w: 180, h: 20 }, b)).toBe(false);
        if (p.pointsRight) expect(p.x + 180).toBeLessThanOrEqual(b.x);
        else expect(p.x).toBeGreaterThanOrEqual(b.x + b.w);
        expect(p.y + 10).toBe(b.y + b.h / 2);
      }
    }
    expect(itemHintPlace(itemButtonRect(384, TOUCH_LANDSCAPE), 180, 20, 384).pointsRight).toBe(true);
    expect(itemHintPlace(itemButtonRect(384, TOUCH_PORTRAIT), 180, 20, 384).pointsRight).toBe(false);
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

  it('waits while the zone banner shows, so it never covers it, and keeps its full time for afterwards', () => {
    const hint = new ItemHint(memoryStore());
    hint.caught(true);
    hint.update(1, true);
    expect(hint.visible).toBe(false);
    hint.update(0.5, true);
    expect(hint.visible).toBe(false);
    hint.update(ITEM_HINT_TIME - 0.1, false);
    expect(hint.visible).toBe(true);
    hint.update(0.05, true);
    expect(hint.visible).toBe(false);
    hint.update(0.2, false);
    expect(hint.visible).toBe(false);
  });

  it('keeps the popups over the skater below the hint while it shows, so neither hides the other', () => {
    const base = 54;
    expect(popupCeiling(base, null)).toBe(base);
    for (const portrait of [true, false]) {
      const display = { touch: true, portrait };
      for (const viewWidth of [320, 384, 427]) {
        const at = `${portrait ? 'portrait' : 'landscape'} ${viewWidth}`;
        const hint = itemHintRect(viewWidth, display, popupScale(display, false));
        expect(hint.x, at).toBeGreaterThanOrEqual(0);
        expect(hint.x + hint.w, at).toBeLessThanOrEqual(viewWidth);
        const pool = new PopupPool(4);
        pool.ceiling = popupCeiling(base, hint);
        for (const text of ['Autsch!', '+50']) pool.spawn(text, PLAYER_X, GROUND_Y - 28 - 44, '#fff', popupScale(display, false));
        for (const p of pool.active()) expect(p.y, `${at}: ${p.text}`).toBeGreaterThanOrEqual(hint.y + hint.h);
      }
    }
  });
});

describe('popups keep clear of the item button (popupAvoid)', () => {
  const skater: Rect = { x: PLAYER_X - 14, y: GROUND_Y - 34, w: 30, h: 34 };
  const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

  it('lists the skater alone without the touch button, else both left to right', () => {
    const portrait = { touch: true, portrait: true };
    expect(popupAvoid(320, portrait, null, skater, [])).toEqual([skater]);
    expect(popupAvoid(320, portrait, 'keycap', skater, [])).toEqual([skater]);
    const both = popupAvoid(320, portrait, 'button', skater, []);
    expect(both).toEqual([itemButtonRect(320, portrait), skater]);
    const landscape = { touch: true, portrait: false };
    expect(popupAvoid(427, landscape, 'button', skater, [])).toEqual([skater, itemButtonRect(427, landscape)]);
  });

  it('phone portrait: "High Five! +100" over the skater never covers the hand button, at any height or width', () => {
    const display = { touch: true, portrait: true };
    const scale = popupScale(display, false);
    for (const viewWidth of [320, 390, 427]) {
      const button = itemButtonRect(viewWidth, display);
      for (let y = button.y - popupHeight(scale); y <= button.y + button.h; y += 4) {
        const pool = new PopupPool(3);
        pool.avoid = popupAvoid(viewWidth, display, 'button', skater, []);
        pool.spawn('High Five! +100', PLAYER_X, y, '#fff', scale);
        for (let t = 0; t < 10; t++) {
          const p = pool.active()[0]!;
          const w = measureText(p.text, p.scale) + 2;
          const box = { x: p.x - w / 2, y: p.y - 1, w, h: 8 * p.scale + 2 };
          expect(overlaps(box, button)).toBe(false);
          expect(overlaps(box, skater)).toBe(false);
          pool.update(POPUP_LIFETIME / 12);
        }
      }
    }
  });
});
