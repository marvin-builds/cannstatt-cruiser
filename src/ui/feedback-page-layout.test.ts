import { describe, expect, it } from 'vitest';
import { VIEW_H } from '../core/config';
import { measureText } from '../core/font';
import type { Rect } from '../types';
import { FEEDBACK_PAGE_TEXT, type PageSection } from './feedback-pages';
import { detailItems, listRowRect, pageLayout, sectionItems, textRows } from './feedback-page-layout';

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
});
