/**
 * "Neu in dieser Version" (ROADMAP 59): every changelog entry since the
 * last-seen version (core caps them to the newest WHATS_NEW_MAX_ENTRIES) as a
 * scrollable list with a version heading above each entry's items, the
 * headline on top and "Weiter" at the bottom. Pure layout, shared by the
 * hotspots and keys (index.ts) and the drawing (menu-screens.ts). Portrait
 * (about one CSS px per view px) draws the rows at scale 2; long items wrap.
 */
import { VIEW_H } from '../core/config';
import { measureText } from '../core/font';
import type { ChangelogEntry, Rect } from '../types';
import { wrapText } from './wrap-text';
import { centredWidth, centreX, uiMetrics } from './layout';
import { buttonLabelScale, BULLET_W, headline, hudBand, LINE, MENU_TEXT, type MenuInput, type MenuLayout, noButtons } from './menu-layout';
import { SCROLLBAR_W } from './score-layout';

/** 'item' starts an item (with its bullet), 'more' continues a wrapped one, 'heading' names a version. */
export type WhatsNewRowKind = 'heading' | 'item' | 'more';

export interface WhatsNewRow {
  kind: WhatsNewRowKind;
  text: string;
}

export interface WhatsNewList {
  /** The visible rows (clip rect); rows scroll inside it. */
  rect: Rect;
  rows: WhatsNewRow[];
  rowH: number;
  /** Font scale of the rows. */
  scale: number;
  /** Left x of the headings, and of the item text after the bullet. */
  headingX: number;
  itemX: number;
  /** All rows' height, and how far they can scroll. */
  contentH: number;
  maxScroll: number;
}

/** Space between the list's left edge and its text. */
const LIST_PAD = 6;
/** Space between the list and the headline above, "Weiter" below. */
const LIST_GAP = 4;
/** The widest list outside portrait: wider would not read better. */
const LIST_MAX_W = 280;
const BIG_ROW_H = 18;
const NEXT_MIN_W = 80;

/** "Version vom 9.10.2026 (Nr. 2)" for version `2026-10-09.2`. */
export function versionHeading(version: string): string {
  const [year, month, rest] = version.split('-');
  const [day, build] = rest!.split('.');
  return `Version vom ${Number(day)}.${Number(month)}.${year} (Nr. ${build})`;
}

/** The rows of `entries`, each line at most `maxW` view px wide at font `scale`. */
export function whatsNewRows(entries: readonly ChangelogEntry[], maxW: number, scale: number): WhatsNewRow[] {
  const wrap = (s: string) => wrapText(s, Math.floor(maxW / scale));
  const rows: WhatsNewRow[] = [];
  for (const entry of entries) {
    for (const text of wrap(versionHeading(entry.version))) rows.push({ kind: 'heading', text });
    for (const item of entry.items) wrap(item).forEach((text, i) => rows.push({ kind: i === 0 ? 'item' : 'more', text }));
  }
  return rows;
}

/** A scroll offset kept within the list's overflow. */
export function clampScroll(scroll: number, max: number): number {
  return Math.max(0, Math.min(scroll, Math.max(0, max)));
}

/** The screen: headline, the list as one block (and the panel behind it), "Weiter". */
export function whatsNewLayout(input: MenuInput, entries: readonly ChangelogEntry[]): MenuLayout {
  const m = uiMetrics(input);
  const hud = hudBand(input, m, false);
  const title = headline(MENU_TEXT.whatsNew, input, hud.left);
  const nextW = Math.max(NEXT_MIN_W, m.menuButtonH, measureText(MENU_TEXT.next, buttonLabelScale(m)) + 12);
  const next: Rect = { x: centreX(input.viewWidth) - Math.floor(nextW / 2), y: VIEW_H - 2 - m.menuButtonH, w: nextW, h: m.menuButtonH };
  const scale = input.portrait ? 2 : 1;
  const rowH = input.portrait ? BIG_ROW_H : LINE;
  const top = Math.max(title.y + title.h, hud.bottom) + LIST_GAP;
  const w = Math.min(centredWidth(input.viewWidth, m) - 8, input.portrait ? input.viewWidth : LIST_MAX_W);
  const rect: Rect = { x: centreX(input.viewWidth) - Math.floor(w / 2), y: top, w, h: next.y - LIST_GAP - top };
  const headingX = rect.x + LIST_PAD;
  const itemX = headingX + BULLET_W * scale;
  const rows = whatsNewRows(entries, rect.x + rect.w - 2 - SCROLLBAR_W * scale - LIST_PAD - itemX, scale);
  const contentH = rows.length * rowH;
  const buttons = noButtons();
  buttons.next = next;
  return {
    blocks: new Map([
      ['title', title],
      ['list', rect],
      ['next', next],
    ]),
    buttons,
    install: false,
    panel: rect,
    textScale: scale,
    list: { rect, rows, rowH, scale, headingX, itemX, contentH, maxScroll: Math.max(0, contentH - rect.h) },
  };
}

/** The list's scroll offset in view px: moved by drag, wheel and keys, clamped to the overflow every tick. */
export class ListScroll {
  offset = 0;

  by(dy: number): void {
    this.offset = Math.max(0, this.offset + dy);
  }

  clamp(max: number): void {
    this.offset = clampScroll(this.offset, max);
  }

  reset(): void {
    this.offset = 0;
  }
}

/** Arrow keys (and W / S) held on the list: -1 up, 1 down; 0 for other keys. */
export function scrollDirection(code: string): -1 | 0 | 1 {
  if (code === 'ArrowDown' || code === 'KeyS') return 1;
  if (code === 'ArrowUp' || code === 'KeyW') return -1;
  return 0;
}

/** How far a page or jump key scrolls the list (Infinity: to an end), or null for other keys. */
export function pageScroll(code: string, list: { rect: { h: number } }): number | null {
  if (code === 'PageDown') return list.rect.h;
  if (code === 'PageUp') return -list.rect.h;
  if (code === 'End') return Infinity;
  if (code === 'Home') return -Infinity;
  return null;
}

/**
 * The portrait sheet's scroll position after scroll key `code` (a line, a page
 * or to an end, kept within 0..`max`), or null for a key that does not scroll.
 */
export function sheetScrollTo(code: string, offset: number, size: { max: number; line: number; page: number }): number | null {
  const dir = scrollDirection(code);
  const by = dir !== 0 ? dir * size.line : pageScroll(code, { rect: { h: size.page } });
  return by === null ? null : clampScroll(offset + by, size.max);
}
