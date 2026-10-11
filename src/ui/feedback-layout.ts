/**
 * Layout of the feedback dialog's "Neu" tab (ROADMAP 50, 70) and of the
 * title's speech-bubble icon that opens it. Pure, shared by the hotspots
 * (index.ts), the native textarea placement and the drawing
 * (feedback-screen.ts). One column at most FORM_MAX_W wide. The top row holds
 * the tabs "Neu" / "Mein Feedback" at the left and the close button at the
 * right, with the kind toggle ("Fehler" / "Idee") between them where it fits;
 * the text field fills the middle with the hint (or status) line and the
 * character counter under it; "Fehlerprotokoll mitsenden" and "Ansehen" sit
 * side by side, in the bottom row left of "Senden" or on their own row above
 * it (then the kinds move beside "Senden" when the top row had no room). Every
 * button is a menu button high (44 view px in portrait, where the sheet of
 * feedback-sheet.ts shows instead).
 */
import { VIEW_H } from '../core/config';
import { measureText } from '../core/font';
import { MAX_FEEDBACK_TEXT } from '../net/feedback-types';
import type { Rect } from '../types';
import { FEEDBACK_TEXT } from './feedback-flow';
import { FEEDBACK_PAGE_TEXT } from './feedback-pages';
import { type UiMetrics, uiMetrics } from './layout';

export interface FeedbackDisplay {
  viewWidth: number;
  touch: boolean;
  portrait: boolean;
}

export interface FeedbackLayout {
  /** The tabs and the close button ("×") of the top row. */
  newTab: Rect;
  mineTab: Rect;
  close: Rect;
  bug: Rect;
  idea: Rect;
  /** The text field (the native textarea lies on it). */
  field: Rect;
  /** The hint / status line under the field (text rect, left-aligned). */
  line: Rect;
  /** The character counter (text rect, drawn right-aligned at its right edge), under the field. */
  counter: Rect;
  /** Font scale of the hint / status line and the counter. */
  lineScale: number;
  /** "Fehlerprotokoll mitsenden" (shown for bug reports only) and "Ansehen" right of it. */
  log: Rect;
  view: Rect;
  send: Rect;
  /** Font scale of the tab, kind, view and send labels. */
  labelScale: number;
  /** The log toggle's label lines, their scale and its box size. */
  logLines: readonly string[];
  logScale: number;
  logBox: number;
  /** The thank-you state: its line (top y, scale 2) and the OK button under it. */
  doneY: number;
  ok: Rect;
}

/** The widest form: wider would not read better. */
export const FORM_MAX_W = 340;
/** Space between the view edge and the column (and above / below it outside portrait). */
const SIDE = 4;
const GAP = 4;
const BUTTON_PAD = 6;
/** Room after the "Mein Feedback" label for the red dot (px at label scale 1). */
export const DOT_ROOM = 5;
/** The log toggle's check box (px at label scale 1; doubled with the label) and the space after it. */
const BOX = 7;
const BOX_GAP = 3;
/** Font cell height at scale 1 and the space between rows. */
const GLYPH_H = 7;
const ROW_GAP = 3;
/** The widest counter text. */
const COUNTER_MAX = `${MAX_FEEDBACK_TEXT}/${MAX_FEEDBACK_TEXT}`;

export const labelW = (label: string, scale: number, m: UiMetrics) => Math.max(m.menuButtonH, measureText(label, scale) + 2 * BUTTON_PAD);
const linesW = (lines: readonly string[], scale: number) => Math.max(...lines.map((s) => measureText(s, scale)));
const logW = (lines: readonly string[], scale: number, m: UiMetrics) =>
  Math.max(m.menuButtonH, BOX * scale + BOX_GAP + linesW(lines, scale) + 2 * BUTTON_PAD);

/** The column of the dialog's pages: x, width and the top / bottom of its rows. */
export interface DialogColumn {
  x: number;
  w: number;
  right: number;
  top: number;
  bottom: number;
  h: number;
  /** The big label scale (2 on phones, 1 on desktop). */
  big: number;
  m: UiMetrics;
}

export function dialogColumn(display: FeedbackDisplay): DialogColumn {
  const m = uiMetrics(display);
  const h = m.menuButtonH;
  const tall = h >= 44;
  const w = Math.min(display.viewWidth - 2 * SIDE, FORM_MAX_W);
  const x = Math.floor((display.viewWidth - w) / 2);
  return { x, w, right: x + w, top: tall ? 0 : SIDE, bottom: VIEW_H - (tall ? 0 : SIDE), h, big: h >= 24 ? 2 : 1, m };
}

/** The close button ("×") at the right of the top row, shared by every page of the dialog. */
export const closeRect = (c: DialogColumn): Rect => ({ x: c.right - c.h, y: c.top, w: c.h, h: c.h });

