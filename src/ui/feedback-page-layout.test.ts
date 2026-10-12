import { describe, expect, it } from 'vitest';
import { VIEW_H } from '../core/config';
import { measureText } from '../core/font';
import type { Rect } from '../types';
import { FEEDBACK_TEXT } from './feedback-flow';
import { FEEDBACK_PAGE_TEXT, type PageSection } from './feedback-pages';
import { confirmItems, detailItems, listRowRect, pageLayout, sectionItems, textRows } from './feedback-page-layout';

const DISPLAYS = [
  { label: 'desktop 320', viewWidth: 320, touch: false, portrait: false },
  { label: 'desktop 427', viewWidth: 427, touch: false, portrait: false },
  { label: 'phone landscape 320', viewWidth: 320, touch: true, portrait: false },
  { label: 'phone landscape 422', viewWidth: 422, touch: true, portrait: false },
];

const overlap = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const inside = (r: Rect, w: number) => r.x >= 0 && r.y >= 0 && r.x + r.w <= w && r.y + r.h <= VIEW_H;

describe('feedback dialog pages', () => {
  it('the list keeps the tabs and the close button above its rows', () => {
    for (const d of DISPLAYS) {
      const l = pageLayout(d, 'list');
      expect(l.back, d.label).toBeNull();
      const parts = [l.newTab!, l.mineTab!, l.close, l.content];
      for (const r of parts) expect(inside(r, d.viewWidth), d.label).toBe(true);
      parts.forEach((a, i) => parts.slice(i + 1).forEach((b) => expect(overlap(a, b), d.label).toBe(false)));
      expect(l.rowH, d.label).toBeGreaterThanOrEqual(d.touch ? 24 : 18);
      expect(l.content.h, d.label).toBeGreaterThanOrEqual(4 * l.rowH);
    }
  });

  it('after sending or deleting, the note sits between the tabs and the rows, whole and centred (ROADMAP 75, 78)', () => {
    for (const d of DISPLAYS) for (const text of [FEEDBACK_TEXT.sent, FEEDBACK_PAGE_TEXT.deleted]) {
      const plain = pageLayout(d, 'list');
      const l = pageLayout(d, 'list', text);
      const thanks = l.note!;
      expect(plain.note, d.label).toBeNull();
      expect(thanks.text, d.label).toBe(text);
      const w = measureText(text, thanks.scale);
      expect(thanks.y, d.label).toBeGreaterThanOrEqual(l.newTab!.y + l.newTab!.h);
      expect(thanks.y + 7 * thanks.scale, d.label).toBeLessThanOrEqual(l.content.y);
      expect(Math.abs(thanks.x - (l.content.x + l.content.w / 2)), d.label).toBeLessThanOrEqual(1);
      expect(w, d.label).toBeLessThanOrEqual(l.content.w);
      expect(l.content.y + l.content.h, d.label).toBe(plain.content.y + plain.content.h);
      expect(l.content.h, d.label).toBeGreaterThanOrEqual(3 * l.rowH);
    }
  });

  it('sub-pages have "Zurück" and their headline in the top row; the details add "Ansehen"', () => {
    for (const d of DISPLAYS) {
      for (const page of ['preview', 'detail', 'sent'] as const) {
        const l = pageLayout(d, page);
        expect(l.newTab, d.label).toBeNull();
        const parts = [l.back!, l.close, l.content, ...(l.view ? [l.view] : [])];
        for (const r of parts) expect(inside(r, d.viewWidth), `${d.label} ${page}`).toBe(true);
        parts.forEach((a, i) => parts.slice(i + 1).forEach((b) => expect(overlap(a, b), `${d.label} ${page}`).toBe(false)));
        expect(!!l.view, `${d.label} ${page}`).toBe(page === 'detail');
        const title = page === 'sent' ? FEEDBACK_PAGE_TEXT.sentTitle : FEEDBACK_PAGE_TEXT.previewTitle;
        if (page !== 'detail') expect(l.title!.x + measureText(title, l.title!.scale), `${d.label} ${page}`).toBeLessThanOrEqual(l.close.x);
      }
    }
  });

  it('the details have "Löschen" in a bottom row under the panel (ROADMAP 78)', () => {
    for (const d of DISPLAYS) {
      const l = pageLayout(d, 'detail');
      const parts = [l.back!, l.view!, l.close, l.content, l.del!];
      for (const r of parts) expect(inside(r, d.viewWidth), d.label).toBe(true);
      parts.forEach((a, i) => parts.slice(i + 1).forEach((b) => expect(overlap(a, b), d.label).toBe(false)));
      expect(l.del!.h, d.label).toBeGreaterThanOrEqual(d.touch ? 24 : 18);
      expect(measureText(FEEDBACK_PAGE_TEXT.delete, l.labelScale), d.label).toBeLessThanOrEqual(l.del!.w);
      expect([l.yes, l.no], d.label).toEqual([null, null]);
      expect(pageLayout(d, 'sent').del, d.label).toBeNull();
    }
  });

  it('"Wirklich löschen?" heads the confirm, with "Abbrechen" and "Ja, löschen" under its panel (ROADMAP 78)', () => {
    for (const d of DISPLAYS) {
      const l = pageLayout(d, 'confirm');
      const parts = [l.back!, l.close, l.content, l.no!, l.yes!];
      for (const r of parts) expect(inside(r, d.viewWidth), d.label).toBe(true);
      parts.forEach((a, i) => parts.slice(i + 1).forEach((b) => expect(overlap(a, b), d.label).toBe(false)));
      expect(l.no!.x, d.label).toBeLessThan(l.yes!.x);
      expect(measureText(FEEDBACK_PAGE_TEXT.confirmYes, l.labelScale), d.label).toBeLessThanOrEqual(l.yes!.w);
      expect(l.title!.x + measureText(FEEDBACK_PAGE_TEXT.confirmTitle, l.title!.scale), d.label).toBeLessThanOrEqual(l.close.x);
      expect([l.view, l.del], d.label).toEqual([null, null]);
    }
  });

  it('list rows scroll inside the list: a row out of sight has no tap area, a cut one only its visible part', () => {
    const l = pageLayout(DISPLAYS[2]!, 'list');
    expect(listRowRect(l, 0, 0)).toMatchObject({ y: l.content.y, h: l.rowH });
    expect(listRowRect(l, 0, l.rowH)).toBeNull();
    const cut = listRowRect(l, 0, Math.floor(l.rowH / 2))!;
    expect(cut.y).toBe(l.content.y);
    expect(cut.h).toBe(l.rowH - Math.floor(l.rowH / 2));
    expect(listRowRect(l, 40, 0)).toBeNull();
  });
});

