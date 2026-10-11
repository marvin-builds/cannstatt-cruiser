import { describe, expect, it } from 'vitest';
import type { InstallPlatform, Rect } from '../types';
import { guideLines, guideLineWidth, INSTALL_GUIDE_TEXT, installGuideLayout } from './install-guide';
import { uiMetrics } from './layout';
import { measureText } from '../core/font';

const DEVICES = [
  { touch: false, portrait: false },
  { touch: true, portrait: false },
  { touch: true, portrait: true },
];
const PLATFORMS: InstallPlatform[] = ['android', 'ios', 'other'];
const plain = (p: InstallPlatform) => guideLines(p).map((l) => l.filter((x) => typeof x === 'string').join(''));

describe('install guide (manual steps)', () => {
  it('names the platform way: Android menu, iOS share, desktop address bar', () => {
    expect(guideLines('android')[0]).toContainEqual({ icon: 'menu' });
    expect(plain('android').join(' ')).toMatch(/"App installieren".*"Zum Startbildschirm"/);
    expect(guideLines('ios')[0]).toContainEqual({ icon: 'share' });
    expect(plain('ios').join(' ')).toMatch(/"Zum Home-Bildschirm"/);
    expect(plain('other').join(' ')).toMatch(/Adressleiste/);
  });

  it('every line fits the narrowest view at its scale (2 in portrait) and OK is a full tap target under the text, inside the view', () => {
    for (const d of DEVICES) {
      for (const viewWidth of [320, 427]) {
        for (const p of PLATFORMS) {
          const m = uiMetrics(d);
          const l = installGuideLayout({ viewWidth, ...d }, p);
          expect(l.scale).toBe(d.portrait ? 2 : 1);
          expect(measureText(INSTALL_GUIDE_TEXT.title, 2)).toBeLessThanOrEqual(viewWidth - 8);
          expect(measureText(INSTALL_GUIDE_TEXT.reason, l.scale)).toBeLessThanOrEqual(viewWidth - 8);
          for (const line of guideLines(p)) expect(guideLineWidth(line, l.scale)).toBeLessThanOrEqual(viewWidth - 8);
          const textBottom = l.lines + guideLines(p).length * l.lineH;
          expect(l.reason).toBeGreaterThanOrEqual(l.title + 14);
          expect(l.lines).toBeGreaterThan(l.reason);
          expect(l.ok.y).toBeGreaterThanOrEqual(textBottom);
          expect(l.ok.h).toBeGreaterThanOrEqual(m.menuButtonH);
          expect(l.ok.w).toBeGreaterThanOrEqual(m.menuButtonH);
          const inView = (r: Rect) => r.x >= 0 && r.x + r.w <= viewWidth && r.y + r.h <= 180;
          expect(inView(l.ok)).toBe(true);
        }
      }
    }
  });
});
