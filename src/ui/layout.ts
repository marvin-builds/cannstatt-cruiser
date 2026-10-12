import type { GameMode } from '../core/modes';
import type { Rect, SafeInsets } from '../types';
import { measureText } from '../core/font';
import { texts, widestText } from './i18n';
import { type LanguageSwitch, languageSwitch } from './language-switch';
import { PRIVACY_LINK_GAP, PRIVACY_LINK_W } from './privacy-link';

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
  /** Left and right display cutouts (display.safeInsets, view px) that edge UI keeps clear of (safeSpan). */
  safeLeft: number;
  safeRight: number;
}

const DESKTOP: UiMetrics = { hit: 14, gap: 3, margin: 4, plate: 14, iconScale: 1, menuButtonH: 18, safeLeft: 0, safeRight: 0 };
const TOUCH_LANDSCAPE: UiMetrics = { hit: 24, gap: 0, margin: 3, plate: 22, iconScale: 2, menuButtonH: 24, safeLeft: 0, safeRight: 0 };
const TOUCH_PORTRAIT: UiMetrics = { hit: 44, gap: 0, margin: 0, plate: 22, iconScale: 2, menuButtonH: 44, safeLeft: 0, safeRight: 0 };

/** What layouts read from the display (a DisplayInfo fits; tests may leave the cutouts out). */
export interface UiDisplay {
  viewWidth: number;
  touch: boolean;
  portrait: boolean;
  safeInsets?: SafeInsets;
}

/** Metrics with cutouts, one object per device and inset pair, so caches can compare them by identity. */
const withInsets = new Map<string, UiMetrics>();

/** The device's metrics with the left and right safe-area insets (none passed: none). */
export function uiMetrics(display: { touch: boolean; portrait: boolean; safeInsets?: SafeInsets }): UiMetrics {
  const base = !display.touch ? DESKTOP : display.portrait ? TOUCH_PORTRAIT : TOUCH_LANDSCAPE;
  const left = display.safeInsets?.left ?? 0;
  const right = display.safeInsets?.right ?? 0;
  if (left === 0 && right === 0) return base;
  const key = `${base.hit}|${left}|${right}`;
  let m = withInsets.get(key);
  if (!m) withInsets.set(key, (m = { ...base, safeLeft: left, safeRight: right }));
  return m;
}

/**
 * The x span edge UI (buttons, the stats plate, corner buttons) stays inside: the view less the
 * display cutouts at its left and right (ROADMAP 75). The world and full-width fills ignore it.
 */
export function safeSpan(viewWidth: number, m: UiMetrics): { left: number; right: number } {
  return { left: m.safeLeft, right: viewWidth - m.safeRight };
}

/** View pixels per metre for the distance readout and the online list (the skater is ~30 px, ~1.8 m tall; the server's plausibility bounds use it too). */
export const PX_PER_METRE = 10;
/** Seconds of one on/off blink cycle of prompts. */
const BLINK_PERIOD = 1;

/** The widest content centred on the view (centreX) that stays inside the safe span: the view less twice the larger cutout. */
export function centredWidth(viewWidth: number, m: UiMetrics): number {
  return viewWidth - 2 * Math.max(m.safeLeft, m.safeRight);
}

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
 * Tap areas of the button row in the top-right corner (inside the safe span), right to left: pause
 * (only while riding or paused), mute, fullscreen.
 */
