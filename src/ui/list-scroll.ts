/**
 * Drag and wheel scrolling of the "Bestenliste" (DOM only). Core hotspots
 * report presses but no pointer moves, so this listens on the window itself
 * while `active()` says the list shows; it never prevents anything (core
 * already blocks the page's own scrolling).
 */
import { VIEW_H } from '../core/config';

export interface ListScrollTarget {
  active(): boolean;
  /** Scrolls by `dy` view px (positive = further down the list). */
  scrollBy(dy: number): void;
  /** One wheel line in view px. */
  lineHeight(): number;
}

/** Wheel deltaMode values (WheelEvent.DOM_DELTA_LINE / _PAGE). */
const DELTA_LINE = 1;
const DELTA_PAGE = 2;
const PAGE_LINES = 8;

export function bindListScroll(target: ListScrollTarget, canvas: () => HTMLElement | null): void {
  let pointer: number | null = null;
  let lastY = 0;
  const cssPerViewPx = () => (canvas()?.getBoundingClientRect().height ?? VIEW_H) / VIEW_H;
  window.addEventListener('pointerdown', (e) => {
    if (!target.active()) return;
    pointer = e.pointerId;
    lastY = e.clientY;
  });
  window.addEventListener('pointermove', (e) => {
    if (e.pointerId !== pointer) return;
    if (!target.active()) {
      pointer = null;
      return;
    }
    target.scrollBy((lastY - e.clientY) / cssPerViewPx());
    lastY = e.clientY;
  });
  const end = (e: PointerEvent) => {
    if (e.pointerId === pointer) pointer = null;
  };
  window.addEventListener('pointerup', end);
  window.addEventListener('pointercancel', end);
  window.addEventListener(
    'wheel',
    (e) => {
      if (!target.active()) return;
      const unit = e.deltaMode === DELTA_LINE ? target.lineHeight() : e.deltaMode === DELTA_PAGE ? PAGE_LINES * target.lineHeight() : 1 / cssPerViewPx();
      target.scrollBy(e.deltaY * unit);
    },
    { passive: true },
  );
}
