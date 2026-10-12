import { describe, expect, it } from 'vitest';
import { VIEW_H } from '../core/config';
import { measureText } from '../core/font';
import type { Rect } from '../types';
import { FEEDBACK_TEXT } from './feedback-flow';
import { DOT_ROOM, feedbackIcon, feedbackLayout, tabDot } from './feedback-layout';
import { FEEDBACK_PAGE_TEXT } from './feedback-pages';
import { uiMetrics } from './layout';

const VARIANTS = [
  { name: 'desktop', touch: false, portrait: false, widths: [320, 360, 427] },
  { name: 'phone landscape', touch: true, portrait: false, widths: [320, 384, 422, 427] },
  { name: 'phone portrait', touch: true, portrait: true, widths: [320, 360, 390, 427] },
];

function* displays() {
  for (const v of VARIANTS) for (const viewWidth of v.widths) yield { label: `${v.name} ${viewWidth}`, viewWidth, touch: v.touch, portrait: v.portrait };
}

const overlap = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const inside = (r: Rect, w: number) => r.x >= 0 && r.y >= 0 && r.x + r.w <= w && r.y + r.h <= VIEW_H;
/** Landscape canvas forms; portrait shows the full-screen sheet (feedback-sheet.ts), its canvas form is only a fallback. */
const landscape = () => [...displays()].filter((d) => !d.portrait);