export function hudButtons(viewWidth: number, fullscreenAvailable: boolean, m: UiMetrics = DESKTOP, withPause = true): HudButtons {
  const first = withPause ? 1 : 0;
  const right = safeSpan(viewWidth, m).right;
  const slot = (i: number): Rect => ({
    x: rightAnchor(right, m.hit, m.margin + i * (m.hit + m.gap)),
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

/**
 * An icon `size` px square (before iconScale) on its button plate, both centred in the tap area. The
 * plate grows by 1 px where the icon's parity differs from it (the 9x9 gear on the 14 px desktop
 * plate), so the icon sits exactly in the middle at every scale.
 */
export function iconOnPlate(hit: Rect, m: UiMetrics, size: number): { plate: Rect; icon: { x: number; y: number } } {
  const drawn = size * m.iconScale;
  const side = m.plate + ((m.plate - drawn) % 2 === 0 ? 0 : 1);
  const plate = { x: hit.x + Math.floor((hit.w - side) / 2), y: hit.y + Math.floor((hit.h - side) / 2), w: side, h: side };
  const inset = (side - drawn) / 2;
  return { plate, icon: { x: plate.x + inset, y: plate.y + inset } };
}

/**
 * The settings menu top down: title, Kindermodus and its note, the statistics switch (with the
 * "Datenschutz" link right of it) and its note, the desktop key hint, Zurück; "App installieren"
 * (while installable) left of Zurück, in portrait right of Kindermodus.
 */
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
  /** "App installieren" (ROADMAP 68), or null when the game is installed. */
  install: Rect | null;
  /** Font scale of the notes (2 in portrait, where a view pixel is ~1 CSS px). */
  noteScale: number;
  /** Top-left of the plain "Testgerät" line (ROADMAP 55, only on a marked device): text, never a hotspot. */
  testDevice: { x: number; y: number; scale: number };
  /** The language switch "DE | EN" in the top-left corner (ROADMAP 71). */
  language: LanguageSwitch;
}

/** Wide enough for "Anonyme Statistik: AUS" at scale 2 in every language. */
const TOGGLE_W = 200;
const BACK_W = 100;
const TITLE_H = 14;
/** One scale-1 text line with its spacing. */
const NOTE_LINE = 11;

/** A settings button as wide as its label at the button's label scale (2 once touch-sized), with padding. */
const labelButtonW = (label: string, h: number) => measureText(label, h >= 24 ? 2 : 1) + 24;

/** Portrait: Zurück, the statistics switch and the link with room for their labels at scale 2; a scale-2 note line with its spacing. */
const PORTRAIT_BACK_W = widestText((t) => t.settings.back, 2) + 24;
const PORTRAIT_STATS_W = widestText((t) => t.stats.label(false), 2) + 12;
const PORTRAIT_LINK_W = widestText((t) => t.privacy.label, 2) + 12;
const BIG_NOTE_LINE = 16;

/**
 * The settings screens as one compact block. Portrait's 44 px buttons and scale-2 notes need the
 * whole view height: Zurück moves up into the title row there (settingsPortrait).
 */
export function settingsLayout(viewWidth: number, m: UiMetrics, installable = false): SettingsLayout {
  const h = m.menuButtonH;
  if (h >= 44) return settingsPortrait(viewWidth, m, installable);
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
  const backY = keysY === null ? below : keysY + NOTE_LINE + gap;
  // "App installieren" and Zurück are centred as one row.
  const installW = installable ? labelButtonW(texts().settings.installApp, h) : 0;
  const backRow = centred(installW + (installable ? gap : 0) + BACK_W, backY);
  const install = installable ? { ...backRow, w: installW } : null;
  const back = { ...backRow, x: backRow.x + backRow.w - BACK_W, w: BACK_W };
  // Centred under Zurück, where the view has room left.
  const testDevice = { x: cx - Math.floor(measureText(texts().settings.testDevice, 1) / 2), y: back.y + h + gap + 2, scale: 1 };
  const language = languageSwitch(viewWidth, m, 'settings');
  return { titleY, toggle, kidNoteY, stats, privacyLink, statsNoteY, keysY, back, install, noteScale: 1, testDevice, language };
}

/** Portrait: Zurück in the title row; "App installieren" beside a Kindermodus switch as narrow as its label. */
function settingsPortrait(viewWidth: number, m: UiMetrics, installable: boolean): SettingsLayout {
  const h = m.menuButtonH;
  const cx = centreX(viewWidth);
  const back: Rect = { x: viewWidth - PORTRAIT_BACK_W, y: 0, w: PORTRAIT_BACK_W, h };
  const titleY = Math.floor((h - TITLE_H) / 2);
  const toggleW = installable ? labelButtonW(texts().settings.kidMode(false), h) : TOGGLE_W;
  const installW = installable ? labelButtonW(texts().settings.installApp, h) : 0;
  const kidRowW = toggleW + (installable ? PRIVACY_LINK_GAP + installW : 0);
  const toggle: Rect = { x: cx - Math.floor(kidRowW / 2), y: h + 6, w: toggleW, h };
  const install = installable ? { ...toggle, x: toggle.x + toggleW + PRIVACY_LINK_GAP, w: installW } : null;
  const kidNoteY = toggle.y + h + 2;
  const rowW = PORTRAIT_STATS_W + PRIVACY_LINK_GAP + PORTRAIT_LINK_W;
  const stats: Rect = { x: cx - Math.floor(rowW / 2), y: kidNoteY + BIG_NOTE_LINE + 4, w: PORTRAIT_STATS_W, h };
  const privacyLink: Rect = { ...stats, x: stats.x + stats.w + PRIVACY_LINK_GAP, w: PORTRAIT_LINK_W };
  const statsNoteY = stats.y + h + 2;
  // The view is full below; the title row has room left of the centred title (Zurück is at the right): the
  // language switch, and the test device line under its plate.
  const language = languageSwitch(viewWidth, m, 'settings');
  const testDevice = { x: language.plate.x, y: language.plate.y + language.plate.h + 2, scale: 2 };
  return { titleY, toggle, kidNoteY, stats, privacyLink, statsNoteY, keysY: null, back, install, noteScale: 2, testDevice, language };
}

/** Font scale of a popup: 2 for `big` ones (catches) and in portrait, where a view pixel is only ~1 CSS px. */
export function popupScale(display: { portrait: boolean }, big: boolean): number {
  return big || display.portrait ? 2 : 1;
}

/** Least gap (view px) between a popup (outline and icon included) and either view edge. */
export const POPUP_MARGIN = 4;

/**
 * Left x of a popup `w` wide (outline and icon included) centred on `cx`,
 * kept POPUP_MARGIN from both edges of the safe span (`m`'s cutouts, none by
 * default); the left margin wins if it cannot fit.
 */
export function popupLeft(cx: number, w: number, viewWidth: number, m: UiMetrics = DESKTOP): number {
  return Math.max(m.safeLeft + POPUP_MARGIN, Math.min(cx - Math.floor(w / 2), viewWidth - m.safeRight - POPUP_MARGIN - w));
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

/** Whole number with the language's thousands separator: 1234567 -> "1.234.567" (German), "1,234,567" (English). */
export function formatNumber(n: number): string {
  return String(Math.max(0, Math.floor(n))).replace(/\B(?=(\d{3})+(?!\d))/g, texts().thousands);
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

/**
 * A modal layer's tap area: every pointer position, also outside the view (the letterbox around the
 * canvas, the page beside it), so no press reaches the game behind an open screen.
 */
export const EVERYWHERE: Rect = { x: -1e6, y: -1e6, w: 2e6, h: 2e6 };
