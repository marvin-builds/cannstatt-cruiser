/**
 * Layout of the feedback screen (ROADMAP 50) and of the title's speech-bubble
 * icon that opens it. Pure, shared by the hotspots (index.ts), the native
 * textarea placement and the drawing (feedback-screen.ts). One column at
 * most FORM_MAX_W wide: the title and the kind toggle ("Fehler" / "Idee") on
 * the top row, the text field filling the middle, the hint (or status) line
 * with the character counter under it (in portrait the counter sits in the
 * top row), and the bottom row with "Fehlerprotokoll mitsenden" at the left
 * (or on its own row above, see placeLog) and "Abbrechen" / "Senden" at the
 * right. Every button is a menu button high (44 view px in portrait), where
 * all text is at least 2x (about 1 CSS px per view px there).
 */
import { VIEW_H } from '../core/config';
import { measureText } from '../core/font';
import { MAX_FEEDBACK_TEXT } from '../net/feedback-types';
import type { Rect } from '../types';
import { FEEDBACK_TEXT } from './feedback-flow';
import { type UiMetrics, uiMetrics } from './layout';

export interface FeedbackDisplay {
  viewWidth: number;
  touch: boolean;
  portrait: boolean;
}

export interface FeedbackLayout {
  /** The scale-2 headline "Feedback" (text rect). */
  title: Rect;
  bug: Rect;
  idea: Rect;
  /** The text field (the native textarea lies on it). */
  field: Rect;
  /** The hint / status line under the field (text rect, left-aligned). */
  line: Rect;
  /** The character counter (text rect, drawn right-aligned at its right edge): under the field, or in portrait in the top row. */
  counter: Rect;
  /** Font scale of the hint / status line and the counter. */
  lineScale: number;
  /** "Fehlerprotokoll mitsenden" (shown for bug reports only): in the bottom row, or on its own row above it where it does not fit there. */
  log: Rect;
  cancel: Rect;
  send: Rect;
  /** Font scale of the kind, send and cancel labels. */
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
const FORM_MAX_W = 340;
/** Space between the view edge and the column (and above / below it outside portrait). */
const SIDE = 4;
const GAP = 4;
const BUTTON_PAD = 6;
/** The log toggle's check box (px at label scale 1; doubled with the label) and the space after it. */
const BOX = 7;
const BOX_GAP = 3;
const HEADLINE_H = 14;
/** Font cell height at scale 1, the space between two label lines and between the field and the line under it. */
const GLYPH_H = 7;
const LINE_GAP = 2;
const ROW_GAP = 3;
/** The widest counter text. */
const COUNTER_MAX = `${MAX_FEEDBACK_TEXT}/${MAX_FEEDBACK_TEXT}`;

const labelW = (label: string, scale: number, m: UiMetrics) => Math.max(m.menuButtonH, measureText(label, scale) + 2 * BUTTON_PAD);
const linesW = (lines: readonly string[], scale: number) => Math.max(...lines.map((s) => measureText(s, scale)));
const logW = (lines: readonly string[], scale: number, m: UiMetrics) =>
  Math.max(m.menuButtonH, BOX * scale + BOX_GAP + linesW(lines, scale) + 2 * BUTTON_PAD);
const linesH = (lines: readonly string[], scale: number) => lines.length * GLYPH_H * scale + (lines.length - 1) * LINE_GAP;

/** Where the log toggle goes and how its label reads. */
interface LogPlacement {
  lines: readonly string[];
  scale: number;
  /** On its own row above the bottom row (else in the bottom row, at the left). */
  ownRow: boolean;
}

/**
 * The log label at the big scale: in the bottom row on one line, else on two (the short form in
 * the narrowest views) where the buttons are tall enough, else on its own row where the view is
 * not too short for one (phone landscape), else small in the bottom row.
 */
function placeLog(big: number, w: number, buttonsW: number, tall: boolean, m: UiMetrics): LogPlacement {
  const options = [[FEEDBACK_TEXT.log], FEEDBACK_TEXT.logLong, FEEDBACK_TEXT.logShort];
  for (const lines of options) {
    if (linesH(lines, big) <= m.menuButtonH - 4 && logW(lines, big, m) + GAP + buttonsW <= w) return { lines, scale: big, ownRow: false };
  }
  if (!tall && logW(options[0]!, big, m) <= w) return { lines: options[0]!, scale: big, ownRow: true };
  return { lines: options[0]!, scale: 1, ownRow: false };
}

export function feedbackLayout(display: FeedbackDisplay): FeedbackLayout {
  const m = uiMetrics(display);
  const h = m.menuButtonH;
  const tall = h >= 44;
  const w = Math.min(display.viewWidth - 2 * SIDE, FORM_MAX_W);
  const x = Math.floor((display.viewWidth - w) / 2);
  const right = x + w;
  const top = tall ? 0 : SIDE;
  const bottom = VIEW_H - (tall ? 0 : SIDE);
  const big = h >= 24 ? 2 : 1;
  // Portrait phones show about one CSS px per view px: the small texts go big there.
  const lineScale = tall ? 2 : 1;
  const buttonsW = (scale: number) => GAP + labelW(FEEDBACK_TEXT.cancel, scale, m) + labelW(FEEDBACK_TEXT.send, scale, m);
  const labelScale = buttonsW(big) + logW([FEEDBACK_TEXT.log], 1, m) + GAP <= w ? big : 1;
  const logPlace = placeLog(labelScale, w, buttonsW(labelScale), tall, m);

  const idea: Rect = { x: right - labelW(FEEDBACK_TEXT.idea, labelScale, m), y: top, w: labelW(FEEDBACK_TEXT.idea, labelScale, m), h };
  const bugW = labelW(FEEDBACK_TEXT.bug, labelScale, m);
  const bug: Rect = { x: idea.x - 2 - bugW, y: top, w: bugW, h };
  const title: Rect = { x, y: top + Math.floor((h - HEADLINE_H) / 2), w: measureText(FEEDBACK_TEXT.title, 2), h: HEADLINE_H };

  const rowY = bottom - h;
  const send: Rect = { x: right - labelW(FEEDBACK_TEXT.send, labelScale, m), y: rowY, w: labelW(FEEDBACK_TEXT.send, labelScale, m), h };
  const cancelW = labelW(FEEDBACK_TEXT.cancel, labelScale, m);
  const cancel: Rect = { x: send.x - GAP - cancelW, y: rowY, w: cancelW, h };
  const logY = logPlace.ownRow ? rowY - GAP - h : rowY;
  const log: Rect = { x, y: logY, w: logW(logPlace.lines, logPlace.scale, m), h };

  const lineH = GLYPH_H * lineScale;
  const counterW = measureText(COUNTER_MAX, lineScale);
  const lineY = logY - ROW_GAP - lineH;
  const fieldY = top + h + ROW_GAP;
  const field: Rect = { x, y: fieldY, w, h: lineY - ROW_GAP - fieldY };
  // In portrait the counter goes up beside the headline, so the status line has the full width.
  const counter: Rect = tall
    ? { x: bug.x - GAP - counterW, y: top + Math.floor((h - lineH) / 2), w: counterW, h: lineH }
    : { x: right - counterW, y: lineY, w: counterW, h: lineH };
  const line: Rect = { x, y: lineY, w: tall ? w : counter.x - GAP - x, h: lineH };

  const okW = Math.max(80, labelW(FEEDBACK_TEXT.ok, big, m));
  const ok: Rect = { x: Math.floor((display.viewWidth - okW) / 2), y: Math.floor(VIEW_H / 2) + GAP, w: okW, h };
  const doneY = ok.y - GAP - HEADLINE_H - 4;
  return {
    title,
    bug,
    idea,
    field,
    line,
    counter,
    lineScale,
    log,
    cancel,
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
