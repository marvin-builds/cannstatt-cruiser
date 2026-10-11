/**
 * Drawing of the feedback screen from its layout (feedback-layout.ts), the
 * same rects the hotspots use. The typed text is drawn into the field too
 * (the native textarea lies on it in the browser; canvas captures show the
 * drawn copy). Menu screen only, so plain allocation is fine.
 */
import { measureText } from '../core/font';
import type { Rect, RenderContext } from '../types';
import { UI } from './art';
import { centred, fill, menuButton, text } from './draw-kit';
import { FEEDBACK_TEXT, type FeedbackFlow } from './feedback-flow';
import type { FeedbackLayout } from './feedback-layout';

/** Space between the field's edge and the drawn text, and between text lines. */
const FIELD_PAD = 5;
const TEXT_LINE = 9;
/** The log toggle's label lines: glyph height at scale 1 and the unscaled space between lines (as feedbackLayout counts them). */
const LABEL_GLYPH = 7;
const LABEL_LEADING = 2;

/** The placeholder of the textarea for the chosen kind. */
export function feedbackPlaceholder(flow: Pick<FeedbackFlow, 'kind'>): string {
  return flow.kind === 'bug' ? FEEDBACK_TEXT.bugPlaceholder : FEEDBACK_TEXT.ideaPlaceholder;
}

/** `s` broken into lines at most `maxW` wide (words longer than a line are cut). */
export function wrapText(s: string, maxW: number): string[] {
  const lines: string[] = [];
  for (const paragraph of s.split('\n')) {
    let line = '';
    for (const word of paragraph.split(' ')) {
      const next = line ? `${line} ${word}` : word;
      if (measureText(next) <= maxW) {
        line = next;
        continue;
      }
      if (line) lines.push(line);
      line = word;
      while (measureText(line) > maxW) {
        let cut = line.length - 1;
        while (cut > 1 && measureText(line.slice(0, cut)) > maxW) cut--;
        lines.push(line.slice(0, cut));
        line = line.slice(cut);
      }
    }
    lines.push(line);
  }
  return lines;
}

function drawField(r: RenderContext, flow: FeedbackFlow, field: Rect): void {
  const { g } = r;
  g.fillStyle = UI.buttonEdge;
  g.fillRect(field.x, field.y, field.w, field.h);
  g.fillStyle = UI.buttonFace;
  g.fillRect(field.x + 2, field.y + 2, field.w - 4, field.h - 4);
  const rows = Math.max(1, Math.floor((field.h - 2 * FIELD_PAD + 2) / TEXT_LINE));
  if (!flow.text) {
    text(r, feedbackPlaceholder(flow), field.x + FIELD_PAD, field.y + FIELD_PAD, { color: UI.muted });
    return;
  }
  // The last lines, as a textarea scrolled to the caret at the end would show them.
  wrapText(flow.text, field.w - 2 * FIELD_PAD)
    .slice(-rows)
    .forEach((line, i) => text(r, line, field.x + FIELD_PAD, field.y + FIELD_PAD + i * TEXT_LINE, { color: UI.white }));
}

/** A kind button: the chosen one yellow with a bar under its label, the other muted. */
function kindButton(r: RenderContext, rect: Rect, label: string, chosen: boolean, scale: number): void {
  menuButton(r, rect, label, chosen ? UI.yellow : UI.muted, scale);
  if (!chosen) return;
  r.g.fillStyle = UI.yellow;
  r.g.fillRect(rect.x + 4, rect.y + rect.h - 4, rect.w - 8, 2);
}

/** "Fehlerprotokoll mitsenden" with a check box at the left of its label. */
function logToggle(r: RenderContext, l: FeedbackLayout, on: boolean): void {
  const { g } = r;
  const rect = l.log;
  menuButton(r, rect, '');
  const box = l.logBox;
  const x = rect.x + 6;
  const y = rect.y + Math.floor((rect.h - box) / 2);
  g.fillStyle = on ? UI.yellow : UI.muted;
  g.fillRect(x, y, box, box);
  g.fillStyle = UI.buttonFace;
  g.fillRect(x + 1, y + 1, box - 2, box - 2);
  if (on) {
    g.fillStyle = UI.yellow;
    g.fillRect(x + 2, y + 2, box - 4, box - 4);
  }
  const lineH = LABEL_GLYPH * l.logScale + LABEL_LEADING;
  const textY = rect.y + Math.floor((rect.h - l.logLines.length * lineH + LABEL_LEADING) / 2);
  l.logLines.forEach((line, i) =>
    text(r, line, x + box + 3, textY + i * lineH, { color: on ? UI.white : UI.muted, scale: l.logScale }),
  );
}

export function drawFeedback(r: RenderContext, flow: FeedbackFlow, l: FeedbackLayout): void {
  fill(r, UI.ink);
  if (flow.done) {
    centred(r, FEEDBACK_TEXT.sent, l.doneY, { scale: 2, color: UI.yellow });
    menuButton(r, l.ok, FEEDBACK_TEXT.ok, UI.yellow);
    return;
  }
  text(r, FEEDBACK_TEXT.title, l.title.x, l.title.y, { scale: 2, color: UI.yellow });
  kindButton(r, l.bug, FEEDBACK_TEXT.bug, flow.kind === 'bug', l.labelScale);
  kindButton(r, l.idea, FEEDBACK_TEXT.idea, flow.kind === 'idea', l.labelScale);
  drawField(r, flow, l.field);
  const message = flow.message;
  text(r, message ?? FEEDBACK_TEXT.hint, l.line.x, l.line.y, { color: message ? UI.yellow : UI.muted, scale: l.lineScale });
  text(r, flow.counter, l.counter.x + l.counter.w, l.counter.y, { align: 'right', color: UI.muted, scale: l.lineScale });
  if (flow.logShown) logToggle(r, l, flow.withLog);
  menuButton(r, l.cancel, FEEDBACK_TEXT.cancel, UI.white, l.labelScale);
  menuButton(r, l.send, FEEDBACK_TEXT.send, flow.canSend ? UI.yellow : UI.muted, l.labelScale);
}
