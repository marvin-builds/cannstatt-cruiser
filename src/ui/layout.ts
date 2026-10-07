import type { Rect } from '../types';

/** Size and spacing of the round HUD buttons (view pixels). */
export const BUTTON_SIZE = 14;
const BUTTON_GAP = 3;
const EDGE = 4;

/** View pixels per metre for the distance readout (the skater is ~30 px, ~1.8 m tall). */
const PX_PER_METRE = 10;
/** Seconds of one on/off blink cycle of prompts. */
const BLINK_PERIOD = 1;

/** Left x of something `w` wide, `margin` away from the right edge of the view. */
export function rightAnchor(viewWidth: number, w: number, margin: number): number {
  return viewWidth - margin - w;
}

export function centreX(viewWidth: number): number {
  return Math.floor(viewWidth / 2);
}

export interface HudButtons {
  pause: Rect;
  mute: Rect;
  /** null where the browser has no Fullscreen API (iPhone Safari). */
  fullscreen: Rect | null;
}

/** Button row in the top-right corner, right to left: pause, mute, fullscreen. */
export function hudButtons(viewWidth: number, fullscreenAvailable: boolean): HudButtons {
  const slot = (i: number): Rect => ({
    x: rightAnchor(viewWidth, BUTTON_SIZE, EDGE + i * (BUTTON_SIZE + BUTTON_GAP)),
    y: EDGE,
    w: BUTTON_SIZE,
    h: BUTTON_SIZE,
  });
  return { pause: slot(0), mute: slot(1), fullscreen: fullscreenAvailable ? slot(2) : null };
}

/** Whole number with German thousands dots: 1234567 -> "1.234.567". */
export function formatNumber(n: number): string {
  return String(Math.max(0, Math.floor(n))).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

export function metres(distance: number): number {
  return Math.floor(distance / PX_PER_METRE);
}

/** On for the first ~60% of every blink period. */
export function blinkOn(seconds: number): boolean {
  return seconds % BLINK_PERIOD < BLINK_PERIOD * 0.6;
}