/** The top row's tabs at `scale`: "Neu", then "Mein Feedback" with room for its dot. */
export function tabRects(c: DialogColumn, scale: number): { newTab: Rect; mineTab: Rect } {
  const newTab: Rect = { x: c.x, y: c.top, w: labelW(FEEDBACK_PAGE_TEXT.newTab, scale, c.m), h: c.h };
  const mineW = labelW(FEEDBACK_PAGE_TEXT.mineTab, scale, c.m) + DOT_ROOM * scale;
  return { newTab, mineTab: { x: newTab.x + newTab.w + 2, y: c.top, w: mineW, h: c.h } };
}

/** How the log toggle reads and where it goes. */
interface LogPlacement {
  lines: readonly string[];
  scale: number;
  /** On its own row above the bottom row (else in the bottom row, at the left). */
  ownRow: boolean;
}

/**
 * The log label (with "Ansehen" beside it): in the bottom row left of "Senden" where the long or
 * short label fits, else on its own row (long, then short), else small on its own row.
 */
function placeLog(scale: number, c: DialogColumn, viewW: number, sendW: number): LogPlacement {
  const options = [[FEEDBACK_TEXT.log], [FEEDBACK_TEXT.logShort]];
  const groupW = (lines: readonly string[], s: number) => logW(lines, s, c.m) + GAP + viewW;
  for (const lines of options) if (groupW(lines, scale) + GAP + sendW <= c.w) return { lines, scale, ownRow: false };
  for (const lines of options) if (groupW(lines, scale) <= c.w) return { lines, scale, ownRow: true };
  return { lines: options[0]!, scale: 1, ownRow: true };
}

export function feedbackLayout(display: FeedbackDisplay): FeedbackLayout {
  const c = dialogColumn(display);
  const { x, w, right, top, bottom, h, big, m } = c;
  const lineScale = h >= 44 ? 2 : 1;
  const labelScale = tabRects(c, big).mineTab.x + tabRects(c, big).mineTab.w + GAP + c.h <= right ? big : 1;
  const { newTab, mineTab } = tabRects(c, labelScale);
  const close = closeRect(c);
  const bugW = labelW(FEEDBACK_TEXT.bug, labelScale, m);
  const ideaW = labelW(FEEDBACK_TEXT.idea, labelScale, m);
  const kindsW = bugW + 2 + ideaW;
  const viewW = labelW(FEEDBACK_PAGE_TEXT.view, labelScale, m);
  const sendW = labelW(FEEDBACK_TEXT.send, labelScale, m);
  const logPlace = placeLog(labelScale, c, viewW, sendW);

  const rowY = bottom - h;
  const send: Rect = { x: right - sendW, y: rowY, w: sendW, h };
  const logY = logPlace.ownRow ? rowY - GAP - h : rowY;
  const log: Rect = { x, y: logY, w: logW(logPlace.lines, logPlace.scale, m), h };
  const view: Rect = { x: log.x + log.w + GAP, y: logY, w: viewW, h };
  // The kinds: in the top row where they fit, else beside "Senden" when the log has its own row, else on a row of their own.
  const inTop = mineTab.x + mineTab.w + GAP + kindsW + GAP <= close.x;
  const besideSend = !inTop && logPlace.ownRow && x + kindsW + GAP <= send.x;
  const kindsY = inTop ? top : besideSend ? rowY : top + h + ROW_GAP;
  const kindsX = inTop ? close.x - GAP - kindsW : x;
  const bug: Rect = { x: kindsX, y: kindsY, w: bugW, h };
  const idea: Rect = { x: kindsX + bugW + 2, y: kindsY, w: ideaW, h };

  const lineH = GLYPH_H * lineScale;
  const counterW = measureText(COUNTER_MAX, lineScale);
  const lineY = logY - ROW_GAP - lineH;
  const fieldY = (inTop || besideSend ? top + h : kindsY + h) + ROW_GAP;
  const field: Rect = { x, y: fieldY, w, h: lineY - ROW_GAP - fieldY };
  const counter: Rect = { x: right - counterW, y: lineY, w: counterW, h: lineH };
  const line: Rect = { x, y: lineY, w: counter.x - GAP - x, h: lineH };

  const okW = Math.max(80, labelW(FEEDBACK_TEXT.ok, big, m));
  const ok: Rect = { x: Math.floor((display.viewWidth - okW) / 2), y: Math.floor(VIEW_H / 2) + GAP, w: okW, h };
  const doneY = ok.y - GAP - 14 - 4;
  return {
    newTab,
    mineTab,
    close,
    bug,
    idea,
    field,
    line,
    counter,
    lineScale,
    log,
    view,
    send,
    labelScale,
    logLines: logPlace.lines,
    logScale: logPlace.scale,
    logBox: BOX * logPlace.scale,
    doneY,
    ok,
  };
}

/**
 * The title's speech-bubble icon: one HUD tap area in the bottom-right
 * corner, as far from the view edges as the HUD buttons are from the top
 * right. titleLayout keeps the title's rows and cards clear of it.
 */
export function feedbackIcon(viewWidth: number, m: UiMetrics): Rect {
  return { x: viewWidth - m.margin - m.hit, y: VIEW_H - m.margin - m.hit, w: m.hit, h: m.hit };
}
