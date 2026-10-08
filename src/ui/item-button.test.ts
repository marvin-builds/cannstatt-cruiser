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
  popupCeiling,
} from './item-button';
import { PopupPool } from './popups';
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
