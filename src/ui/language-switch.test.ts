import { afterEach, describe, expect, it } from 'vitest';
import { VIEW_H } from '../core/config';
import { measureText } from '../core/font';
import type { Rect } from '../types';
import { feedbackIcon } from './feedback-layout';
import { type Lang, setLanguage, texts } from './i18n';
import { languageSwitch } from './language-switch';
import { buttonPlate, centreX, safeSpan, settingsLayout, uiMetrics } from './layout';
import { logoRect } from './logo';
import { LINE, type MenuLayout, settingsGear, titleHelp, titleKeys, titleLayout } from './menu-layout';
import { titleTrophy } from './score-layout';

afterEach(() => setLanguage('de'));

const VARIANTS = [
  { name: 'desktop', touch: false, portrait: false, widths: [320, 384, 427] },
  { name: 'phone landscape', touch: true, portrait: false, widths: [320, 384, 427] },
  { name: 'phone portrait', touch: true, portrait: true, widths: [320, 360, 390, 427] },
];

function* displays() {
  for (const v of VARIANTS) {
    for (const viewWidth of v.widths) {
      // A cutout at the side only happens in landscape (in portrait it is at the top).
      const sides = v.portrait ? [0] : [0, 12];
      for (const safeInsets of sides.map((left) => ({ top: 0, right: 0, bottom: 0, left }))) {
        yield { label: `${v.name} ${viewWidth} left=${safeInsets.left}`, viewWidth, touch: v.touch, portrait: v.portrait, safeInsets };
      }
    }
  }
}

/** What the title draws where (menu-screens.ts drawTitle): centred lines as wide as their text, the other blocks whole. */
function drawnTitle(l: MenuLayout, d: { viewWidth: number; touch: boolean }): [string, Rect][] {
  const cx = centreX(d.viewWidth);
  const line = (s: string, y: number): Rect => ({ x: cx - Math.ceil(measureText(s) / 2), y, w: measureText(s), h: 8 });
  const t = texts().title;
  const out: [string, Rect][] = [];
  for (const [id, b] of l.blocks) {
    if (id === 'tagline') out.push([id, line(t.tagline, b.y)]);
    else if (id === 'help') titleHelp(d.touch).forEach((s, i) => out.push([`help ${i}`, line(s, b.y + i * LINE)]));
    else if (id === 'keys') out.push([id, line(titleKeys({ feedback: true, settings: true }), b.y)]);
    else if (id === 'records') out.push([id, line(`${t.highscore('1.234.567')}   ** ${t.starsTotal('12.345')}`, b.y)]);
    else out.push([id, b]);
  }
  return out;
}

const overlap = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const LANGS: Lang[] = ['de', 'en'];

describe('the language switch "DE | EN"', () => {
  it('has two tap areas side by side, each at least a HUD tap area, inside the safe span and the view', () => {
    for (const d of displays()) {
      const m = uiMetrics(d);
      const span = safeSpan(d.viewWidth, m);
      for (const at of ['title', 'settings'] as const) {
        const s = languageSwitch(d.viewWidth, m, at);
        expect(s.de.x + s.de.w, d.label).toBeLessThanOrEqual(s.en.x);
        for (const half of [s.de, s.en]) {
          expect(half.w, d.label).toBeGreaterThanOrEqual(m.hit);
          expect(half.h, d.label).toBeGreaterThanOrEqual(m.hit);
          expect(half.x, d.label).toBeGreaterThanOrEqual(span.left);
          expect(half.x + half.w, d.label).toBeLessThanOrEqual(span.right);
          expect(half.y, d.label).toBeGreaterThanOrEqual(0);
          expect(half.y + half.h, d.label).toBeLessThanOrEqual(VIEW_H);
        }
        for (const lang of LANGS) expect(measureText(texts().language[lang], s.scale) + 4, d.label).toBeLessThanOrEqual(s[lang].w);
      }
    }
  });

  it('sits on the title in adult and kid mode, clear of every row, card and icon in both languages', () => {
    for (const lang of LANGS) {
      setLanguage(lang);
      for (const d of displays()) {
        const m = uiMetrics(d);
        for (const adult of [true, false]) {
          for (const reload of [false, true]) {
            const trophy = adult ? titleTrophy(d.viewWidth, true, m) : null;
            const l = titleLayout({ ...d, fullscreenAvailable: true, reload, install: false, settingsButton: adult, feedback: adult, trophy });
            const label = `${lang} ${d.label} adult=${adult} reload=${reload}`;
            const s = l.language!;
            expect(s, label).toBeDefined();
            for (const [id, r] of drawnTitle(l, d)) expect(overlap(r, s.plate), `${label}: ${id}`).toBe(false);
            const icons = [l.buttons.settings, l.buttons.feedback, trophy].filter((r): r is Rect => !!r);
            for (const icon of icons) expect(overlap(buttonPlate(icon, m), s.plate), label).toBe(false);
            expect(overlap(s.plate, logoRect(d.viewWidth)), label).toBe(false);
            if (adult) expect(overlap(s.plate, settingsGear(m)), label).toBe(false);
            expect(overlap(s.plate, feedbackIcon(d.viewWidth, m)), label).toBe(false);
          }
        }
      }
    }
  });

  it('sits in the settings menu clear of its title, buttons and the test device line', () => {
    for (const lang of LANGS) {
      setLanguage(lang);
      for (const d of displays()) {
        const m = uiMetrics(d);
        for (const installable of [false, true]) {
          const l = settingsLayout(d.viewWidth, m, installable);
          const label = `${lang} ${d.label} installable=${installable}`;
          const titleW = measureText(texts().settings.title, 2);
          const title: Rect = { x: centreX(d.viewWidth) - Math.ceil(titleW / 2), y: l.titleY, w: titleW, h: 14 };
          const testScale = l.testDevice.scale;
          const test: Rect = { x: l.testDevice.x, y: l.testDevice.y, w: measureText(texts().settings.testDevice, testScale), h: 7 * testScale };
          for (const r of [title, l.toggle, l.stats, l.privacyLink, l.back, test, ...(l.install ? [l.install] : [])]) {
            expect(overlap(r, l.language.plate), label).toBe(false);
            // The test device line is plain text: it may lie in a tap area, never on the plate.
            if (r !== test) expect(overlap(r, l.language.de) || overlap(r, l.language.en), label).toBe(false);
          }
        }
      }
    }
  });
});
