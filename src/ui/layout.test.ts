import { describe, expect, it } from 'vitest';
import { measureText } from '../core/font';
import type { Rect } from '../types';
import { blinkOn, iconOnPlate, popupScale, buttonPlate, centreX, fitCentred, formatNumber, POPUP_MARGIN, popupLeft, hudButtons, metres, rightAnchor, settingsLayout, TEST_DEVICE_LABEL, uiMetrics } from './layout';
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
  it('centres an icon exactly on its plate: an odd icon (the 9x9 gear) gets an odd plate where the HUD plate is even', () => {
    for (const d of DEVICES) {
      const m = uiMetrics(d.display);
      const hit = { x: m.margin, y: m.margin, w: m.hit, h: m.hit };
      for (const size of [8, 9]) {
        const { plate, icon } = iconOnPlate(hit, m, size);
        const drawn = size * m.iconScale;
        expect(icon.x - plate.x).toBe(plate.x + plate.w - (icon.x + drawn));
        expect(icon.y - plate.y).toBe(plate.y + plate.h - (icon.y + drawn));
        expect(Math.abs(plate.w - m.plate)).toBeLessThanOrEqual(1);
        expect(plate.x).toBeGreaterThanOrEqual(0);
        expect(plate.y).toBeGreaterThanOrEqual(0);
        // 8x8 icons keep their plate and place.
        if (size === 8) expect(plate).toEqual(buttonPlate(hit, m));
      }
    }
  });

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
        const menu = [l.toggle, l.stats, l.back];
        for (const r of menu) {
          expect(inside(r, width), `${name} ${width}`).toBe(true);
          expect(whole(r)).toBe(true);
          expect(Math.min(r.w, r.h) * cssPerPx).toBeGreaterThanOrEqual(44);
        }
        expect(overlaps(l.toggle, l.back) || overlaps(l.toggle, l.stats) || overlaps(l.stats, l.back)).toBe(false);
      }
    });

    it(`${name}: the "Datenschutz" link sits right of the statistics switch, tappable, inside the view and apart`, () => {
      const m = uiMetrics(display);
      for (const width of WIDTHS) {
        const l = settingsLayout(width, m);
        const at = `${name} ${width}`;
        expect(inside(l.privacyLink, width) && whole(l.privacyLink), at).toBe(true);
        expect(l.privacyLink.y, at).toBe(l.stats.y);
        expect(l.privacyLink.h, at).toBe(l.stats.h);
        expect(l.privacyLink.x, at).toBeGreaterThan(l.stats.x + l.stats.w);
        expect(Math.min(l.privacyLink.w, l.privacyLink.h) * cssPerPx, at).toBeGreaterThanOrEqual(44);
        for (const r of [l.toggle, l.stats, l.back]) expect(overlaps(l.privacyLink, r), at).toBe(false);
      }
    });
    it(`${name}: the plain "Testgerät" line (ROADMAP 55) sits inside the view, clear of the title, buttons and notes`, () => {
      const m = uiMetrics(display);
      for (const width of WIDTHS) {
        const l = settingsLayout(width, m);
        const at = `${name} ${width}`;
        const t = l.testDevice;
        const line: Rect = { x: t.x, y: t.y, w: measureText(TEST_DEVICE_LABEL, t.scale), h: 7 * t.scale };
        expect(inside(line, width) && whole(line), `${at} ${JSON.stringify(line)}`).toBe(true);
        const titleW = measureText('Einstellungen', 2);
        const title: Rect = { x: centreX(width) - Math.ceil(titleW / 2), y: l.titleY, w: titleW, h: 14 };
        const noteRow = (y: number): Rect => ({ x: 0, y, w: width, h: 7 * l.noteScale });
        const keys = l.keysY === null ? [] : [noteRow(l.keysY)];
        for (const r of [title, l.toggle, l.stats, l.privacyLink, l.back, noteRow(l.kidNoteY), noteRow(l.statsNoteY), ...keys]) {
          expect(overlaps(line, r), `${at} vs ${JSON.stringify(r)}`).toBe(false);
        }
        // Readable for the owner: as big as the notes.
        expect(t.scale, at).toBe(l.noteScale);
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

  it('without the pause button the others move flush right (title, game over)', () => {
    for (const { display } of DEVICES) {
      const m = uiMetrics(display);
      const withPause = hudButtons(390, true, m);
      const without = hudButtons(390, true, m, false);
      expect(without.mute).toEqual(withPause.pause);
      expect(without.fullscreen).toEqual(withPause.mute);
    }
  });

  it('settings in portrait (about 1 CSS px per view px): Zurück beside the title, notes and the link at 2x, all inside the view', () => {
    const m = uiMetrics({ touch: true, portrait: true });
    for (const width of WIDTHS) {
      const l = settingsLayout(width, m);
      const at = `portrait ${width}`;
      const titleW = measureText('Einstellungen', 2);
      expect(l.noteScale, at).toBe(2);
      expect(l.back.y, at).toBe(0);
      expect(l.back.x + l.back.w, at).toBe(width);
      expect(Math.abs(l.titleY + 7 - (l.back.y + l.back.h / 2)), `${at}: title centred with Zurück`).toBeLessThanOrEqual(1);
      expect(centreX(width) + Math.ceil(titleW / 2), `${at}: title left of Zurück`).toBeLessThanOrEqual(l.back.x - 2);
      expect(l.toggle.y, at).toBeGreaterThanOrEqual(l.back.y + l.back.h);
      expect(l.kidNoteY + 14, at).toBeLessThanOrEqual(l.stats.y);
      expect(l.statsNoteY + 14, at).toBeLessThanOrEqual(180);
      expect(l.stats.w, at).toBeGreaterThanOrEqual(measureText('Anonyme Statistik: AUS', 2) + 8);
      expect(l.privacyLink.w, at).toBeGreaterThanOrEqual(measureText('Datenschutz', 2) + 8);
      for (const r of [l.toggle, l.stats, l.privacyLink, l.back]) expect(inside(r, width), `${at} ${JSON.stringify(r)}`).toBe(true);
    }
  });

  it('settings: title, Kindermodus and its note, the statistics switch and its note, key hint, Zurück stacked top down', () => {
    for (const { display } of DEVICES.filter((d) => !d.display.portrait)) {
      const m = uiMetrics(display);
      const l = settingsLayout(390, m);
      const line = 7;
      expect(l.titleY + 14).toBeLessThanOrEqual(l.toggle.y);
      expect(l.kidNoteY).toBeGreaterThanOrEqual(l.toggle.y + l.toggle.h);
      expect(l.kidNoteY + line).toBeLessThanOrEqual(l.stats.y);
      expect(l.statsNoteY).toBeGreaterThanOrEqual(l.stats.y + l.stats.h);
      expect(l.keysY !== null).toBe(!display.touch);
      const lastLine = l.keysY ?? l.statsNoteY;
      if (l.keysY !== null) expect(l.statsNoteY + line).toBeLessThanOrEqual(l.keysY);
      expect(lastLine + line).toBeLessThanOrEqual(l.back.y);
      expect(l.back.y + l.back.h).toBeLessThanOrEqual(180);
    }
  });

  it('settings: "App installieren" only while installable, a full tap target inside the view, clear of everything else (ROADMAP 68)', () => {
    for (const { name, display, cssPerPx } of DEVICES) {
      const m = uiMetrics(display);
      for (const width of WIDTHS) {
        const at = `${name} ${width}`;
        expect(settingsLayout(width, m).install, at).toBeNull();
        const l = settingsLayout(width, m, true);
        const button = l.install!;
        expect(inside(button, width) && whole(button), `${at} ${JSON.stringify(button)}`).toBe(true);
        expect(button.w, at).toBeGreaterThanOrEqual(measureText('App installieren', m.menuButtonH >= 24 ? 2 : 1) + 8);
        expect(Math.min(button.w, button.h) * cssPerPx, at).toBeGreaterThanOrEqual(44);
        const titleW = measureText('Einstellungen', 2);
        const title: Rect = { x: centreX(width) - Math.ceil(titleW / 2), y: l.titleY, w: titleW, h: 14 };
        const noteRow = (y: number): Rect => ({ x: 0, y, w: width, h: 7 * l.noteScale });
        const keys = l.keysY === null ? [] : [noteRow(l.keysY)];
        const t = l.testDevice;
        const testDevice: Rect = { x: t.x, y: t.y, w: measureText(TEST_DEVICE_LABEL, t.scale), h: 7 * t.scale };
        for (const r of [title, l.toggle, l.stats, l.privacyLink, l.back, noteRow(l.kidNoteY), noteRow(l.statsNoteY), testDevice, ...keys]) {
          expect(overlaps(button, r), `${at} vs ${JSON.stringify(r)}`).toBe(false);
        }
        for (const r of [l.toggle, l.stats, l.privacyLink, l.back]) expect(inside(r, width), at).toBe(true);
        expect(l.toggle.w, at).toBeGreaterThanOrEqual(measureText('Kindermodus: AUS', m.menuButtonH >= 24 ? 2 : 1) + 8);
      }
    }
  });

  it('draws popups twice as big in portrait and for catches', () => {
    expect(popupScale({ portrait: false }, false)).toBe(1);
    expect(popupScale({ portrait: false }, true)).toBe(2);
    expect(popupScale({ portrait: true }, false)).toBe(2);
  });

  it('fits centred text left of an obstacle on the right', () => {
    // Fits centred in the view: stays centred.
    expect(fitCentred(100, 320, 280)).toBe(160);
    // Would run under the obstacle: centred in the free space left of it instead.
    expect(fitCentred(220, 390, 302)).toBe(151);
    // Never closer than 2 px to the left edge.
    expect(fitCentred(300, 320, 300)).toBe(152);
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

describe('popup placement', () => {
  it('centres a popup on its spot when it fits', () => {
    expect(popupLeft(64, 40, 320)).toBe(44);
  });

  it('keeps every popup at least 4 px from both edges at every view width', () => {
    expect(POPUP_MARGIN).toBeGreaterThanOrEqual(4);
    for (const viewWidth of [320, 384, 427]) {
      for (const w of [10, 60, 120, 240, viewWidth - 2 * POPUP_MARGIN]) {
        for (const cx of [0, 64, 160, viewWidth - 10, viewWidth]) {
          const left = popupLeft(cx, w, viewWidth);
          expect(left).toBeGreaterThanOrEqual(POPUP_MARGIN);
          expect(left + w).toBeLessThanOrEqual(viewWidth - POPUP_MARGIN);
        }
      }
    }
  });

  it('keeps popups clear of display cutouts (ROADMAP 75)', () => {
    const m = uiMetrics({ touch: true, portrait: false, safeInsets: { top: 0, right: 20, bottom: 0, left: 20 } });
    expect(popupLeft(64, 120, 320, m)).toBe(20 + POPUP_MARGIN);
    expect(popupLeft(300, 60, 320, m)).toBe(320 - 20 - POPUP_MARGIN - 60);
    expect(popupLeft(160, 40, 320, m)).toBe(140);
  });

  it('a popup wider than the view keeps the left margin', () => {
    expect(popupLeft(64, 400, 320)).toBe(POPUP_MARGIN);
  });
});
