import { describe, expect, it } from 'vitest';
import { measureText } from '../core/font';
import type { Rect } from '../types';
import { kidNoticeLayout, kidNoticeLines, KID_NOTICE_TITLE } from './kid-notice';
import { uiMetrics } from './layout';

const overlap = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

const DEVICES = [
  { touch: false, portrait: false },
  { touch: true, portrait: false },
  { touch: true, portrait: true },
];

describe('kid mode notice', () => {
  it('names the way back: the logo on touch, K on the keyboard', () => {
    expect(kidNoticeLines(true).join(' ')).toMatch(/Logo 3 Sekunden halten/);
    expect(kidNoticeLines(false).join(' ')).toMatch(/K 3 Sekunden halten/);
  });

  it('switched on in the pause menu, it also says the run restarts (as the menu did), and OK moves down for that line', () => {
    expect(kidNoticeLines(true, true)).toEqual([...kidNoticeLines(true), 'Lauf wird neu gestartet']);
    expect(kidNoticeLines(false, false)).toHaveLength(2);
    for (const d of DEVICES) {
      const plain = kidNoticeLayout({ viewWidth: 320, ...d });
      const restart = kidNoticeLayout({ viewWidth: 320, ...d }, true);
      expect(restart.ok.y).toBe(plain.ok.y + plain.lineH);
    }
  });

  it('every text fits the narrowest view (big font in portrait) and OK is a full tap target under the text, all devices', () => {
    for (const d of DEVICES) {
      for (const [viewWidth, restart] of [[320, false], [427, false], [320, true], [427, true]] as const) {
        const m = uiMetrics(d);
        const l = kidNoticeLayout({ viewWidth, ...d }, restart);
        expect(l.scale).toBe(d.portrait ? 2 : 1);
        expect(measureText(KID_NOTICE_TITLE, 2)).toBeLessThanOrEqual(viewWidth - 8);
        for (const s of kidNoticeLines(d.touch, restart)) expect(measureText(s, l.scale)).toBeLessThanOrEqual(viewWidth - 8);
        const textBottom = l.lines + kidNoticeLines(d.touch, restart).length * l.lineH;
        expect(l.title + 14).toBeLessThanOrEqual(l.lines);
        expect(l.ok.y).toBeGreaterThanOrEqual(textBottom);
        expect(l.ok.h).toBeGreaterThanOrEqual(m.menuButtonH);
        expect(l.ok.w).toBeGreaterThanOrEqual(m.menuButtonH);
        expect(l.ok.x + l.ok.w).toBeLessThanOrEqual(viewWidth);
        expect(l.ok.y + l.ok.h).toBeLessThanOrEqual(180);
        expect(overlap(l.ok, { x: 0, y: 0, w: viewWidth, h: l.title })).toBe(false);
      }
    }
  });
});
