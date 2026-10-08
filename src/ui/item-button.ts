/**
 * Using the carried item (state.carriedItem) from the UI: on touch a big item
 * button (landscape: under the HUD buttons, top right, above the street;
 * portrait: under the stats plate, behind the skater), on desktop a
 * small chip right of the stats plate with the item and an "E" key cap
 * (clickable too). Both call ctx.commands.useItem(). On touch, the first
 * catch ever shows the hint "Tippe auf den Gegenstand" next to the button.
 */
import type { GameMode } from '../core/modes';
import type { Store } from '../core/storage';
import type { CarriedItem, Rect } from '../types';
import { measureText } from '../core/font';
import { rightAnchor, riding, uiMetrics } from './layout';
import { statsLayout } from './stats';

export type ItemControl = 'button' | 'keycap';

/** Which item control shows: the touch button only while playing, the desktop chip during a run. */
export function itemControl(
  display: { touch: boolean },
  mode: GameMode,
  carried: CarriedItem | null,
): ItemControl | null {
  if (!carried) return null;
  if (display.touch) return mode === 'playing' ? 'button' : null;
  return riding(mode) ? 'keycap' : null;
}

/** Touch button size (view px): ~80 CSS px in landscape (2 CSS px per view px), 46 in portrait (~1). */
const BUTTON_LANDSCAPE = 40;
const BUTTON_PORTRAIT = 46;
/** Gap between the HUD button row (landscape) or the stats plate (portrait) and the item button. */
const BELOW = 4;
/** The stats plate at its tallest (both timer rows), so the portrait button never moves. */
const TALLEST_PLATE = statsLayout(0, true, true).plate;

/**
 * Tap area (and plate) of the touch item button. Landscape: under the HUD
 * buttons, its right edge in line with their visible plates. Portrait: up
 * there it would hide the stars flying in from the right, so it sits under
 * the stats plate on the left, behind the skater, where nothing is to come.
 */
export function itemButtonRect(viewWidth: number, display: { touch: boolean; portrait: boolean }): Rect {
  if (display.portrait) {
    const y = TALLEST_PLATE.y + TALLEST_PLATE.h + BELOW;
    return { x: TALLEST_PLATE.x, y, w: BUTTON_PORTRAIT, h: BUTTON_PORTRAIT };
  }
  const m = uiMetrics(display);
  const edge = m.margin + Math.floor((m.hit - m.plate) / 2);
  return { x: rightAnchor(viewWidth, BUTTON_LANDSCAPE, edge), y: m.margin + m.hit + BELOW, w: BUTTON_LANDSCAPE, h: BUTTON_LANDSCAPE };
}

/** Space between the first-time hint and the item button (its pointer sits in it). */
const HINT_GAP = 6;

/**
 * Top-left of the first-time hint (`w` x `h`) beside the item button,
 * vertically centred on it: left of it when there is room (landscape, the
 * pointer points right), else right of it; kept inside the view.
 */
export function itemHintPlace(button: Rect, w: number, h: number, viewWidth: number): { x: number; y: number; pointsRight: boolean } {
  const y = button.y + Math.floor((button.h - h) / 2);
  const left = button.x - HINT_GAP - w;
  if (left >= 0) return { x: left, y, pointsRight: true };
  return { x: Math.min(button.x + button.w + HINT_GAP, viewWidth - w), y, pointsRight: false };
}

/** The first-time hint's label. */
export const ITEM_HINT_LABEL = 'Tippe auf den Gegenstand';

/** Where the first-time hint (label at font `scale`, on its plate) sits beside the touch item button. */
export function itemHintRect(
  viewWidth: number,
  display: { touch: boolean; portrait: boolean },
  scale: number,
): Rect & { pointsRight: boolean } {
  const w = measureText(ITEM_HINT_LABEL, scale) + 8;
  const h = 8 * scale + 6;
  return { ...itemHintPlace(itemButtonRect(viewWidth, display), w, h, viewWidth), w, h };
}

/** Gap between the hint and the popups pushed below it. */
const POPUP_BELOW_HINT = 2;

/**
 * Top limit for the popups over the skater: `base`, or below the visible
 * `hint` (in portrait both sit at the left, so they would cover each other).
 */
export function popupCeiling(base: number, hint: Rect | null): number {
  return hint ? Math.max(base, hint.y + hint.h + POPUP_BELOW_HINT) : base;
}

/** Desktop chip: item icon + "E" key cap, as tall as a HUD button. */
export const CHIP_W = 26;
export const CHIP_H = 14;
const CHIP_GAP = 3;

/** The desktop chip right next to the stats plate, top-aligned with it. */
export function keycapChip(plate: Rect): Rect {
  return { x: plate.x + plate.w + CHIP_GAP, y: plate.y, w: CHIP_W, h: CHIP_H };
}

/** Seconds the first-time touch hint stays. */
export const ITEM_HINT_TIME = 3.5;
const HINT_KEY = 'itemHintSeen';

/**
 * "Tippe auf den Gegenstand": once ever, on the first catch on a touch device.
 * It waits (hidden, its time standing still) while the zone banner shows, so
 * it never covers the banner.
 */
export class ItemHint {
  private timer = 0;
  private waiting = false;

  constructor(private readonly store: Store) {}

  get visible(): boolean {
    return this.timer > 0 && !this.waiting;
  }

  caught(touch: boolean): void {
    if (!touch || this.store.get(HINT_KEY, false)) return;
    this.store.set(HINT_KEY, true);
    this.timer = ITEM_HINT_TIME;
  }

  hide(): void {
    this.timer = 0;
  }

  /** Counts down, unless `bannerVisible`: then it waits. */
  update(dt: number, bannerVisible = false): void {
    this.waiting = bannerVisible;
    if (!bannerVisible) this.timer = Math.max(0, this.timer - dt);
  }
}
