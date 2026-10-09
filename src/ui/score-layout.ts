/**
 * Layout of the online list's parts: the title's trophy button, the
 * "Bestenliste" screen and the name entry. Pure, shared by the hotspots
 * (index.ts) and the drawing (score-screens.ts), like menu-layout.ts.
 */
import { VIEW_H } from '../core/config';
import { measureText } from '../core/font';
import type { Rect } from '../types';
import { buttonPlate, fitCentred, hudButtons, type UiMetrics, uiMetrics } from './layout';
import { logoRect } from './logo';

export interface ScreenInput {
  viewWidth: number;
  touch: boolean;
  portrait: boolean;
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
/** The widest list (desktop, landscape): more spread would not read better. */
const LIST_MAX_W = 300;

/** The close "×" button: a menu-button-sized square in the top-right corner. */
export function closeButton(viewWidth: number, m: UiMetrics): Rect {
  const s = m.menuButtonH;
  return { x: viewWidth - m.margin - s, y: m.margin, w: s, h: s };
}

function headlineRect(text: string, viewWidth: number, close: Rect, y = HEADLINE_Y): Rect {
  const w = measureText(text, 2);
  const cx = fitCentred(w, viewWidth, close.x);
  return { x: cx - Math.ceil(w / 2), y, w, h: HEADLINE_H };
}

export interface ScoreListLayout {
  close: Rect;
  title: Rect;
  /** The visible rows (clip rect); rows scroll inside it. */
  list: Rect;
  rowH: number;
  /** Font scale of the rows and notes: 2 in portrait, where a view pixel is ~1 CSS px. */
  textScale: number;
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
  /** Desktop key help. */
  keysY: number | null;
}

/** The "Bestenliste" screen for `rows` entries; `message` reserves a status line under the list. */
export function scoreListLayout(input: ScreenInput, rows: number, message: boolean): ScoreListLayout {
  const m = uiMetrics(input);
  const textScale = input.portrait ? 2 : 1;
  const rowH = input.portrait ? 18 : LINE;
  const close = closeButton(input.viewWidth, m);
  const title = headlineRect('Bestenliste', input.viewWidth, close);
  let y = VIEW_H - 2;
  const line = () => (y -= LINE);
  const keysY = input.touch ? null : line();
  const privacyY = line();
  const messageY = message ? line() : null;
  const top = Math.max(title.y + title.h + 4, close.y + close.h + 2);
  const w = Math.min(input.viewWidth - 8, input.portrait ? input.viewWidth : LIST_MAX_W);
  const list: Rect = { x: Math.floor((input.viewWidth - w) / 2), y: top, w, h: y - 2 - top };
  const rankRight = list.x + LIST_PAD + measureText('20.', textScale);
  const contentH = rows * rowH;
  return {
    close,
    title,
    list,
    rowH,
    textScale,
    rankRight,
    nameX: rankRight + 3 * textScale + 2,
    scoreRight: list.x + list.w - LIST_PAD - SCROLLBAR_W - 2,
    contentH,
    maxScroll: Math.max(0, contentH - list.h),
    messageY,
    privacyY,
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
  /** The name field (adult mode: the native input lies on it). */
  field: Rect;
  /** "Neuer Name" beside the field (kid mode only). */
  reroll: Rect | null;
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

/** The name entry: title, points, the field (kid mode: the nickname and "Neuer Name"), the submit button, a message line. */
export function scoreEntryLayout(input: ScreenInput, kid: boolean): ScoreEntryLayout {
  const m = uiMetrics(input);
  const textScale = input.portrait ? 2 : 1;
  const h = m.menuButtonH;
  const close = closeButton(input.viewWidth, m);
  const title = headlineRect('Eintragen', input.viewWidth, close, input.portrait ? close.y + Math.floor((close.h - HEADLINE_H) / 2) : HEADLINE_Y);
  // In portrait the points line may still be beside the close button: it is centred left of it (fitCentred).
  const scoreY = title.y + title.h + GAP;
  const promptY = scoreY + 7 * textScale + GAP + 2;
  const fieldY = promptY + 7 + 3;
  const cx = Math.floor(input.viewWidth / 2);
  const rerollW = kid ? Math.max(h, measureText('Neuer Name', h >= 24 ? 2 : 1) + 12) : 0;
  const total = Math.min(input.viewWidth - 16, FIELD_MAX_W + (kid ? rerollW + GAP : 0));
  const left = cx - Math.floor(total / 2);
  const field: Rect = { x: left, y: fieldY, w: total - (kid ? rerollW + GAP : 0), h };
  const reroll = kid ? { x: field.x + field.w + GAP, y: fieldY, w: rerollW, h } : null;
  const submitW = Math.min(input.viewWidth - 16, SUBMIT_MAX_W);
  const submit: Rect = { x: cx - Math.floor(submitW / 2), y: fieldY + h + GAP + 2, w: submitW, h };
  const messageY = submit.y + h + GAP;
  return {
    close,
    title,
    scoreY,
    promptY,
    field,
    reroll,
    submit,
    messageY,
    keysY: input.touch ? null : VIEW_H - 2 - LINE,
    textScale,
  };
}
