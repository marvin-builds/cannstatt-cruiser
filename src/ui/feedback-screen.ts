/**
 * Drawing of the feedback dialog (ROADMAP 50, 70) from its layouts
 * (feedback-layout.ts for the "Neu" form, feedback-page-layout.ts for the
 * list and the text pages), the same rects the hotspots use. The typed text
 * is drawn into the field too (the native textarea lies on it in the browser;
 * canvas captures show the drawn copy). Menu screen only, so plain allocation
 * is fine.
 */
import { measureText } from '../core/font';
import type { ReportStatus } from '../net/feedback-reports';
import type { Rect, RenderContext } from '../types';
import { UI } from './art';
import { centred, fill, menuButton, redDot, scrollBar, text } from './draw-kit';
import type { FeedbackFlow } from './feedback-flow';
import { DOT, DOT_ROOM, type FeedbackLayout, feedbackLayout, tabDot } from './feedback-layout';
import { listRowRect, type PageLayout, pageLayout, pageMaxScroll, pageTextRows, pageTitle, rowsHeight, type TextTone } from './feedback-page-layout';
import { type ReportRow, STATUS_COLOR } from './feedback-pages';
import { drawDismiss } from './menu-screens';
import { SCROLLBAR_W } from './score-layout';
import { wrapText } from './wrap-text';
import { texts } from './i18n';

/** Space between the field's edge and the drawn text, and between text lines. */
const FIELD_PAD = 5;
const TEXT_LINE = 9;
/** The log toggle's label lines: glyph height at scale 1 and the unscaled space between lines (as feedbackLayout counts them). */
const LABEL_GLYPH = 7;
const LABEL_LEADING = 2;

const TONE_COLOR: Record<Exclude<TextTone, ReportStatus | 'space'>, string> = { label: UI.teal, text: UI.white, muted: UI.muted, log: UI.muted, message: UI.yellow };

