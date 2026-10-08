import type { GameMode } from '../core/modes';
import type { Rect } from '../types';

/**
 * Pointer button sizes (view pixels) for the device. Phones get bigger
 * buttons and tap areas of at least ~44 CSS px: in landscape a view pixel is
 * ~2 CSS px, in portrait ~1 (see "View size" in docs/ARCHITECTURE.md).
 */
export interface UiMetrics {
  /** Tap area (hotspot) of a HUD button, square. */
  hit: number;
  /** Gap between two HUD tap areas. */
  gap: number;
  /** Distance of the tap areas from the top and right edge. */
  margin: number;
  /** Visible button plate, centred in its tap area. */
  plate: number;
  /** Integer scale of the 8x8 icons on the plate. */
  iconScale: number;
  /** Height of the settings menu buttons. */
  menuButtonH: number;
}

const DESKTOP: UiMetrics = { hit: 14, gap: 3, margin: 4, plate: 14, iconScale: 1, menuButtonH: 18 };
const TOUCH_LANDSCAPE: UiMetrics = { hit: 24, gap: 0, margin: 3, plate: 22, iconScale: 2, menuButtonH: 24 };
const TOUCH_PORTRAIT: UiMetrics = { hit: 44, gap: 0, margin: 0, plate: 22, iconScale: 2, menuButtonH: 44 };

export function uiMetrics(display: { touch: boolean; portrait: boolean }): UiMetrics {
  if (!display.touch) return DESKTOP;
  return display.portrait ? TOUCH_PORTRAIT : TOUCH_LANDSCAPE;
}

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
  /** Outermost slot. The button exists only while riding; without it (title, game over) mute takes this slot. */
  pause: Rect;
  mute: Rect;
  /** null where the browser has no Fullscreen API (iPhone Safari). */
  fullscreen: Rect | null;
}

/** Whether the pause button shows: only during a run (playing or paused). */
export function riding(mode: GameMode): boolean {
  return mode === 'playing' || mode === 'paused';
}

/**
 * Tap areas of the button row in the top-right corner, right to left: pause
 * (only while riding or paused), mute, fullscreen.
 */
export function hudButtons(viewWidth: number, fullscreenAvailable: boolean, m: UiMetrics = DESKTOP, withPause = true): HudButtons {
  const first = withPause ? 1 : 0;
  const slot = (i: number): Rect => ({
    x: rightAnchor(viewWidth, m.hit, m.margin + i * (m.hit + m.gap)),
    y: m.margin,
    w: m.hit,
    h: m.hit,
  });
  return { pause: slot(0), mute: slot(first), fullscreen: fullscreenAvailable ? slot(first + 1) : null };
}

/** The visible plate of a HUD button, centred in its tap area. */
export function buttonPlate(hit: Rect, m: UiMetrics): Rect {
  const inset = Math.floor((hit.w - m.plate) / 2);
  return { x: hit.x + inset, y: hit.y + inset, w: m.plate, h: m.plate };
}

/** Buttons of the settings menu: the Kindermodus toggle and Zurück; the parent check's three answers and Zurück. */
export interface SettingsLayout {
  toggle: Rect;
  back: Rect;
  answers: [Rect, Rect, Rect];
}

const TOGGLE_W = 170;
const TOGGLE_Y = 44;
const BACK_W = 100;
const ANSWER_W = 72;
const ANSWER_GAP = 12;
const ANSWERS_Y = 56;
/** Gap between the lowest content (answers, or the toggle and its note) and Zurück. */
const BACK_GAP = 20;

/** The settings screens as one compact block: Zurück sits right under the content, not at the bottom. */
export function settingsLayout(viewWidth: number, m: UiMetrics): SettingsLayout {
  const cx = centreX(viewWidth);
  const h = m.menuButtonH;
  const centred = (w: number, y: number): Rect => ({ x: cx - Math.floor(w / 2), y, w, h });
  const rowX = cx - Math.floor((3 * ANSWER_W + 2 * ANSWER_GAP) / 2);
  const answer = (i: number): Rect => ({ x: rowX + i * (ANSWER_W + ANSWER_GAP), y: ANSWERS_Y, w: ANSWER_W, h });
  return {
    toggle: centred(TOGGLE_W, TOGGLE_Y),
    back: centred(BACK_W, Math.max(TOGGLE_Y, ANSWERS_Y) + h + BACK_GAP),
    answers: [answer(0), answer(1), answer(2)],
  };
}

/** Font scale of a popup: 2 for `big` ones (catches) and in portrait, where a view pixel is only ~1 CSS px. */
export function popupScale(display: { portrait: boolean }, big: boolean): number {
  return big || display.portrait ? 2 : 1;
}

/** Least gap (view px) between a popup (outline and icon included) and either view edge. */
export const POPUP_MARGIN = 4;

/**
 * Left x of a popup `w` wide (outline and icon included) centred on `cx`,
 * kept POPUP_MARGIN from both view edges; the left margin wins if it cannot fit.
 */
export function popupLeft(cx: number, w: number, viewWidth: number): number {
  return Math.max(POPUP_MARGIN, Math.min(cx - Math.floor(w / 2), viewWidth - POPUP_MARGIN - w));
}

/** A parent-check answer labelled with the key that picks it: "1: 48". */
export function answerLabel(index: number, answer: number): string {
  return `${index + 1}: ${answer}`;
}

/**
 * Centre x for text `w` wide that must stay left of `obstacleX` (the button
 * row): the view centre when it fits there, else the centre of the free space,
 * never closer than 2 px to the left edge.
 */
export function fitCentred(w: number, viewWidth: number, obstacleX: number): number {
  const half = Math.ceil(w / 2);
  const cx = centreX(viewWidth);
  if (cx - half >= 2 && cx + half <= obstacleX - 2) return cx;
  return Math.max(Math.floor(obstacleX / 2), 2 + half);
}

/** Whole number with German thousands dots: 1234567 -> "1.234.567". */
export function formatNumber(n: number): string {
  return String(Math.max(0, Math.floor(n))).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/** A popup's points: "+1.250". */
export function plusPoints(n: number): string {
  return `+${formatNumber(n)}`;
}

export function metres(distance: number): number {
  return Math.floor(distance / PX_PER_METRE);
}

/** On for the first ~60% of every blink period. */
export function blinkOn(seconds: number): boolean {
  return seconds % BLINK_PERIOD < BLINK_PERIOD * 0.6;
}
