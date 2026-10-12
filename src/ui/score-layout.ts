/**
 * Layout of the online list's parts: the title's trophy button, the
 * "Bestenliste" screen and the name entry. Pure, shared by the hotspots
 * (index.ts) and the drawing (score-screens.ts), like menu-layout.ts.
 */
import { VIEW_H } from '../core/config';
import { measureText } from '../core/font';
import type { Rect, SafeInsets } from '../types';
import { buttonPlate, centredWidth, fitCentred, hudButtons, safeSpan, type UiMetrics, uiMetrics } from './layout';
import { logoRect } from './logo';
import { texts, widestText } from './i18n';
import { PRIVACY_LINK_GAP, PRIVACY_LINK_W } from './privacy-link';

export interface ScreenInput {
  viewWidth: number;
  touch: boolean;
  portrait: boolean;
  /** Display cutouts (display.safeInsets); none when absent. */
  safeInsets?: SafeInsets;
}

/** Least gap between the trophy's plate and the logo. */
const LOGO_GAP = 2;

/**
 * The title's trophy button: in the top-right button row left of mute and
 * fullscreen; where that would touch the logo (narrow portrait views with
 * 44 px buttons) it moves under the row's rightmost button.
 */
export function titleTrophy(viewWidth: number, fullscreenAvailable: boolean, m: UiMetrics): Rect {
  const row = hudButtons(viewWidth, fullscreenAvailable, m, false);
  const last = row.fullscreen ?? row.mute;
  const inRow: Rect = { ...last, x: last.x - m.hit - m.gap };
  const logo = logoRect(viewWidth);
  if (buttonPlate(inRow, m).x >= logo.x + logo.w + LOGO_GAP) return inRow;
  return { ...row.mute, y: row.mute.y + row.mute.h + m.gap };
}

/** Top of a screen's scale-2 headline. */
const HEADLINE_Y = 8;
const HEADLINE_H = 14;
/** Height of a text line at font scale 1. */
const LINE = 11;
/** Space between the list's edge and its columns, and the scroll bar width. */
const LIST_PAD = 4;
export const SCROLLBAR_W = 2;

/**
 * A scroll bar's thumb on a track `track` long, for a list showing `viewH` of
 * `contentH` scrolled by `scroll`: its offset on the track and its length (at
 * least `min`), or null when nothing overflows. Shared by the canvas lists and
 * the portrait sheet.
 */
export function scrollThumb(track: number, viewH: number, contentH: number, scroll: number, min: number): { y: number; h: number } | null {
  if (contentH <= viewH) return null;
  const h = Math.max(min, Math.round((track * viewH) / contentH));
  return { y: Math.round(((track - h) * scroll) / (contentH - viewH)), h };
}
/** The widest list (desktop, landscape): more spread would not read better. */
const LIST_MAX_W = 300;

/** The close "×" button: a menu-button-sized square in the top-right corner. */
export function closeButton(viewWidth: number, m: UiMetrics): Rect {
  const s = m.menuButtonH;
  return { x: safeSpan(viewWidth, m).right - m.margin - s, y: m.margin, w: s, h: s };
}

/**
 * A headline centred left of the close button; where that would come closer
 * than 2 px to `leftEdge` (the list's statistics switch and privacy link), centred in the
 * space between `leftEdge` and the close button instead.
 */
function headlineRect(text: string, viewWidth: number, close: Rect, y = HEADLINE_Y, leftEdge = 0): Rect {
  const w = measureText(text, 2);
  const x = fitCentred(w, viewWidth, close.x) - Math.ceil(w / 2);
  if (x >= leftEdge + 2) return { x, y, w, h: HEADLINE_H };
  return { x: leftEdge + Math.max(0, Math.floor((close.x - leftEdge - w) / 2)), y, w, h: HEADLINE_H };
}

/** Wide enough for "Anonyme Statistik: AUS" at scale 1 in every language. */
const STATS_SWITCH_W = widestText((t) => t.stats.label(false)) + 12;

/** The list's statistics switch: a menu-button-high button in the top-left corner, mirroring the close button. */
function statsSwitch(m: UiMetrics): Rect {
  return { x: m.safeLeft + m.margin, y: m.margin, w: STATS_SWITCH_W, h: m.menuButtonH };
}

export interface ScoreListLayout {
  close: Rect;
  /** "Anonyme Statistik: AN/AUS" (top left). */
  stats: Rect;
  /** "Datenschutz" (opens datenschutz.html), right of the statistics switch. */
  privacyLink: Rect;
  title: Rect;
  /** The visible rows (clip rect); rows scroll inside it. */
  list: Rect;
  rowH: number;
  /** Font scale of the rows: 2 in portrait, where a view pixel is ~1 CSS px. */
  textScale: number;
  /** Font scale of the lines under the list (message, privacy, statistics note): 2 in portrait. */
  noteScale: number;
  /** Rank text ends here (right aligned), the name starts at nameX, the score ends at scoreRight. */
  rankRight: number;
  nameX: number;
  scoreRight: number;
  /** All rows' height, and how far they can scroll. */
  contentH: number;
  maxScroll: number;
  /** Text lines under the list (top y), null where not shown. */
  messageY: number | null;
  privacyY: number;
  /** The statistics note under the list's privacy line. */
  statsNoteY: number;
  /** Desktop key help. */
  keysY: number | null;
}

