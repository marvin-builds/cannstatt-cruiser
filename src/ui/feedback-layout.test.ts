import { describe, expect, it } from 'vitest';
import { VIEW_H } from '../core/config';
import { measureText } from '../core/font';
import type { Rect } from '../types';
import { FEEDBACK_TEXT } from './feedback-flow';
import { feedbackIcon, feedbackLayout } from './feedback-layout';
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

describe('feedback screen layout', () => {
  it('fits the form inside the view without overlaps, at 320 px and in portrait', () => {
    for (const d of displays()) {
      const l = feedbackLayout(d);
      const line: Rect = { x: l.field.x, y: l.lineY, w: l.field.w, h: 7 * l.lineScale };
      const parts: [string, Rect][] = [
        ['title', l.title],
        ['bug', l.bug],
        ['idea', l.idea],
        ['field', l.field],
        ['line', line],
        ['log', l.log],
        ['cancel', l.cancel],
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
      for (const r of [l.bug, l.idea, l.log, l.cancel, l.send, l.ok]) {
        expect(r.h, d.label).toBeGreaterThanOrEqual(h);
        expect(r.w, d.label).toBeGreaterThanOrEqual(h);
      }
    }
  });

  it('labels fit their buttons and the text field has room for a few lines', () => {
    for (const d of displays()) {
      const l = feedbackLayout(d);
      const fits = (label: string, r: Rect, scale: number) => expect(measureText(label, scale), `${d.label}: ${label}`).toBeLessThanOrEqual(r.w - 4);
      fits(FEEDBACK_TEXT.bug, l.bug, l.labelScale);
      fits(FEEDBACK_TEXT.idea, l.idea, l.labelScale);
      fits(FEEDBACK_TEXT.send, l.send, l.labelScale);
      fits(FEEDBACK_TEXT.cancel, l.cancel, l.labelScale);
      expect(measureText(FEEDBACK_TEXT.log, l.logScale) + l.logBox + 4, d.label).toBeLessThanOrEqual(l.log.w);
      expect(l.field.h, d.label).toBeGreaterThanOrEqual(60);
    }
  });

  it('the status line fits the longest message and the counter beside it', () => {
    for (const d of displays()) {
      const l = feedbackLayout(d);
      const longest = Math.max(...[FEEDBACK_TEXT.hint, FEEDBACK_TEXT.offline, FEEDBACK_TEXT.rate, FEEDBACK_TEXT.invalid, FEEDBACK_TEXT.short].map((s) => measureText(s, 1)));
      expect(longest + 6 + measureText('500/500', 1), d.label).toBeLessThanOrEqual(l.field.w);
    }
  });

  it('the thank-you state: its line and OK inside the view, OK centred', () => {
    for (const d of displays()) {
      const l = feedbackLayout(d);
      expect(inside(l.ok, d.viewWidth), d.label).toBe(true);
      expect(l.doneY + 14, d.label).toBeLessThanOrEqual(l.ok.y);
      expect(Math.abs(l.ok.x + l.ok.w / 2 - d.viewWidth / 2), d.label).toBeLessThanOrEqual(1);
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
