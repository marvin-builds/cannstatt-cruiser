/**
 * Layout of the feedback dialog's other canvas pages (ROADMAP 70): the
 * "Mein Feedback" list (the tabs and the close button above scrolling
 * two-line rows, right after sending or deleting with a note between them) and the sub-pages "Das wird gesendet", a report's details,
 * "Das wurde gesendet" and "Wirklich löschen?" ("Zurück" and the headline in the top row, the details
 * add "Ansehen", the text scrolling in one panel; the details have "Löschen" under the panel, the
 * confirm "Abbrechen" and "Ja, löschen"). Pure, shared by the
 * hotspots (index.ts) and the drawing (feedback-screen.ts); text pages are
 * rows of wrapped lines with a tone the drawing colours.
 */
import { measureText } from '../core/font';
import type { ReportStatus } from '../net/feedback-reports';
import type { Rect } from '../types';
import type { FeedbackPage } from './feedback-flow';
import { closeRect, dialogColumn, type FeedbackDisplay, labelW, tabRects } from './feedback-layout';
import type { PageSection, ReportDetail } from './feedback-pages';
import { wrapText } from './wrap-text';
import { SCROLLBAR_W } from './score-layout';
import { texts } from './i18n';

export interface PageLayout {
  /** The tabs (list page), else null. */
  newTab: Rect | null;
  mineTab: Rect | null;
  /** "Zurück" (sub-pages), else null. */
  back: Rect | null;
  /** The sub-page's headline (top-left of its text, its scale), else null. */
  title: { x: number; y: number; scale: number } | null;
  /** "Ansehen" (a report's details), else null. */
  view: Rect | null;
  /** "Löschen" (a report's details), else null. */
  del: Rect | null;
  /** "Ja, löschen" and "Abbrechen" (the confirm), else null. */
  yes: Rect | null;
  no: Rect | null;
  /** The note over the list (the thanks after sending, "Feedback gelöscht"): its text, centre x, top and scale, else null. */
  note: { text: string; x: number; y: number; scale: number } | null;
  close: Rect;
  /** The scrolling panel. */
  content: Rect;
  /** Font scale of the buttons' labels and of the content text. */
  labelScale: number;
  scale: number;
  /** A list row's height. */
  rowH: number;
  /** Space between the panel's edge and its text; the text's width. */
  pad: number;
  textW: number;
}

const GAP = 4;
const ROW_GAP = 3;
const PAD = 5;
/** A text row: the glyph and the space under it (scale 1). */
const TEXT_ROW = 9;
/** A list row: two text lines and some air (scale 1). */
const LIST_ROW = 20;
const SPACE = 5;
/** Font cell height at scale 1. */
const GLYPH_H = 7;

/** A sub-page's headline in the top row (none on the details). */
export function pageTitle(page: FeedbackPage): string | null {
  const t = texts().feedbackPages;
  return page === 'preview' ? t.previewTitle : page === 'sent' ? t.sentTitle : page === 'confirm' ? t.confirmTitle : null;
}

/** `note`: the list page right after sending or deleting (ROADMAP 75, 78) puts it above its rows. */
export function pageLayout(display: FeedbackDisplay, page: Exclude<FeedbackPage, 'form'>, note: string | null = null): PageLayout {
  const c = dialogColumn(display);
  const tall = c.h >= 44;
  const scale = tall ? 2 : 1;
  const close = closeRect(c);
  const tabs = tabRects(c, c.big);
  const labelScale = tabs.mineTab.x + tabs.mineTab.w + GAP <= close.x ? c.big : 1;
  const below = c.top + c.h + ROW_GAP;
  const noteText = page === 'list' ? note : null;
  const noteScale = noteText !== null && measureText(noteText, c.big) <= c.w ? c.big : 1;
  const noteAt = noteText !== null ? { text: noteText, x: c.x + Math.floor(c.w / 2), y: below, scale: noteScale } : null;
  const top = noteAt ? below + GLYPH_H * noteScale + ROW_GAP : below;
  // The details and the confirm keep a row of buttons under the panel.
  const bottomRow = page === 'detail' || page === 'confirm' ? c.bottom - c.h : null;
  const content: Rect = { x: c.x, y: top, w: c.w, h: (bottomRow === null ? c.bottom : bottomRow - ROW_GAP) - top };
  const base = { close, content, labelScale, scale, rowH: Math.max(LIST_ROW * scale, c.h), pad: PAD, textW: content.w - 2 * PAD - SCROLLBAR_W * scale - 2 };
  const none = { del: null, yes: null, no: null };
  if (page === 'list') return { ...base, ...none, ...tabRects(c, labelScale), back: null, title: null, view: null, note: noteAt };
  const button = (label: string, x: number, y: number): Rect => ({ x, y, w: labelW(label, labelScale, c.m), h: c.h });
  const back = button(texts().feedbackPages.back, c.x, c.top);
  const viewW = labelW(texts().feedbackPages.view, labelScale, c.m);
  const view: Rect | null = page === 'detail' ? { x: close.x - GAP - viewW, y: c.top, w: viewW, h: c.h } : null;
  const titleX = back.x + back.w + GAP;
  const titleText = pageTitle(page);
  const titleScale = titleText !== null && titleX + measureText(titleText, c.big) <= close.x - GAP ? c.big : 1;
  const title = titleText === null ? null : { x: titleX, y: c.top + Math.floor((c.h - 7 * titleScale) / 2), scale: titleScale };
  const del = page === 'detail' ? button(texts().feedbackPages.delete, c.x, bottomRow!) : null;
  const yesW = labelW(texts().feedbackPages.confirmYes, labelScale, c.m);
  const yes = page === 'confirm' ? button(texts().feedbackPages.confirmYes, c.right - yesW, bottomRow!) : null;
  const no = page === 'confirm' ? button(texts().feedbackPages.cancel, c.x, bottomRow!) : null;
  return { ...base, newTab: null, mineTab: null, back, title, view, del, yes, no, note: null };
}