describe('feedback screen layout', () => {
  it('fits the form with its tabs inside the view without overlaps, at 320 px and in portrait', () => {
    for (const d of displays()) {
      const l = feedbackLayout(d);
      const parts: [string, Rect][] = [
        ['newTab', l.newTab],
        ['mineTab', l.mineTab],
        ['close', l.close],
        ['bug', l.bug],
        ['idea', l.idea],
        ['field', l.field],
        ['line', l.line],
        ['counter', l.counter],
        ['log', l.log],
        ['view', l.view],
        ['send', l.send],
      ];
      for (const [id, r] of parts) expect(inside(r, d.viewWidth), `${d.label}: ${id} ${JSON.stringify(r)} inside`).toBe(true);
      parts.forEach(([a, ra], i) => {
        for (const [b, rb] of parts.slice(i + 1)) expect(overlap(ra, rb), `${d.label}: ${a} vs ${b}`).toBe(false);
      });
    }
  });

  it('gives every button a touch-sized tap area on phones', () => {
    for (const d of displays()) {
      const l = feedbackLayout(d);
      const h = uiMetrics(d).menuButtonH;
      for (const r of [l.newTab, l.mineTab, l.close, l.bug, l.idea, l.log, l.view, l.send]) {
        expect(r.h, d.label).toBeGreaterThanOrEqual(h);
        expect(r.w, d.label).toBeGreaterThanOrEqual(h);
      }
    }
  });

  it('the tabs start the top row, the close button ends it; "Ansehen" sits right of the log toggle or left of "Senden"', () => {
    for (const d of displays()) {
      const l = feedbackLayout(d);
      expect(l.mineTab.x, d.label).toBeGreaterThan(l.newTab.x);
      expect([l.newTab.y, l.mineTab.y, l.close.y], d.label).toEqual([l.newTab.y, l.newTab.y, l.newTab.y]);
      expect(l.close.x + l.close.w, d.label).toBeGreaterThanOrEqual(Math.min(d.viewWidth - 4, (d.viewWidth + 340) / 2) - 1);
      if (l.view.y === l.log.y) expect(l.view.x, d.label).toBeGreaterThan(l.log.x + l.log.w - 1);
      else expect([l.view.y, l.view.x + l.view.w], d.label).toEqual([l.send.y, l.send.x - 4]);
      expect(l.field.y, d.label).toBeGreaterThan(l.newTab.y + l.newTab.h - 1);
    }
  });

  it('labels fit their buttons and the text field has room for a few lines', () => {
    for (const d of landscape()) {
      const l = feedbackLayout(d);
      const fits = (label: string, r: Rect, scale: number) => expect(measureText(label, scale), `${d.label}: ${label}`).toBeLessThanOrEqual(r.w - 4);
      fits(FEEDBACK_TEXT.bug, l.bug, l.labelScale);
      fits(FEEDBACK_TEXT.idea, l.idea, l.labelScale);
      fits(FEEDBACK_TEXT.send, l.send, l.labelScale);
      fits(FEEDBACK_PAGE_TEXT.view, l.view, l.labelScale);
      fits(FEEDBACK_PAGE_TEXT.newTab, l.newTab, l.labelScale);
      expect(measureText(FEEDBACK_PAGE_TEXT.mineTab, l.labelScale) + DOT_ROOM * l.labelScale, d.label).toBeLessThanOrEqual(l.mineTab.w - 4);
      expect(l.logLines, d.label).toEqual([FEEDBACK_TEXT.log]);
      const labelW = Math.max(...l.logLines.map((s) => measureText(s, l.logScale)));
      expect(l.logText + labelW + 4, d.label).toBeLessThanOrEqual(l.log.x + l.log.w);
      expect(l.logLines.length * 7 * l.logScale + (l.logLines.length - 1) * 2, d.label).toBeLessThanOrEqual(l.log.h - 4);
      expect(l.field.h, d.label).toBeGreaterThanOrEqual(60);
    }
  });

  it('the status line fits the longest message, the counter fits its rect', () => {
    for (const d of landscape()) {
      const l = feedbackLayout(d);
      const longest = Math.max(...[FEEDBACK_TEXT.hint, FEEDBACK_TEXT.offline, FEEDBACK_TEXT.rate, FEEDBACK_TEXT.invalid, FEEDBACK_TEXT.short].map((s) => measureText(s, l.lineScale)));
      expect(longest, d.label).toBeLessThanOrEqual(l.line.w);
      expect(measureText('500/500', l.lineScale), d.label).toBeLessThanOrEqual(l.counter.w);
      expect(l.line.h, d.label).toBe(7 * l.lineScale);
    }
  });

  it('the log toggle\'s box keeps room to its label: at least 2 label pixels', () => {
    for (const d of displays()) {
      const l = feedbackLayout(d);
      const boxRight = l.log.x + 6 + l.logBox;
      expect(l.logText - boxRight, d.label).toBeGreaterThanOrEqual(2 * l.logScale);
    }
  });

  it('the red tab dot keeps clear of the label and of the tab border', () => {
    for (const d of displays()) {
      const l = feedbackLayout(d);
      const s = l.labelScale;
      const dot = tabDot(l.mineTab, s);
      const labelRight = l.mineTab.x + Math.floor((l.mineTab.w - DOT_ROOM * s) / 2) + Math.ceil(measureText(FEEDBACK_PAGE_TEXT.mineTab, s) / 2);
      // The dot has a 1 px ink outline; the button border is 2 px wide.
      expect(dot.x - 1 - labelRight, d.label).toBeGreaterThanOrEqual(s);
      expect(l.mineTab.x + l.mineTab.w - 2 - (dot.x + dot.w + 1), d.label).toBeGreaterThanOrEqual(s);
      expect(dot.y - 1 - (l.mineTab.y + 2), d.label).toBeGreaterThanOrEqual(1);
    }
  });

  it('phone landscape at 320 px wide keeps the big labels and the whole log label: the kinds and "Ansehen" move beside "Senden"', () => {
    const l = feedbackLayout({ viewWidth: 320, touch: true, portrait: false });
    expect(l.labelScale).toBe(2);
    expect(l.bug.y).toBe(l.send.y);
    expect(l.view.y).toBe(l.send.y);
    expect(l.view.x).toBeGreaterThan(l.idea.x + l.idea.w);
    expect(l.logLines).toEqual(['Fehlerprotokoll mitsenden']);
    expect(l.logScale).toBe(2);
    const wide = feedbackLayout({ viewWidth: 427, touch: true, portrait: false });
    expect(wide.bug.y).toBe(wide.newTab.y);
    const desktop = feedbackLayout({ viewWidth: 320, touch: false, portrait: false });
    expect([desktop.bug.y, desktop.log.y]).toEqual([desktop.newTab.y, desktop.send.y]);
  });

  it('phone portrait (about 1 CSS px per view px): every small text is drawn at least 2x', () => {
    for (const d of displays()) {
      if (!d.portrait) continue;
      const l = feedbackLayout(d);
      expect(l.lineScale, d.label).toBeGreaterThanOrEqual(2);
      expect(l.logScale, d.label).toBeGreaterThanOrEqual(2);
      expect(l.labelScale, d.label).toBeGreaterThanOrEqual(2);
    }
  });

  it('phone landscape: the log toggle label has the scale of the other button labels', () => {
    for (const d of displays()) {
      if (!d.touch || d.portrait) continue;
      const l = feedbackLayout(d);
      expect(l.logScale, d.label).toBe(l.labelScale);
      expect(l.labelScale, d.label).toBe(2);
    }
  });

  it('the title icon sits in the bottom-right corner, one HUD tap area big', () => {
    for (const d of displays()) {
      const m = uiMetrics(d);
      const icon = feedbackIcon(d.viewWidth, m);
      expect(icon).toEqual({ x: d.viewWidth - m.margin - m.hit, y: VIEW_H - m.margin - m.hit, w: m.hit, h: m.hit });
    }
  });
});
