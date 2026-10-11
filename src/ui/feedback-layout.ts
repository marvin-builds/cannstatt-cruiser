/**
 * Layout of the feedback screen (ROADMAP 50) and of the title's speech-bubble
 * icon that opens it. Pure, shared by the hotspots (index.ts), the native
 * textarea placement and the drawing (feedback-screen.ts). One column at
 * most FORM_MAX_W wide: the title and the kind toggle ("Fehler" / "Idee") on
 * the top row, the text field filling the middle, the hint (or status) line
 * with the character counter under it, and the bottom row with
 * "Fehlerprotokoll mitsenden" at the left and "Abbrechen" / "Senden" at the
 * right. Every button is a menu button high (44 view px in portrait).
 */
import { VIEW_H } from '../core/config';
import { measureText } from '../core/font';
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
  /** Top of the hint / status line (left) and the counter (right-aligned at the field's right edge). */
  lineY: number;
  lineScale: number;
  /** "Fehlerprotokoll mitsenden" (shown for bug reports only). */
  log: Rect;
  cancel: Rect;
  send: Rect;
  /** Font scale of the kind, send and cancel labels; the log toggle's label scale and its box size. */
  labelScale: number;
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
/** The log toggle's check box (px at label scale 1; doubled with the label). */
const BOX = 7;
const HEADLINE_H = 14;

const labelW = (label: string, scale: number, m: UiMetrics) => Math.max(m.menuButtonH, measureText(label, scale) + 2 * BUTTON_PAD);
const logW = (scale: number, m: UiMetrics) => Math.max(m.menuButtonH, BOX * scale + 3 + measureText(FEEDBACK_TEXT.log, scale) + 2 * BUTTON_PAD);

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
  // The bottom row at the big label scale where it fits, else the small one; the long log label gives way first.
  const rowW = (label: number, log: number) => logW(log, m) + 2 * GAP + labelW(FEEDBACK_TEXT.cancel, label, m) + labelW(FEEDBACK_TEXT.send, label, m);
  const logScale = rowW(big, big) <= w ? big : 1;
  const labelScale = rowW(big, logScale) <= w ? big : 1;

  const idea: Rect = { x: right - labelW(FEEDBACK_TEXT.idea, labelScale, m), y: top, w: labelW(FEEDBACK_TEXT.idea, labelScale, m), h };
  const bugW = labelW(FEEDBACK_TEXT.bug, labelScale, m);
  const bug: Rect = { x: idea.x - 2 - bugW, y: top, w: bugW, h };
  const title: Rect = { x, y: top + Math.floor((h - HEADLINE_H) / 2), w: measureText(FEEDBACK_TEXT.title, 2), h: HEADLINE_H };

  const rowY = bottom - h;
  const send: Rect = { x: right - labelW(FEEDBACK_TEXT.send, labelScale, m), y: rowY, w: labelW(FEEDBACK_TEXT.send, labelScale, m), h };
  const cancelW = labelW(FEEDBACK_TEXT.cancel, labelScale, m);
  const cancel: Rect = { x: send.x - GAP - cancelW, y: rowY, w: cancelW, h };
  const log: Rect = { x, y: rowY, w: logW(logScale, m), h };

  const lineScale = 1;
  const lineY = rowY - 3 - 7 * lineScale;
  const fieldY = top + h + 3;
  const field: Rect = { x, y: fieldY, w, h: lineY - 3 - fieldY };

  const okW = Math.max(80, labelW(FEEDBACK_TEXT.ok, big, m));
  const ok: Rect = { x: Math.floor((display.viewWidth - okW) / 2), y: Math.floor(VIEW_H / 2) + GAP, w: okW, h };
  const doneY = ok.y - GAP - HEADLINE_H - 4;
  return { title, bug, idea, field, lineY, lineScale, log, cancel, send, labelScale, logScale, logBox: BOX * logScale, doneY, ok };
}

/**
 * The title's speech-bubble icon: one HUD tap area in the bottom-right
 * corner, as far from the view edges as the HUD buttons are from the top
 * right. titleLayout keeps the title's rows and cards clear of it.
 */
export function feedbackIcon(viewWidth: number, m: UiMetrics): Rect {
  return { x: viewWidth - m.margin - m.hit, y: VIEW_H - m.margin - m.hit, w: m.hit, h: m.hit };
}
