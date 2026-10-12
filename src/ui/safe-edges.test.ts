import { describe, expect, it } from 'vitest';
import { NO_INSETS } from '../core/safe-area';
import type { Rect, SafeInsets } from '../types';
import { feedbackIcon } from './feedback-layout';
import { itemButtonRect } from './item-button';
import { hudButtons, safeSpan, uiMetrics } from './layout';
import { gameOverLayout, type MenuInput, pauseLayout, settingsGear, titleLayout } from './menu-layout';
import { closeButton, titleTrophy } from './score-layout';
import { statsLayout } from './stats';

/** A punch-hole camera on the left (Pixel 10 Pro in landscape) and one on each side (40 CSS px = 20 view px). */
const CUTOUTS: SafeInsets[] = [
  { top: 0, right: 0, bottom: 0, left: 20 },
  { top: 0, right: 20, bottom: 0, left: 0 },
  { top: 0, right: 20, bottom: 0, left: 20 },
];
const WIDTHS = [320, 360, 384, 422, 427];
/** CSS px per view px in phone landscape. */
const CSS_PER_PX = 2;

const landscape = (viewWidth: number, safeInsets: SafeInsets) => ({ viewWidth, touch: true, portrait: false, safeInsets });
const menuInput = (viewWidth: number, safeInsets: SafeInsets): MenuInput => ({
  ...landscape(viewWidth, safeInsets),
  fullscreenAvailable: true,
  reload: true,
  install: true,
  settingsButton: true,
  feedback: true,
});
const within = (r: Rect, span: { left: number; right: number }) => r.x >= span.left && r.x + r.w <= span.right;

describe('safe edges (ROADMAP 75)', () => {
  it('without insets the metrics are the plain device metrics, the same object every time', () => {
    const plain = uiMetrics({ touch: true, portrait: false });
    expect(uiMetrics({ touch: true, portrait: false, safeInsets: NO_INSETS })).toBe(plain);
    expect(plain.safeLeft).toBe(0);
    expect(plain.safeRight).toBe(0);
    expect(safeSpan(422, plain)).toEqual({ left: 0, right: 422 });
  });

  it('keeps one metrics object per inset pair (layout caches compare by identity)', () => {
    const a = uiMetrics(landscape(422, CUTOUTS[2]));
    expect(uiMetrics(landscape(400, { ...CUTOUTS[2], top: 5 }))).toBe(a);
    expect(a).toMatchObject({ safeLeft: 20, safeRight: 20, hit: uiMetrics({ touch: true, portrait: false }).hit });
  });

  it('the safe span is the view less the left and right insets', () => {
    expect(safeSpan(422, uiMetrics(landscape(422, CUTOUTS[0])))).toEqual({ left: 20, right: 422 });
    expect(safeSpan(422, uiMetrics(landscape(422, CUTOUTS[2])))).toEqual({ left: 20, right: 402 });
  });

  for (const insets of CUTOUTS) {
    const name = `left ${insets.left}, right ${insets.right}`;

    it(`${name}: every corner button and its tap area stays inside the safe span, tap-sized`, () => {
      for (const width of WIDTHS) {
        const m = uiMetrics(landscape(width, insets));
        const span = safeSpan(width, m);
        const hud = hudButtons(width, true, m);
        const rects: [string, Rect][] = [
          ['pause', hud.pause],
          ['mute', hud.mute],
          ['fullscreen', hud.fullscreen!],
          ['trophy', titleTrophy(width, true, m)],
          ['gear', settingsGear(m)],
          ['feedback', feedbackIcon(width, m)],
          ['close', closeButton(width, m)],
          ['item', itemButtonRect(width, landscape(width, insets))],
        ];
        for (const [what, r] of rects) {
          expect(within(r, span), `${name} ${width} ${what} ${JSON.stringify(r)}`).toBe(true);
          expect(Math.min(r.w, r.h) * CSS_PER_PX, what).toBeGreaterThanOrEqual(44);
        }
        // The edge buttons keep their usual margin from the cutout.
        expect(span.right - (hud.pause.x + hud.pause.w)).toBe(m.margin);
        expect(settingsGear(m).x - span.left).toBe(m.margin);
      }
    });

    it(`${name}: the stats plate, "Startbildschirm" and the menu rows keep clear of the cutouts`, () => {
      for (const width of WIDTHS) {
        const input = menuInput(width, insets);
        const m = uiMetrics(input);
        const span = safeSpan(width, m);
        const plate = statsLayout(60, true, true, span.left).plate;
        expect(plate.x - span.left, 'plate').toBe(statsLayout(60, true, true, 0).plate.x);
        const title = titleLayout(input);
        const pause = pauseLayout({ ...input, plate });
        const over = gameOverLayout({ ...input, newRecord: true, submit: true });
        for (const [screen, l] of [['title', title], ['pause', pause], ['game over', over]] as const) {
          const buttons = Object.values(l.buttons).filter((b): b is Rect => !!b);
          for (const r of [...buttons, ...l.blocks.values(), ...(l.panel ? [l.panel] : [])]) {
            expect(within(r, span), `${name} ${width} ${screen} ${JSON.stringify(r)}`).toBe(true);
          }
        }
        expect(pause.buttons.toTitle!.x).toBe(plate.x);
        expect(title.buttons.settings).toEqual(settingsGear(m));
      }
    });
  }
});
