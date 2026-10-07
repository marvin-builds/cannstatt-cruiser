import { describe, expect, it } from 'vitest';
import type { Rect } from '../types';
import { blinkOn, buttonPlate, centreX, formatNumber, hudButtons, metres, rightAnchor, settingsLayout, uiMetrics } from './layout';
import { LOGO_Y, logoRect } from './logo';

const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const inside = (r: Rect, w: number, h = 180) => r.x >= 0 && r.y >= 0 && r.x + r.w <= w && r.y + r.h <= h;
const whole = (r: Rect) => [r.x, r.y, r.w, r.h].every(Number.isInteger);

/** CSS px per view px: ~1 on a phone in portrait, ~2 in landscape (see docs/ARCHITECTURE.md, View size). */
const DEVICES = [
  { name: 'desktop', display: { touch: false, portrait: false }, cssPerPx: 4 },
  { name: 'phone landscape', display: { touch: true, portrait: false }, cssPerPx: 2 },
  { name: 'phone portrait', display: { touch: true, portrait: true }, cssPerPx: 1 },
] as const;
const WIDTHS = [320, 360, 390, 422, 427];
/** The HUD stats plate never gets wider than this (7-digit score plus combo). */
const STATS_PLATE_RIGHT = 120;

describe('layout helpers', () => {
  it('anchors to the right edge of the adaptive view', () => {
    expect(rightAnchor(320, 14, 4)).toBe(302);
    expect(rightAnchor(427, 14, 4)).toBe(409);
  });

  it('centres on whole pixels', () => {
    expect(centreX(320)).toBe(160);
    expect(centreX(427)).toBe(213);
  });

  it('lays the buttons out right to left, pause outermost, all inside the view', () => {
    for (const width of [320, 360, 427]) {
      const b = hudButtons(width, true);
      expect(b.pause.x + b.pause.w).toBeLessThanOrEqual(width - 2);
      expect(b.mute.x + b.mute.w).toBeLessThan(b.pause.x);
      expect(b.fullscreen!.x + b.fullscreen!.w).toBeLessThan(b.mute.x);
      for (const r of [b.pause, b.mute, b.fullscreen!]) {
        expect(Number.isInteger(r.x) && Number.isInteger(r.y)).toBe(true);
        expect(r.w).toBeGreaterThanOrEqual(14);
      }
    }
  });

  for (const { name, display, cssPerPx } of DEVICES) {
    it(`${name}: HUD buttons are big enough to tap, inside the view and clear of the stats plate`, () => {
      const m = uiMetrics(display);
      for (const width of WIDTHS) {
        const b = hudButtons(width, true, m);
        const rects = [b.pause, b.mute, b.fullscreen!];
        for (const r of rects) {
          expect(inside(r, width), `${name} ${width}`).toBe(true);
          expect(whole(r)).toBe(true);
          expect(r.x).toBeGreaterThan(STATS_PLATE_RIGHT);
          if (display.touch) expect(Math.min(r.w, r.h) * cssPerPx).toBeGreaterThanOrEqual(44);
          const plate = buttonPlate(r, m);
          expect(whole(plate)).toBe(true);
          expect(plate.x >= r.x && plate.y >= r.y && plate.x + plate.w <= r.x + r.w && plate.y + plate.h <= r.y + r.h).toBe(true);
          expect(plate.w).toBe(m.plate);
        }
        expect(overlaps(b.pause, b.mute) || overlaps(b.mute, b.fullscreen!) || overlaps(b.pause, b.fullscreen!)).toBe(false);
      }
    });

    it(`${name}: settings buttons are big enough to tap, inside the view and apart`, () => {
      const m = uiMetrics(display);
      for (const width of WIDTHS) {
        const l = settingsLayout(width, m);
        const menu = [l.toggle, l.back];
        const check = [...l.answers, l.back];
        for (const r of [...menu, ...check]) {
          expect(inside(r, width), `${name} ${width}`).toBe(true);
          expect(whole(r)).toBe(true);
          expect(Math.min(r.w, r.h) * cssPerPx).toBeGreaterThanOrEqual(44);
        }
        for (const group of [menu, check]) {
          group.forEach((a, i) => group.slice(i + 1).forEach((b) => expect(overlaps(a, b)).toBe(false)));
        }
      }
    });
  }

  it('desktop keeps the small buttons', () => {
    const b = hudButtons(320, true, uiMetrics({ touch: false, portrait: false }));
    expect(b.pause).toEqual({ x: 302, y: 4, w: 14, h: 14 });
  });

  it('the logo hotspot covers the centred wordmark at the top', () => {
    for (const width of WIDTHS) {
      const r = logoRect(width);
      expect(r.y).toBe(LOGO_Y);
      expect(r.x + r.w / 2).toBeCloseTo(centreX(width), -0.5);
      expect(r.w).toBeGreaterThan(100);
      expect(r.h).toBeGreaterThan(40);
      expect(inside(r, width)).toBe(true);
    }
  });

  it('omits the fullscreen button where unsupported', () => {
    expect(hudButtons(320, false).fullscreen).toBeNull();
  });

  it('formats numbers with German thousands separators', () => {
    expect(formatNumber(0)).toBe('0');
    expect(formatNumber(1234567)).toBe('1.234.567');
    expect(formatNumber(999.7)).toBe('999');
  });

  it('converts view pixels to whole metres', () => {
    expect(metres(0)).toBe(0);
    expect(metres(1234)).toBe(123);
  });

  it('blinks with a fixed period', () => {
    expect(blinkOn(0)).toBe(true);
    expect(blinkOn(0.6)).toBe(false);
    expect(blinkOn(1.0)).toBe(true);
  });
});
