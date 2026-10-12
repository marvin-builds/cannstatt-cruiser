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
 * it (then the kinds move beside "Senden" when the top row had no room); on the
 * narrowest phones the whole log label takes its row alone and "Ansehen" moves
 * left of "Senden" too, before the label is shortened. Every
 * button is a menu button high (44 view px in portrait, where the sheet of
 * feedback-sheet.ts shows instead).
 */
import { VIEW_H } from '../core/config';
import { measureText } from '../core/font';
import { MAX_FEEDBACK_TEXT } from '../net/feedback-types';
import type { Rect, SafeInsets } from '../types';
import { FEEDBACK_TEXT } from './feedback-flow';
import { FEEDBACK_PAGE_TEXT } from './feedback-pages';
import { centredWidth, safeSpan, type UiMetrics, uiMetrics } from './layout';

export interface FeedbackDisplay {
  viewWidth: number;
  touch: boolean;
  portrait: boolean;
  /** Display cutouts (display.safeInsets): the form stays clear of them; none when absent. */
  safeInsets?: SafeInsets;
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
  /** The log toggle's label lines, their scale, its box size and the label's left edge. */
  logLines: readonly string[];
  logScale: number;
  logBox: number;
  logText: number;
}

/** The widest form: wider would not read better. */
export const FORM_MAX_W = 340;
/** Space between the view edge and the column (and above / below it outside portrait). */
const SIDE = 4;
const GAP = 4;
const BUTTON_PAD = 6;
/** Room after the "Mein Feedback" label for the red dot (px at label scale 1). */
export const DOT_ROOM = 6;
/** The red dot's size and its gap after a label (px at scale 1). */
export const DOT = 3;
const DOT_GAP = 2;
/** The log toggle's check box and the space after it (px at label scale 1; doubled with the label). */
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
  Math.max(m.menuButtonH, (BOX + BOX_GAP) * scale + linesW(lines, scale) + 2 * BUTTON_PAD);

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
  const w = Math.min(centredWidth(display.viewWidth, m) - 2 * SIDE, FORM_MAX_W);
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

/** The red dot after the "Mein Feedback" label of tab `mineTab` (label `scale`), clear of the label and the border. */
export function tabDot(mineTab: Rect, scale: number): Rect {
  const labelRight = mineTab.x + Math.floor((mineTab.w - DOT_ROOM * scale) / 2) + Math.ceil(measureText(FEEDBACK_PAGE_TEXT.mineTab, scale) / 2);
  return { x: labelRight + DOT_GAP * scale, y: mineTab.y + Math.floor((mineTab.h - GLYPH_H * scale) / 2), w: DOT * scale, h: DOT * scale };
}

/** How the log toggle reads and where it goes. */
interface LogPlacement {
  lines: readonly string[];
  scale: number;
  /** On its own row above the bottom row (else in the bottom row, at the left). */
  ownRow: boolean;
  /** "Ansehen" in the bottom row left of "Senden" (else right of the log toggle). */
  viewBySend: boolean;
}

/**
 * The log label (with "Ansehen" beside it): the whole label in the bottom row left of "Senden", else on
 * its own row with "Ansehen", else alone on its row with "Ansehen" moved left of "Senden" (where the
 * bottom row has room, `bottomFree` px left of "Senden"); only then the short label (bottom row, own
 * row), and last the whole label small on its own row.
 */
function placeLog(scale: number, c: DialogColumn, viewW: number, sendW: number, bottomFree: number): LogPlacement {
  const groupW = (lines: readonly string[], s: number) => logW(lines, s, c.m) + GAP + viewW;
  const full = [FEEDBACK_TEXT.log];
  const short = [FEEDBACK_TEXT.logShort];
  const place = (lines: string[], s: number, ownRow: boolean, viewBySend = false) => ({ lines, scale: s, ownRow, viewBySend });
  if (groupW(full, scale) + GAP + sendW <= c.w) return place(full, scale, false);
  if (groupW(full, scale) <= c.w) return place(full, scale, true);
  if (logW(full, scale, c.m) <= c.w && viewW + GAP <= bottomFree) return place(full, scale, true, true);
  if (groupW(short, scale) + GAP + sendW <= c.w) return place(short, scale, false);
  if (groupW(short, scale) <= c.w) return place(short, scale, true);
  return place(full, 1, true);
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
  const rowY = bottom - h;
  const send: Rect = { x: right - sendW, y: rowY, w: sendW, h };
  // The kinds: in the top row where they fit, else beside "Senden" when the log has its own row, else on a row of their own.
  const inTop = mineTab.x + mineTab.w + GAP + kindsW + GAP <= close.x;
  const kindsFit = x + kindsW + GAP <= send.x;
  // Room left of "Senden" for "Ansehen", after the kinds when they come down there too.
  const bottomFree = send.x - x - (inTop || !kindsFit ? 0 : kindsW + GAP);
  const logPlace = placeLog(labelScale, c, viewW, sendW, bottomFree);
  const logY = logPlace.ownRow ? rowY - GAP - h : rowY;
  const log: Rect = { x, y: logY, w: logW(logPlace.lines, logPlace.scale, m), h };
  const view: Rect = logPlace.viewBySend ? { x: send.x - GAP - viewW, y: rowY, w: viewW, h } : { x: log.x + log.w + GAP, y: logY, w: viewW, h };
  const besideSend = !inTop && logPlace.ownRow && kindsFit;
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
    logText: x + BUTTON_PAD + (BOX + BOX_GAP) * logPlace.scale,
  };
}

/**
 * The title's speech-bubble icon: one HUD tap area in the bottom-right
 * corner, as far from the view edges as the HUD buttons are from the top
 * right. titleLayout keeps the title's rows and cards clear of it.
 */
export function feedbackIcon(viewWidth: number, m: UiMetrics): Rect {
  return { x: safeSpan(viewWidth, m).right - m.margin - m.hit, y: VIEW_H - m.margin - m.hit, w: m.hit, h: m.hit };
}