/** List row `i`'s tap area at scroll offset `scroll`, cut to the panel; null while out of sight. */
export function listRowRect(l: PageLayout, i: number, scroll: number): Rect | null {
  const y = l.content.y + i * l.rowH - Math.round(scroll);
  const top = Math.max(y, l.content.y);
  const bottom = Math.min(y + l.rowH, l.content.y + l.content.h);
  return bottom - top > 0 ? { x: l.content.x, y: top, w: l.content.w, h: bottom - top } : null;
}

/** How a text row is drawn: a label, plain text, a muted note, an error log line, a gap, a status message, or a status headline. */
export type TextTone = 'label' | 'text' | 'muted' | 'log' | 'space' | 'message' | ReportStatus;

export interface TextItem {
  text: string;
  tone: TextTone;
}

export interface TextRow extends TextItem {
  /** Top of the row from the top of the content (px). */
  y: number;
}

const space: TextItem = { text: '', tone: 'space' };

/** "Das wird gesendet" / "Das wurde gesendet": each section's label over its lines, a gap between sections. */
export function sectionItems(sections: readonly PageSection[]): TextItem[] {
  return sections.flatMap((s, i) => [
    ...(i > 0 ? [space] : []),
    ...(s.label ? [{ text: s.label, tone: 'label' as const }] : []),
    ...s.lines.map((text) => ({ text, tone: s.log ? ('log' as const) : s.label ? ('text' as const) : ('muted' as const) })),
  ]);
}

/** A report's details: the status headline in its colour, the reply, the text, what it was sent with. */
export function detailItems(d: ReportDetail): TextItem[] {
  return [
    { text: d.headline, tone: d.status },
    ...(d.reply ? [{ text: d.reply, tone: 'text' as const }] : []),
    space,
    { text: d.text, tone: 'text' },
    space,
    { text: d.sent, tone: 'muted' },
  ];
}

/** "Wirklich löschen?": the delete's status (deleting, or why it failed), what deleting means, the report's text. */
export function confirmItems(d: ReportDetail, message: string | null): TextItem[] {
  return [...(message ? [{ text: message, tone: 'message' as const }, space] : []), { text: texts().feedbackPages.confirmHint, tone: 'text' }, space, { text: d.text, tone: 'muted' }];
}

/** The items wrapped into rows at most `maxW` px wide at font `scale`, each with its top. */
export function textRows(items: readonly TextItem[], maxW: number, scale: number): TextRow[] {
  const rows: TextRow[] = [];
  let y = 0;
  for (const item of items) {
    if (item.tone === 'space') {
      y += SPACE * scale;
      continue;
    }
    for (const text of wrapText(item.text, Math.floor(maxW / scale))) {
      rows.push({ text, tone: item.tone, y });
      y += TEXT_ROW * scale;
    }
  }
  return rows;
}

/** The height of `rows` (their last row's bottom). */
export const rowsHeight = (rows: readonly TextRow[], scale: number): number => (rows.length ? rows.at(-1)!.y + TEXT_ROW * scale : 0);

/** What a page shows, from the flow. */
interface PageSource {
  page: FeedbackPage;
  sections: PageSection[];
  detail: ReportDetail | null;
  rows: readonly unknown[];
  deleteMessage: string | null;
}

function pageItems(flow: PageSource): TextItem[] {
  if (flow.page === 'detail') return flow.detail ? detailItems(flow.detail) : [];
  if (flow.page === 'confirm') return flow.detail ? confirmItems(flow.detail, flow.deleteMessage) : [];
  return sectionItems(flow.sections);
}

/** A text page's rows (preview, sent, detail, confirm); none on the list and the form. */
export function pageTextRows(flow: PageSource, l: PageLayout): TextRow[] {
  const items = pageItems(flow);
  return flow.page === 'list' || flow.page === 'form' ? [] : textRows(items, l.textW, l.scale);
}

/** How far the open page scrolls (0 when it all fits). */
export function pageMaxScroll(flow: PageSource, l: PageLayout): number {
  const contentH = flow.page === 'list' ? flow.rows.length * l.rowH : rowsHeight(pageTextRows(flow, l), l.scale) + 2 * l.pad;
  return Math.max(0, contentH - l.content.h);
}
