import { describe, expect, it } from 'vitest';
import { VIEW_H } from '../core/config';
import { measureText } from '../core/font';
import type { Rect } from '../types';
import { buttonPlate, hudButtons, uiMetrics } from './layout';
import { logoRect } from './logo';
import { titleLayout } from './menu-layout';
import { scoreEntryLayout, scoreListLayout, titleTrophy } from './score-layout';

const VARIANTS = [
  { name: 'desktop', touch: false, portrait: false, cssPerPx: 4, widths: [320, 360, 427] },
  { name: 'phone landscape', touch: true, portrait: false, cssPerPx: 2, widths: [320, 384, 422, 427] },
  { name: 'phone portrait', touch: true, portrait: true, cssPerPx: 1, widths: [320, 360, 390, 427] },
] as const;

const overlap = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const inside = (r: Rect, w: number) => r.x >= 0 && r.y >= 0 && r.x + r.w <= w && r.y + r.h <= VIEW_H;
const whole = (r: Rect) => [r.x, r.y, r.w, r.h].every(Number.isInteger);

function* cases() {
  for (const v of VARIANTS) for (const viewWidth of v.widths) yield { ...v, viewWidth, label: `${v.name} ${viewWidth}` };
}

describe('title trophy button', () => {
  it('sits in the top-right button row, as big as the other buttons, clear of the logo and the title panel', () => {
    for (const c of cases()) {
      for (const fullscreen of [true, false]) {
        const label = `${c.label} fs=${fullscreen}`;
        const m = uiMetrics(c);
        const t = titleTrophy(c.viewWidth, fullscreen, m);
        const row = hudButtons(c.viewWidth, fullscreen, m, false);
        expect(inside(t, c.viewWidth) && whole(t), label).toBe(true);
        expect(t.w, label).toBe(m.hit);
        expect(t.h, label).toBe(m.hit);
        if (c.touch) expect(t.w * c.cssPerPx, label).toBeGreaterThanOrEqual(44);
        for (const b of [row.mute, row.fullscreen]) if (b) expect(overlap(t, b), label).toBe(false);
        const plate = buttonPlate(t, m);
        expect(overlap(plate, logoRect(c.viewWidth)), `${label}: logo`).toBe(false);
        const panel = titleLayout({ ...c, fullscreenAvailable: fullscreen, reload: false, install: false }).panel!;
        expect(overlap(plate, panel), `${label}: panel`).toBe(false);
        expect(t.x, `${label}: right half`).toBeGreaterThan(c.viewWidth / 2);
      }
    }
  });

  it('joins the row left of the other buttons where the logo leaves room', () => {
    const m = uiMetrics({ touch: false, portrait: false });
    const row = hudButtons(320, true, m, false);
    expect(titleTrophy(320, true, m)).toEqual({ ...row.fullscreen!, x: row.fullscreen!.x - m.hit - m.gap });
  });
});

