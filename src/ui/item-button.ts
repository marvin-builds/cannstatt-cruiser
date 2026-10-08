/**
 * Using the carried item (state.carriedItem) from the UI: on touch a big item
 * button under the HUD buttons (top right, above the street), on desktop a
 * small chip right of the stats plate with the item and an "E" key cap
 * (clickable too). Both call ctx.commands.useItem(). On touch, the first
 * catch ever shows the hint "Tippe auf den Gegenstand" next to the button.
 */
import type { GameMode } from '../core/modes';
import type { Store } from '../core/storage';
import type { CarriedItem, Rect } from '../types';
import { rightAnchor, riding, uiMetrics } from './layout';

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

/** Touch button size (view px): ~80 CSS px in landscape (2 CSS px per view px), 48 in portrait (~1). */
const BUTTON_LANDSCAPE = 40;
const BUTTON_PORTRAIT = 48;
/** Gap between the HUD button row and the item button. */
const BELOW_HUD = 4;

/** Tap area (and plate) of the touch item button: right-anchored under the HUD buttons. */
export function itemButtonRect(viewWidth: number, display: { touch: boolean; portrait: boolean }): Rect {
  const m = uiMetrics(display);
  const size = display.portrait ? BUTTON_PORTRAIT : BUTTON_LANDSCAPE;
  return { x: rightAnchor(viewWidth, size, m.margin), y: m.margin + m.hit + BELOW_HUD, w: size, h: size };
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
