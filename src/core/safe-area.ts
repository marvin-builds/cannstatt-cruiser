/**
 * The screen's safe area (ROADMAP 75): a punch-hole camera or rounded corner
 * reaches into the page under `viewport-fit=cover`. Core measures the CSS
 * insets with a hidden probe element and hands them to the systems in view
 * pixels (`display.safeInsets`), so edge UI can move inward while the world
 * stays full-bleed.
 */
import type { SafeInsets } from '../types';
import type { Layout } from './scaling';

export type SafeSide = keyof SafeInsets;

const SIDES: readonly SafeSide[] = ['top', 'right', 'bottom', 'left'];

export const NO_INSETS: SafeInsets = { top: 0, right: 0, bottom: 0, left: 0 };

/**
 * A screen edge's safe-area inset as CSS. The custom property `--cc-safe-<side>` on the root
 * element overrides it, so playtests can fake a cutout (Chromium cannot fake env() itself).
 */
export const safeAreaCss = (side: SafeSide): string => `var(--cc-safe-${side}, env(safe-area-inset-${side}, 0px))`;

/**
 * CSS-px insets of a `windowWidth` x `windowHeight` window as view pixels of `layout`: the part
 * of each inset that reaches past the letterbox onto the canvas, rounded up to whole view pixels.
 */
export function insetsInView(css: SafeInsets, layout: Layout, windowWidth: number, windowHeight: number): SafeInsets {
  const cssPerViewPixel = layout.cssHeight / layout.viewHeight;
  const margin: SafeInsets = {
    top: layout.offsetY,
    left: layout.offsetX,
    bottom: windowHeight - layout.offsetY - layout.cssHeight,
    right: windowWidth - layout.offsetX - layout.cssWidth,
  };
  const toView = (side: SafeSide) => Math.max(0, Math.ceil((css[side] - margin[side]) / cssPerViewPixel));
  return { top: toView('top'), right: toView('right'), bottom: toView('bottom'), left: toView('left') };
}

/** A hidden element whose padding is the safe-area insets; `read()` returns them in CSS px. */
export function createSafeAreaProbe(): { read(): SafeInsets } {
  const probe = document.createElement('div');
  Object.assign(probe.style, { position: 'fixed', top: '0', left: '0', visibility: 'hidden', pointerEvents: 'none' });
  for (const side of SIDES) probe.style.setProperty(`padding-${side}`, safeAreaCss(side));
  document.body.appendChild(probe);
  return {
    read() {
      const style = getComputedStyle(probe);
      const px = (side: SafeSide) => parseFloat(style.getPropertyValue(`padding-${side}`)) || 0;
      return { top: px('top'), right: px('right'), bottom: px('bottom'), left: px('left') };
    },
  };
}
