import { describe, expect, it } from 'vitest';
import { GROUND_Y, PLAYER_X } from '../core/config';
import { measureText } from '../core/font';
import type { Rect } from '../types';
import { itemButtonRect, itemHintRect, keycapChip } from './item-button';
import { hudButtons, POPUP_MARGIN, popupScale, uiMetrics } from './layout';
import { statsLayout } from './stats';
import {
  calloutBlockers,
  type CalloutScene,
  COMBO_TIME,
  KICKFLIP_TIME,
  fitCallout,
  LINE_DONE_TIME,
  placeCallout,
  PUNCH_TIME,
  StuntCallout,
} from './stunt-callout';

const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

describe('stunt callout', () => {
  it('shows "Linie xN!" (the stunt line multiplier, not the HUD combo) on every stunt step, replacing the last one', () => {
    const c = new StuntCallout();
    expect(c.visible).toBe(false);
    c.step(2);
    expect(c.visible).toBe(true);
    expect(c.lines).toEqual(['Linie x2!']);
    c.update(0.3);
    c.step(3);
    expect(c.lines).toEqual(['Linie x3!']);
  });

  it('a kickflip (airTrick) shows the big "Kickflip! +N" callout, punching in', () => {
    const c = new StuntCallout();
    c.kickflip(250);
    expect(c.lines).toEqual(['Kickflip! +250']);
    expect(c.punch).toBe(true);
    c.update(KICKFLIP_TIME - 0.01);
    expect(c.visible).toBe(true);
    c.update(0.02);
    expect(c.visible).toBe(false);
  });

  it('a kickflip and a stunt step in the same tick both show, one line each in its colour', () => {
    const c = new StuntCallout();
    c.step(2);
    c.kickflip(250);
    expect(c.lines).toEqual(['Linie x2!', 'Kickflip! +250']);
    expect(c.colors.length).toBe(2);
    expect(c.colors[0]).not.toBe(c.colors[1]);
    c.update(COMBO_TIME + 0.01);
    expect(c.visible, 'stays as long as the longer one').toBe(true);
    c.update(1 / 60);
    c.step(3);
    expect(c.lines).toEqual(['Linie x3!']);
  });

  it('a combo fades after COMBO_TIME', () => {
    const c = new StuntCallout();
    c.step(2);
    c.update(COMBO_TIME - 0.01);
    expect(c.visible).toBe(true);
    c.update(0.02);
    expect(c.visible).toBe(false);
  });

  it('punches in: big for PUNCH_TIME after each step, then settles', () => {
    const c = new StuntCallout();
    c.step(2);
    expect(c.punch).toBe(true);
    c.update(PUNCH_TIME + 0.01);
    expect(c.punch).toBe(false);
    c.step(3);
    expect(c.punch).toBe(true);
  });

  it('a completed line shows "Stunt-Linie!" with its points, a bit longer', () => {
    const c = new StuntCallout();
    c.step(2);
    c.end(true, 1250);
    expect(c.lines).toEqual(['Stunt-Linie!', '+1.250']);
    c.update(LINE_DONE_TIME - 0.01);
    expect(c.visible).toBe(true);
    c.update(0.02);
    expect(c.visible).toBe(false);
  });

  it('the end of a park session with points shows "Session!" and its points, like a completed line', () => {
    const c = new StuntCallout();
    c.session(1500);
    expect(c.lines).toEqual(['Session!', '+1.500']);
    expect(c.combo).toBe(false);
    c.update(LINE_DONE_TIME - 0.01);
    expect(c.visible).toBe(true);
    c.update(0.02);
    expect(c.visible).toBe(false);
  });

  it('a session without points shows nothing and leaves a showing combo alone', () => {
    const c = new StuntCallout();
    c.session(0);
    expect(c.visible).toBe(false);
    c.step(3);
    c.session(0);
    expect(c.lines).toEqual(['Linie x3!']);
    expect(c.visible).toBe(true);
  });

  it('a completed line without points shows only the title', () => {
    const c = new StuntCallout();
    c.end(true, 0);
    expect(c.lines).toEqual(['Stunt-Linie!']);
  });

  it('a missed line says nothing and clears the combo, so falling off stays quiet', () => {
    const c = new StuntCallout();
    c.step(2);
    c.end(false, 0);
    expect(c.visible).toBe(false);
  });

  it('a line is active from its first step until it ends or a run starts', () => {
    const c = new StuntCallout();
    expect(c.lineActive).toBe(false);
    c.step(1);
    expect(c.lineActive).toBe(true);
    c.update(COMBO_TIME + 1);
    expect(c.lineActive).toBe(true);
    c.end(true, 100);
    expect(c.lineActive).toBe(false);
    c.step(1);
    c.runStarted();
    expect(c.lineActive).toBe(false);
    expect(c.visible).toBe(false);
  });

  it('waits (its time standing still) while it cannot be shown, e.g. under the zone banner', () => {
    const c = new StuntCallout();
    c.step(2);
    c.update(5, false);
    expect(c.visible).toBe(true);
    expect(c.punch).toBe(true);
    c.update(COMBO_TIME + 0.01, true);
    expect(c.visible).toBe(false);
  });

  describe('layout', () => {
    const displays = [
      { name: 'desktop', touch: false, portrait: false },
      { name: 'phone landscape', touch: true, portrait: false },
      { name: 'phone portrait', touch: true, portrait: true },
    ];
    /** Callouts as the events make them: combos up to x12 and a completed line with big points. */
    const callouts = (): StuntCallout[] => {
      const made = [2, 6, 12].map((n) => {
        const c = new StuntCallout();
        c.step(n);
        return c;
      });
      const done = new StuntCallout();
      done.step(9);
      done.end(true, 12500);
      return [...made, done];
    };
    /** The HUD plate: a fresh run's, and the widest and tallest one (9 digit score, chill and drunk rows). */
    const plates = [statsLayout(measureText('0', 2), false).plate, statsLayout(9 * 12, true, true).plate];
    /** The skater's column (feet at PLAYER_X), at any height up to the street. */
    const SKATER: Rect = { x: PLAYER_X - 16, y: 0, w: 32, h: GROUND_Y };
    /** The upper level: ledges 40-60 px above the street plus the skater and his star trail over them. */
    const ledgeBand = (w: number): Rect => ({ x: 0, y: GROUND_Y - 96, w, h: 56 });

    function sceneFor(d: (typeof displays)[number], viewWidth: number, plate: Rect, banner: boolean, carrying: boolean): CalloutScene {
      const touchItem = carrying && d.touch;
      return {
        viewWidth,
        plate,
        chip: carrying && !d.touch ? keycapChip(plate) : null,
        buttons: hudButtons(viewWidth, true, uiMetrics(d)),
        itemButton: touchItem ? itemButtonRect(viewWidth, d) : null,
        itemHint: touchItem ? itemHintRect(viewWidth, d, popupScale(d, false)) : null,
        banner,
      };
    }

    for (const viewWidth of [320, 384, 427]) {
      for (const d of displays) {
        it(`${d.name}, ${viewWidth} wide: never over the skater, the ledge band, the HUD plate, buttons, item button or zone banner`, () => {
          for (const plate of plates) {
            for (const carrying of [false, true]) {
              const scene = sceneFor(d, viewWidth, plate, false, carrying);
              const blocked: Rect[] = [plate, ...[scene.chip, scene.itemButton, scene.itemHint].filter((r): r is Rect => r !== null)];
              blocked.push(scene.buttons.pause, scene.buttons.mute, scene.buttons.fullscreen!, SKATER, ledgeBand(viewWidth));
              for (const c of callouts()) {
                for (const punch of [false, true]) {
                  const r = fitCallout(c.lines, punch, viewWidth, calloutBlockers(scene));
                  expect(r, `${c.lines.join(' ')} fits`).not.toBeNull();
                  expect(Number.isInteger(r!.x) && Number.isInteger(r!.y)).toBe(true);
                  expect(r!.x).toBeGreaterThanOrEqual(POPUP_MARGIN);
                  expect(r!.x + r!.w).toBeLessThanOrEqual(viewWidth - POPUP_MARGIN);
                  expect(r!.y).toBeGreaterThanOrEqual(0);
                  for (const b of blocked) expect(overlaps(r!, b), `${c.lines.join(' ')} vs ${JSON.stringify(b)}`).toBe(false);
                }
              }
            }
          }
        });

        it(`${d.name}, ${viewWidth} wide: waits while the zone banner shows`, () => {
          const c = new StuntCallout();
          c.step(3);
          expect(placeCallout(c, sceneFor(d, viewWidth, plates[1]!, true, false))).toBeNull();
          expect(placeCallout(c, sceneFor(d, viewWidth, plates[1]!, false, false))).not.toBeNull();
        });
      }
    }

    it('smaller than before: the settled combo is drawn at scale 2 and punches in at 3 where there is room', () => {
      for (const d of displays) {
        const scene = sceneFor(d, 390, plates[0]!, false, false);
        const settled = fitCallout(['Linie x2!'], false, 390, calloutBlockers(scene))!;
        const punched = fitCallout(['Linie x2!'], true, 390, calloutBlockers(scene))!;
        expect(settled.scale).toBe(2);
        expect(punched.scale).toBe(3);
        expect(punched.w).toBeGreaterThan(settled.w);
        // Both from the same spot, so the punch does not jump.
        expect(punched.y).toBe(settled.y);
      }
    });

    it('is placed only while visible', () => {
      const c = new StuntCallout();
      const scene = sceneFor(displays[0]!, 320, plates[0]!, false, false);
      expect(placeCallout(c, scene)).toBeNull();
      c.step(2);
      expect(placeCallout(c, scene)).not.toBeNull();
    });
  });
});
