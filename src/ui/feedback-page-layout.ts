/**
 * Layout of the feedback dialog's other canvas pages (ROADMAP 70): the
 * "Mein Feedback" list (the tabs and the close button above scrolling
 * two-line rows) and the sub-pages "Das wird gesendet", a report's details and
 * "Das wurde gesendet" ("Zurück" and the headline in the top row, the details
 * add "Ansehen", the text scrolling in one panel). Pure, shared by the
 * hotspots (index.ts) and the drawing (feedback-screen.ts); text pages are
 * rows of wrapped lines with a tone the drawing colours.
 */
import { measureText } from '../core/font';
import type { ReportStatus } from '../net/feedback-reports';
import type { Rect } from '../types';
import type { FeedbackPage } from './feedback-flow';
import { closeRect, dialogColumn, type FeedbackDisplay, labelW, tabRects } from './feedback-layout';
import { FEEDBACK_PAGE_TEXT, type PageSection, type ReportDetail } from './feedback-pages';
import { wrapText } from './wrap-text';
import { SCROLLBAR_W } from './score-layout';

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

export function pageLayout(display: FeedbackDisplay, page: Exclude<FeedbackPage, 'form'>): PageLayout {
  const c = dialogColumn(display);
  const tall = c.h >= 44;
  const scale = tall ? 2 : 1;
  const close = closeRect(c);
  const tabs = tabRects(c, c.big);
  const labelScale = tabs.mineTab.x + tabs.mineTab.w + GAP <= close.x ? c.big : 1;
  const top = c.top + c.h + ROW_GAP;
  const content: Rect = { x: c.x, y: top, w: c.w, h: c.bottom - top };
  const base = { close, content, labelScale, scale, rowH: Math.max(LIST_ROW * scale, c.h), pad: PAD, textW: content.w - 2 * PAD - SCROLLBAR_W * scale - 2 };
  if (page === 'list') return { ...base, ...tabRects(c, labelScale), back: null, title: null, view: null };
  const back: Rect = { x: c.x, y: c.top, w: labelW(FEEDBACK_PAGE_TEXT.back, labelScale, c.m), h: c.h };
  const viewW = labelW(FEEDBACK_PAGE_TEXT.view, labelScale, c.m);
  const view: Rect | null = page === 'detail' ? { x: close.x - GAP - viewW, y: c.top, w: viewW, h: c.h } : null;
  const titleX = back.x + back.w + GAP;
  const titleText = page === 'sent' ? FEEDBACK_PAGE_TEXT.sentTitle : FEEDBACK_PAGE_TEXT.previewTitle;
  const titleScale = page !== 'detail' && titleX + measureText(titleText, c.big) <= close.x - GAP ? c.big : 1;
  const title = page === 'detail' ? null : { x: titleX, y: c.top + Math.floor((c.h - 7 * titleScale) / 2), scale: titleScale };
  return { ...base, newTab: null, mineTab: null, back, title, view };
}

/** List row `i`'s tap area at scroll offset `scroll`, cut to the panel; null while out of sight. */
export function listRowRect(l: PageLayout, i: number, scroll: number): Rect | null {
  const y = l.content.y + i * l.rowH - Math.round(scroll);
  const top = Math.max(y, l.content.y);
  const bottom = Math.min(y + l.rowH, l.content.y + l.content.h);
  return bottom - top > 0 ? { x: l.content.x, y: top, w: l.content.w, h: bottom - top } : null;
}

/** How a text row is drawn: a label, plain text, a muted note, an error log line, a gap, or a status headline. */
export type TextTone = 'label' | 'text' | 'muted' | 'log' | 'space' | ReportStatus;

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
}

/** A text page's rows (preview, sent, detail); none on the list and the form. */
export function pageTextRows(flow: PageSource, l: PageLayout): TextRow[] {
  const items = flow.page === 'detail' ? (flow.detail ? detailItems(flow.detail) : []) : sectionItems(flow.sections);
  return flow.page === 'list' || flow.page === 'form' ? [] : textRows(items, l.textW, l.scale);
}

/** How far the open page scrolls (0 when it all fits). */
export function pageMaxScroll(flow: PageSource, l: PageLayout): number {
  const contentH = flow.page === 'list' ? flow.rows.length * l.rowH : rowsHeight(pageTextRows(flow, l), l.scale) + 2 * l.pad;
  return Math.max(0, contentH - l.content.h);
}