describe('text pages', () => {
  const SECTIONS: PageSection[] = [
    { label: 'Text', lines: ['Wort '.repeat(40).trim()], log: false },
    { label: 'Fehlerprotokoll', lines: ['error: ' + 'x'.repeat(190), 'state: mode title'], log: true },
    { label: null, lines: [FEEDBACK_PAGE_TEXT.notIncluded], log: false },
  ];

  it('wraps every line to the width, labels and log lines in their own tone', () => {
    for (const scale of [1, 2]) {
      const rows = textRows(sectionItems(SECTIONS), 200, scale);
      for (const row of rows) expect(measureText(row.text, scale), row.text).toBeLessThanOrEqual(200);
      expect(rows[0]).toMatchObject({ text: 'Text', tone: 'label', y: 0 });
      expect(rows.filter((r) => r.tone === 'log').map((r) => r.text).join('').replace(/ /g, '')).toBe(('error: ' + 'x'.repeat(190) + 'state: mode title').replace(/ /g, ''));
      expect(rows.at(-1)!.tone).toBe('muted');
      const ys = rows.map((r) => r.y);
      expect([...ys].sort((a, b) => a - b)).toEqual(ys);
    }
  });

  it('the details: status headline in its colour, the reply, the text and the sent line', () => {
    const items = detailItems({ status: 'done', headline: 'Umgesetzt in Version 2026-10-12.1', reply: 'Antwort: „Danke!“', text: 'Mehr Brezeln', sent: 'Gesendet am 11.10.2026 mit: Idee' });
    expect(items.map((i) => [i.tone, i.text])).toEqual([
      ['done', 'Umgesetzt in Version 2026-10-12.1'],
      ['text', 'Antwort: „Danke!“'],
      ['space', ''],
      ['text', 'Mehr Brezeln'],
      ['space', ''],
      ['muted', 'Gesendet am 11.10.2026 mit: Idee'],
    ]);
    expect(detailItems({ status: 'open', headline: 'Offen', reply: null, text: 't', sent: 's' }).map((i) => i.tone)).toEqual(['open', 'space', 'text', 'space', 'muted']);
  });

  it('the confirm: the delete\'s status first (when any), what deleting means, the report\'s text', () => {
    const d = { status: 'open' as const, headline: 'Offen', reply: null, text: 'Mehr Brezeln', sent: 's' };
    expect(confirmItems(d, null).map((i) => [i.tone, i.text])).toEqual([
      ['text', FEEDBACK_PAGE_TEXT.confirmHint],
      ['space', ''],
      ['muted', 'Mehr Brezeln'],
    ]);
    expect(confirmItems(d, FEEDBACK_PAGE_TEXT.deleteFailed)[0]).toEqual({ text: FEEDBACK_PAGE_TEXT.deleteFailed, tone: 'message' });
  });
});
