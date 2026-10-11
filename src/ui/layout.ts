import type { GameMode } from '../core/modes';
import type { Rect } from '../types';
import { measureText } from '../core/font';
import { PRIVACY_LABEL, PRIVACY_LINK_GAP, PRIVACY_LINK_W } from './privacy-link';

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

/** View pixels per metre for the distance readout and the online list (the skater is ~30 px, ~1.8 m tall; the server's plausibility bounds use it too). */
export const PX_PER_METRE = 10;
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

/** The settings menu top down: title, Kindermodus and its note, the statistics switch (with the "Datenschutz" link right of it) and its note, the desktop key hint, Zurück. */
export interface SettingsLayout {
  /** Top of the scale-2 title. */
  titleY: number;
  toggle: Rect;
  kidNoteY: number;
  stats: Rect;
  /** "Datenschutz" (opens datenschutz.html), right of the statistics switch. */
  privacyLink: Rect;
  statsNoteY: number;
  /** Desktop key help; null on touch. */
  keysY: number | null;
  /** Zurück: under the rest, in portrait in the title row at the right. */
  back: Rect;
  /** Font scale of the notes (2 in portrait, where a view pixel is ~1 CSS px). */
  noteScale: number;
  /** Top-left of the plain "Testgerät" line (ROADMAP 55, only on a marked device): text, never a hotspot. */
  testDevice: { x: number; y: number; scale: number };
}

/** The settings line on the owner's test devices (ROADMAP 55). */
export const TEST_DEVICE_LABEL = 'Testgerät';

/** Wide enough for "Anonyme Statistik: AUS" at scale 2. */
const TOGGLE_W = 200;
const BACK_W = 100;
const TITLE_H = 14;
/** One scale-1 text line with its spacing. */
const NOTE_LINE = 11;

/** Portrait: Zurück, the statistics switch and the link with room for their labels at scale 2; a scale-2 note line with its spacing. */
const PORTRAIT_BACK_W = measureText('Zurück', 2) + 24;
const PORTRAIT_STATS_W = measureText('Anonyme Statistik: AUS', 2) + 12;
const PORTRAIT_LINK_W = measureText(PRIVACY_LABEL, 2) + 12;
const BIG_NOTE_LINE = 16;

/**
 * The settings screens as one compact block. Portrait's 44 px buttons and scale-2 notes need the
 * whole view height: Zurück moves up into the title row there (settingsPortrait).
 */
export function settingsLayout(viewWidth: number, m: UiMetrics): SettingsLayout {
  const h = m.menuButtonH;
  if (h >= 44) return settingsPortrait(viewWidth, h);
  const cx = centreX(viewWidth);
  const gap = 4;
  const centred = (w: number, y: number): Rect => ({ x: cx - Math.floor(w / 2), y, w, h });
  const titleY = 12;
  const toggle = centred(TOGGLE_W, titleY + TITLE_H + 8);
  const kidNoteY = toggle.y + h + 2;
  // The switch and the link are centred as one row.
  const statsRow = centred(TOGGLE_W + PRIVACY_LINK_GAP + PRIVACY_LINK_W, kidNoteY + NOTE_LINE + gap);
  const stats = { ...statsRow, w: TOGGLE_W };
  const privacyLink = { ...statsRow, x: stats.x + TOGGLE_W + PRIVACY_LINK_GAP, w: PRIVACY_LINK_W };
  const statsNoteY = stats.y + h + 2;
  const below = statsNoteY + NOTE_LINE + gap;
  // Touch (bigger buttons) has no key help line.
  const keysY = h > DESKTOP.menuButtonH ? null : below;
  const back = centred(BACK_W, keysY === null ? below : keysY + NOTE_LINE + gap);
  // Centred under Zurück, where the view has room left.
  const testDevice = { x: cx - Math.floor(measureText(TEST_DEVICE_LABEL, 1) / 2), y: back.y + h + gap + 2, scale: 1 };
  return { titleY, toggle, kidNoteY, stats, privacyLink, statsNoteY, keysY, back, noteScale: 1, testDevice };
}

function settingsPortrait(viewWidth: number, h: number): SettingsLayout {
  const cx = centreX(viewWidth);
  const back: Rect = { x: viewWidth - PORTRAIT_BACK_W, y: 0, w: PORTRAIT_BACK_W, h };
  const titleY = Math.floor((h - TITLE_H) / 2);
  const toggle: Rect = { x: cx - Math.floor(TOGGLE_W / 2), y: h + 6, w: TOGGLE_W, h };
  const kidNoteY = toggle.y + h + 2;
  const rowW = PORTRAIT_STATS_W + PRIVACY_LINK_GAP + PORTRAIT_LINK_W;
  const stats: Rect = { x: cx - Math.floor(rowW / 2), y: kidNoteY + BIG_NOTE_LINE + 4, w: PORTRAIT_STATS_W, h };
  const privacyLink: Rect = { ...stats, x: stats.x + stats.w + PRIVACY_LINK_GAP, w: PORTRAIT_LINK_W };
  const statsNoteY = stats.y + h + 2;
  // The view is full below; the title row has room left of the centred title (Zurück is at the right).
  const testDevice = { x: 8, y: titleY, scale: 2 };
  return { titleY, toggle, kidNoteY, stats, privacyLink, statsNoteY, keysY: null, back, noteScale: 2, testDevice };
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