/** Portrait: the switch and the link with room for their labels at scale 2, centred as one bottom row. */
const PORTRAIT_STATS_W = widestText((t) => t.stats.label(false), 2) + 12;
const PORTRAIT_LINK_W = widestText((t) => t.privacy.label, 2) + 12;
/** A text line at scale 2 with its spacing. */
const BIG_LINE = 16;

/**
 * The "Bestenliste" screen for `rows` entries; `message` reserves a status line under the list.
 * Portrait (about 1 CSS px per view px) has no room for the switch, the link and the title in one
 * row at a readable scale: the title sits beside the close button, the switch and the link go to
 * a bottom row, and the lines under the list are scale 2.
 */
export function scoreListLayout(input: ScreenInput, rows: number, message: boolean): ScoreListLayout {
  const m = uiMetrics(input);
  const portrait = input.portrait;
  const textScale = portrait ? 2 : 1;
  const noteScale = portrait ? 2 : 1;
  const rowH = portrait ? 18 : LINE;
  const close = closeButton(input.viewWidth, m);
  let stats: Rect;
  let privacyLink: Rect;
  let title: Rect;
  let y: number;
  if (portrait) {
    const rowW = PORTRAIT_STATS_W + PRIVACY_LINK_GAP + PORTRAIT_LINK_W;
    stats = { x: Math.floor((input.viewWidth - rowW) / 2), y: VIEW_H - m.menuButtonH, w: PORTRAIT_STATS_W, h: m.menuButtonH };
    privacyLink = { ...stats, x: stats.x + stats.w + PRIVACY_LINK_GAP, w: PORTRAIT_LINK_W };
    title = headlineRect(texts().score.title, input.viewWidth, close, close.y + Math.floor((close.h - HEADLINE_H) / 2));
    // Clear of the row's top edge, descenders included.
    y = stats.y - 3;
  } else {
    stats = statsSwitch(m);
    privacyLink = { ...stats, x: stats.x + stats.w + PRIVACY_LINK_GAP, w: PRIVACY_LINK_W };
    title = headlineRect(texts().score.title, input.viewWidth, close, HEADLINE_Y, privacyLink.x + privacyLink.w);
    y = VIEW_H - 2;
  }
  const line = () => (y -= portrait ? BIG_LINE : LINE);
  const keysY = input.touch ? null : line();
  const statsNoteY = line();
  const privacyY = line();
  const messageY = message ? line() : null;
  const top = Math.max(title.y + title.h + 4, close.y + close.h + (portrait ? 1 : 2));
  const w = Math.min(centredWidth(input.viewWidth, m) - 8, input.portrait ? input.viewWidth : LIST_MAX_W);
  const list: Rect = { x: Math.floor((input.viewWidth - w) / 2), y: top, w, h: y - 2 - top };
  const rankRight = list.x + LIST_PAD + measureText('20.', textScale);
  const contentH = rows * rowH;
  return {
    close,
    stats,
    privacyLink,
    title,
    list,
    rowH,
    textScale,
    noteScale,
    rankRight,
    nameX: rankRight + 3 * textScale + 2,
    scoreRight: list.x + list.w - LIST_PAD - SCROLLBAR_W - 2,
    contentH,
    maxScroll: Math.max(0, contentH - list.h),
    messageY,
    privacyY,
    statsNoteY,
    keysY,
  };
}

export interface ScoreEntryLayout {
  close: Rect;
  title: Rect;
  /** The points line under the title (top y), centred left of the close button. */
  scoreY: number;
  /** "Dein Name:" (top y), always at font scale 1, right above the field. */
  promptY: number;
  /** The name field (the native input lies on it). */
  field: Rect;
  /** "Als <Name> eintragen". */
  submit: Rect;
  messageY: number;
  keysY: number | null;
  /** Font scale of the points and message lines. */
  textScale: number;
}

const FIELD_MAX_W = 200;
const SUBMIT_MAX_W = 240;
const GAP = 4;

/** The name entry: title, points, the field, the submit button, a message line. */
export function scoreEntryLayout(input: ScreenInput): ScoreEntryLayout {
  const m = uiMetrics(input);
  const textScale = input.portrait ? 2 : 1;
  const h = m.menuButtonH;
  const close = closeButton(input.viewWidth, m);
  const title = headlineRect(texts().score.entryTitle, input.viewWidth, close, input.portrait ? close.y + Math.floor((close.h - HEADLINE_H) / 2) : HEADLINE_Y);
  // In portrait the points line may still be beside the close button: it is centred left of it (fitCentred).
  const scoreY = title.y + title.h + GAP;
  const promptY = scoreY + 7 * textScale + GAP + 2;
  const fieldY = promptY + 7 + 3;
  const cx = Math.floor(input.viewWidth / 2);
  const fieldW = Math.min(input.viewWidth - 16, FIELD_MAX_W);
  const field: Rect = { x: cx - Math.floor(fieldW / 2), y: fieldY, w: fieldW, h };
  const submitW = Math.min(input.viewWidth - 16, SUBMIT_MAX_W);
  const submit: Rect = { x: cx - Math.floor(submitW / 2), y: fieldY + h + GAP + 2, w: submitW, h };
  const messageY = submit.y + h + GAP;
  return {
    close,
    title,
    scoreY,
    promptY,
    field,
    submit,
    messageY,
    keysY: input.touch ? null : VIEW_H - 2 - LINE,
    textScale,
  };
}