/** The placeholder of the textarea for the chosen kind. */
export function feedbackPlaceholder(flow: Pick<FeedbackFlow, 'kind'>): string {
  return flow.kind === 'bug' ? texts().feedback.bugPlaceholder : texts().feedback.ideaPlaceholder;
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

/** A choice button (kind, tab): the chosen one yellow with a bar under its label, the other muted. */
function choiceButton(r: RenderContext, rect: Rect, label: string, chosen: boolean, scale: number): void {
  menuButton(r, rect, label, chosen ? UI.yellow : UI.muted, scale);
  if (!chosen) return;
  r.g.fillStyle = UI.yellow;
  r.g.fillRect(rect.x + 4, rect.y + rect.h - 4, rect.w - 8, 2);
}

/** The tabs; "Mein Feedback" carries the red dot after its label (in the room the layout left for it). */
function drawTabs(r: RenderContext, flow: FeedbackFlow, newTab: Rect, mineTab: Rect, scale: number): void {
  choiceButton(r, newTab, texts().feedbackPages.newTab, flow.tab === 'new', scale);
  const labelRect = { ...mineTab, w: mineTab.w - DOT_ROOM * scale };
  choiceButton(r, mineTab, '', flow.tab === 'mine', scale);
  text(r, texts().feedbackPages.mineTab, mineTab.x + Math.floor(labelRect.w / 2), mineTab.y + Math.floor((mineTab.h - 7 * scale) / 2), {
    align: 'center',
    color: flow.tab === 'mine' ? UI.yellow : UI.muted,
    scale,
  });
  if (flow.dot) {
    const dot = tabDot(mineTab, scale);
    redDot(r, dot.x, dot.y, dot.w);
  }
}

/** "Fehlerprotokoll mitsenden" with a check box at the left of its label; muted and empty while nothing was recorded. */
function logToggle(r: RenderContext, l: FeedbackLayout, on: boolean, enabled: boolean): void {
  const { g } = r;
  const rect = l.log;
  menuButton(r, rect, '');
  const box = l.logBox;
  const x = rect.x + 6;
  const y = rect.y + Math.floor((rect.h - box) / 2);
  g.fillStyle = on ? UI.yellow : enabled ? UI.muted : UI.empty;
  g.fillRect(x, y, box, box);
  g.fillStyle = UI.buttonFace;
  g.fillRect(x + 1, y + 1, box - 2, box - 2);
  if (on) {
    g.fillStyle = UI.yellow;
    g.fillRect(x + 2, y + 2, box - 4, box - 4);
  }
  const lineH = LABEL_GLYPH * l.logScale + LABEL_LEADING;
  const textY = rect.y + Math.floor((rect.h - l.logLines.length * lineH + LABEL_LEADING) / 2);
  const color = on ? UI.white : enabled ? UI.muted : UI.empty;
  l.logLines.forEach((line, i) => text(r, line, l.logText, textY + i * lineH, { color, scale: l.logScale }));
}

function drawForm(r: RenderContext, flow: FeedbackFlow, l: FeedbackLayout): void {
  drawTabs(r, flow, l.newTab, l.mineTab, l.labelScale);
  drawDismiss(r, l.close);
  choiceButton(r, l.bug, texts().feedback.bug, flow.kind === 'bug', l.labelScale);
  choiceButton(r, l.idea, texts().feedback.idea, flow.kind === 'idea', l.labelScale);
  drawField(r, flow, l.field);
  const message = flow.message;
  text(r, message ?? texts().feedback.hint, l.line.x, l.line.y, { color: message ? UI.yellow : UI.muted, scale: l.lineScale });
  text(r, flow.counter, l.counter.x + l.counter.w, l.counter.y, { align: 'right', color: UI.muted, scale: l.lineScale });
  if (flow.logShown) logToggle(r, l, flow.withLog && flow.logAvailable, flow.logAvailable);
  menuButton(r, l.view, texts().feedbackPages.view, UI.white, l.labelScale);
  menuButton(r, l.send, texts().feedback.send, flow.canSend ? UI.yellow : UI.muted, l.labelScale);
}

/** A 1 px frame just inside `rect`. */
function outline(r: RenderContext, rect: Rect, color: string): void {
  const { g } = r;
  g.fillStyle = color;
  g.fillRect(rect.x, rect.y, rect.w, 1);
  g.fillRect(rect.x, rect.y + rect.h - 1, rect.w, 1);
  g.fillRect(rect.x, rect.y, 1, rect.h);
  g.fillRect(rect.x + rect.w - 1, rect.y, 1, rect.h);
}

/** The panel behind a scrolling page, clipped while `inside` draws. */
function panel(r: RenderContext, rect: Rect, inside: () => void): void {
  const { g } = r;
  g.fillStyle = UI.panel;
  g.fillRect(rect.x, rect.y, rect.w, rect.h);
  g.save();
  g.beginPath();
  g.rect(rect.x, rect.y, rect.w, rect.h);
  g.clip();
  inside();
  g.restore();
}

/** `s` cut with "..." to at most `maxW` px at `scale`. */
function fitLine(s: string, maxW: number, scale: number): string {
  if (measureText(s, scale) <= maxW) return s;
  let cut = s;
  while (cut && measureText(`${cut}...`, scale) > maxW) cut = cut.slice(0, -1);
  return `${cut.trimEnd()}...`;
}

/** One "Mein Feedback" row: status in its colour, kind and date; the start of the text under it; a dot when it changed. */
function drawRow(r: RenderContext, row: ReportRow, l: PageLayout, y: number): void {
  const { scale, pad } = l;
  const lineH = 9 * scale;
  const top = y + Math.floor((l.rowH - lineH - 7 * scale) / 2);
  const x = l.content.x + pad;
  const dotW = row.changed ? (DOT + 2) * scale : 0;
  // The report just sent (ROADMAP 75): a yellow frame around its row.
  if (row.fresh) outline(r, { x: l.content.x + 1, y: y + 1, w: l.content.w - 2 - SCROLLBAR_W * scale, h: l.rowH - 2 }, UI.yellow);
  if (row.changed) redDot(r, x, top + 2 * scale, DOT * scale);
  text(r, row.label, x + dotW, top, { color: STATUS_COLOR[row.status], scale });
  const meta = `${row.kind}  ${row.day}`;
  text(r, meta, x + dotW + measureText(`${row.label}  `, scale), top, { color: UI.muted, scale });
  text(r, fitLine(row.text, l.textW, scale), x, top + lineH, { color: UI.white, scale });
  r.g.fillStyle = UI.ink;
  r.g.fillRect(l.content.x + 2, y + l.rowH - 1, l.content.w - 4, 1);
}

function drawList(r: RenderContext, flow: FeedbackFlow, l: PageLayout): void {
  drawTabs(r, flow, l.newTab!, l.mineTab!, l.labelScale);
  drawDismiss(r, l.close);
  if (l.note) text(r, l.note.text, l.note.x, l.note.y, { align: 'center', color: UI.yellow, scale: l.note.scale });
  const rows = flow.rows;
  if (rows.length === 0) {
    panel(r, l.content, () => {});
    const lines = wrapText(texts().feedbackPages.empty, Math.floor(l.textW / l.scale));
    lines.forEach((line, i) => centred(r, line, l.content.y + Math.floor(l.content.h / 2) - 4 * l.scale + i * 9 * l.scale, { color: UI.muted, scale: l.scale }));
    return;
  }
  const offset = Math.round(flow.scroll);
  panel(r, l.content, () =>
    rows.forEach((row, i) => {
      if (listRowRect(l, i, offset)) drawRow(r, row, l, l.content.y + i * l.rowH - offset);
    }),
  );
  const contentH = rows.length * l.rowH;
  if (contentH > l.content.h) scrollBar(r, l.content, contentH, offset, SCROLLBAR_W * l.scale);
}

/** "Das wird gesendet", a report's details, "Das wurde gesendet", "Wirklich löschen?": "Zurück", the headline, the text in its panel, the buttons under it. */
function drawTextPage(r: RenderContext, flow: FeedbackFlow, l: PageLayout): void {
  menuButton(r, l.back!, texts().feedbackPages.back, UI.white, l.labelScale);
  drawDismiss(r, l.close);
  if (l.view) menuButton(r, l.view, texts().feedbackPages.view, UI.white, l.labelScale);
  if (l.del) menuButton(r, l.del, texts().feedbackPages.delete, UI.white, l.labelScale);
  if (l.no) menuButton(r, l.no, texts().feedbackPages.cancel, UI.white, l.labelScale);
  if (l.yes) menuButton(r, l.yes, texts().feedbackPages.confirmYes, flow.deleteState === 'deleting' ? UI.muted : UI.red, l.labelScale);
  const title = pageTitle(flow.page);
  if (l.title && title) text(r, title, l.title.x, l.title.y, { color: UI.yellow, scale: l.title.scale });
  const rows = pageTextRows(flow, l);
  const offset = Math.round(flow.scroll);
  const x = l.content.x + l.pad;
  panel(r, l.content, () =>
    rows.forEach((row) => {
      const y = l.content.y + l.pad + row.y - offset;
      if (y + 9 * l.scale < l.content.y || y > l.content.y + l.content.h) return;
      const color = row.tone in STATUS_COLOR ? STATUS_COLOR[row.tone as ReportStatus] : TONE_COLOR[row.tone as keyof typeof TONE_COLOR];
      text(r, row.text, x, y, { color, scale: l.scale });
    }),
  );
  if (pageMaxScroll(flow, l) > 0) scrollBar(r, l.content, rowsHeight(rows, l.scale) + 2 * l.pad, offset, SCROLLBAR_W * l.scale);
}

/** The dialog's open page. */
export function drawFeedback(r: RenderContext, flow: FeedbackFlow): void {
  fill(r, UI.ink);
  if (flow.page === 'form') drawForm(r, flow, feedbackLayout(r.display));
  else if (flow.page === 'list') drawList(r, flow, pageLayout(r.display, 'list', flow.listNote));
  else drawTextPage(r, flow, pageLayout(r.display, flow.page));
}