describe('Bestenliste layout', () => {
  it('fits the close button, title, rows and notes at every width', () => {
    for (const c of cases()) {
      for (const message of [false, true]) {
        const label = `${c.label} message=${message}`;
        const m = uiMetrics(c);
        const l = scoreListLayout(c, 20, message);
        for (const r of [l.close, l.title, l.list, l.stats]) expect(inside(r, c.viewWidth) && whole(r), `${label} ${JSON.stringify(r)}`).toBe(true);
        for (const r of [l.close, l.title, l.list]) expect(overlap(l.stats, r), `${label}: stats switch`).toBe(false);
        expect(l.stats.h, label).toBeGreaterThanOrEqual(m.menuButtonH);
        if (c.touch) expect(l.stats.h * c.cssPerPx, label).toBeGreaterThanOrEqual(44);
        if (!c.portrait) expect(l.stats.x, `${label}: stats switch top left`).toBeLessThan(8);
        expect(inside(l.privacyLink, c.viewWidth) && whole(l.privacyLink), `${label}: privacy link`).toBe(true);
        for (const r of [l.close, l.title, l.list, l.stats]) expect(overlap(l.privacyLink, r), `${label}: privacy link`).toBe(false);
        expect(l.privacyLink.y, `${label}: privacy link beside the switch`).toBe(l.stats.y);
        expect(l.privacyLink.h, label).toBe(l.stats.h);
        expect(l.privacyLink.x, label).toBeGreaterThan(l.stats.x + l.stats.w);
        if (c.touch) expect(l.privacyLink.w * c.cssPerPx, label).toBeGreaterThanOrEqual(44);
        if (!c.portrait) {
          expect(l.title.x, `${label}: title right of the link`).toBeGreaterThan(l.privacyLink.x + l.privacyLink.w);
          const viewCentred = Math.abs(l.title.x + l.title.w / 2 - c.viewWidth / 2) <= 1;
          const gapLeft = l.title.x - (l.privacyLink.x + l.privacyLink.w);
          const gapRight = l.close.x - (l.title.x + l.title.w);
          if (!viewCentred) expect(Math.abs(gapLeft - gapRight), `${label}: title centred between link and close`).toBeLessThanOrEqual(1);
        }
        expect(l.close.w, label).toBeGreaterThanOrEqual(m.menuButtonH);
        expect(l.close.h, label).toBeGreaterThanOrEqual(m.menuButtonH);
        if (c.touch) expect(l.close.h * c.cssPerPx, label).toBeGreaterThanOrEqual(44);
        expect(l.close.x + l.close.w, `${label}: close top right`).toBeGreaterThan(c.viewWidth - 6);
        expect(overlap(l.title, l.close), label).toBe(false);
        expect(overlap(l.list, l.close), label).toBe(false);
        expect(l.list.y, label).toBeGreaterThanOrEqual(l.title.y + l.title.h);
        const lines = [l.messageY, l.privacyY, l.statsNoteY, l.keysY].filter((y): y is number => y !== null);
        for (const y of lines) expect(y, label).toBeGreaterThanOrEqual(l.list.y + l.list.h);
        expect(Math.max(...lines) + 7 * l.noteScale, label).toBeLessThanOrEqual(c.portrait ? l.stats.y : VIEW_H);
        expect(l.messageY !== null, label).toBe(message);
        expect(l.keysY !== null, label).toBe(!c.touch);
        expect(l.rankRight < l.nameX && l.nameX < l.scoreRight && l.scoreRight <= l.list.x + l.list.w, label).toBe(true);
      }
    }
  });

  it('phone portrait (about 1 CSS px per view px): the switch and link in a bottom row, notes at 2x, the title centred beside the close button', () => {
    for (const c of cases()) {
      const l = scoreListLayout(c, 20, true);
      expect(l.noteScale, c.label).toBe(c.portrait ? 2 : 1);
      if (!c.portrait) continue;
      expect(l.stats.y + l.stats.h, c.label).toBe(VIEW_H);
      expect(l.stats.w, `${c.label}: room for the switch label at 2x`).toBeGreaterThanOrEqual(measureText('Anonyme Statistik: AUS', 2) + 8);
      expect(l.privacyLink.w, `${c.label}: room for "Datenschutz" at 2x`).toBeGreaterThanOrEqual(measureText('Datenschutz', 2) + 8);
      expect(Math.abs(l.title.y + l.title.h / 2 - (l.close.y + l.close.h / 2)), `${c.label}: title centred with close`).toBeLessThanOrEqual(1);
      expect(l.list.y, c.label).toBeGreaterThanOrEqual(l.close.y + l.close.h);
    }
  });

  it('20 rows scroll on phones (portrait: big text), a short list does not', () => {
    for (const c of cases()) {
      const l = scoreListLayout(c, 20, false);
      expect(l.rowH * 20, c.label).toBe(l.contentH);
      expect(l.maxScroll, c.label).toBe(Math.max(0, l.contentH - l.list.h));
      if (c.touch) expect(l.maxScroll, c.label).toBeGreaterThan(0);
      expect(l.textScale, c.label).toBe(c.portrait ? 2 : 1);
      expect(scoreListLayout(c, 3, false).maxScroll, c.label).toBe(0);
    }
  });
});

describe('name entry layout', () => {
  it('fits title, field, buttons and message without overlap, touch sized', () => {
    for (const c of cases()) {
      const { label } = c;
      const m = uiMetrics(c);
      const l = scoreEntryLayout(c);
      const rects: [string, Rect][] = [
        ['close', l.close],
        ['title', l.title],
        ['field', l.field],
        ['submit', l.submit],
      ];
      for (const [id, r] of rects) expect(inside(r, c.viewWidth) && whole(r), `${label} ${id} ${JSON.stringify(r)}`).toBe(true);
      rects.forEach(([id, a], i) => {
        for (const [other, b] of rects.slice(i + 1)) expect(overlap(a, b), `${label}: ${id} vs ${other}`).toBe(false);
      });
      for (const r of [l.close, l.field, l.submit]) {
        expect(r.h, label).toBeGreaterThanOrEqual(m.menuButtonH);
        if (c.touch) expect(r.h * c.cssPerPx, label).toBeGreaterThanOrEqual(44);
      }
      expect(l.field.w, `${label}: room for 16 characters`).toBeGreaterThanOrEqual(120);
      expect(l.messageY, label).toBeGreaterThanOrEqual(l.submit.y + l.submit.h);
      expect(l.messageY + 7 * l.textScale, label).toBeLessThanOrEqual(VIEW_H);
      expect(l.promptY + 7, label).toBeLessThanOrEqual(l.field.y);
      expect(l.keysY !== null, label).toBe(!c.touch);
      if (l.keysY !== null) expect(l.keysY, label).toBeGreaterThanOrEqual(l.messageY + 7 * l.textScale);
    }
  });
});
