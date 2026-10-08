import { describe, expect, it } from 'vitest';
import { GROUND_Y, PLAYER_X, VIEW_H } from '../core/config';
import { createStore, type Store } from '../core/storage';
import type { Rect } from '../types';
import { AIR_HINT_LAUNCHES, AirTrickHint, airTrickHintPlate } from './air-trick-hint';
import { KEY_DOWN, SWIPE_DOWN } from './hint-plate';
import { kickerHintRect } from './kicker-hint';
import { POPUP_MARGIN, popupScale } from './layout';

function memoryStore(): Store {
  const raw = new Map<string, string>();
  return createStore({
    getItem: (k: string) => raw.get(k) ?? null,
    setItem: (k: string, v: string) => void raw.set(k, v),
  } as unknown as Storage);
}

/**
 * One kicker launch: the launch event on a grounded tick (the player takes off
 * on the next tick), `air` airborne ticks, then the landing. Visibility per update.
 */
function flight(hint: AirTrickHint, air = 4, trickAt = -1): boolean[] {
  const seen: boolean[] = [];
  hint.launched();
  hint.update(false, false);
  seen.push(hint.visible);
  for (let i = 0; i < air; i++) {
    hint.update(true, i >= trickAt && trickAt >= 0);
    seen.push(hint.visible);
  }
  hint.update(false, false);
  seen.push(hint.visible);
  return seen;
}

const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

describe('air trick hint', () => {
  it('shows after a kicker launch while airborne and hides on landing', () => {
    const hint = new AirTrickHint(memoryStore());
    expect(hint.visible).toBe(false);
    expect(flight(hint)).toEqual([false, true, true, true, true, false]);
  });

  it('never shows on a plain jump (no launch)', () => {
    const hint = new AirTrickHint(memoryStore());
    for (let i = 0; i < 5; i++) hint.update(true, false);
    expect(hint.visible).toBe(false);
  });

  it('hides when the trick starts and stays hidden for the rest of that flight', () => {
    const hint = new AirTrickHint(memoryStore());
    expect(flight(hint, 5, 2)).toEqual([false, true, true, false, false, false, false]);
  });

  it('a launch that never takes off does not leave the hint waiting for a later jump', () => {
    const hint = new AirTrickHint(memoryStore());
    hint.launched();
    for (let i = 0; i < 30; i++) hint.update(false, false);
    hint.update(true, false);
    expect(hint.visible).toBe(false);
  });

  it('shows on the first few launches of a run only, and again in the next run', () => {
    const hint = new AirTrickHint(memoryStore());
    hint.runStarted();
    for (let i = 0; i < AIR_HINT_LAUNCHES; i++) expect(flight(hint).some(Boolean)).toBe(true);
    expect(flight(hint).some(Boolean)).toBe(false);
    hint.runStarted();
    expect(flight(hint).some(Boolean)).toBe(true);
  });

  it('never shows again once an air trick was done, also after a reload', () => {
    const store = memoryStore();
    const hint = new AirTrickHint(store);
    hint.launched();
    hint.update(true, false);
    hint.trickDone();
    expect(hint.visible).toBe(false);
    hint.runStarted();
    expect(flight(hint).some(Boolean)).toBe(false);
    const reloaded = new AirTrickHint(store);
    reloaded.runStarted();
    expect(flight(reloaded).some(Boolean)).toBe(false);
  });

  it('a new run hides a hint still showing', () => {
    const hint = new AirTrickHint(memoryStore());
    hint.launched();
    hint.update(true, false);
    hint.runStarted();
    expect(hint.visible).toBe(false);
  });

  describe('plate', () => {
    it('desktop: "In der Luft", a ↓ key cap, "= Trick!" in one row', () => {
      const p = airTrickHintPlate({ touch: false, portrait: false, viewWidth: 320 });
      expect(p.rows).toEqual([['In der Luft', KEY_DOWN, '= Trick!']]);
      expect(p.scale).toBe(1);
    });

    it('touch landscape: "In der Luft runterwischen = Trick!" in two compact rows', () => {
      const p = airTrickHintPlate({ touch: true, portrait: false, viewWidth: 384 });
      expect(p.rows.map((r) => r.join(' '))).toEqual(['In der Luft', 'runterwischen = Trick!']);
    });

    it('touch portrait (big font): the compact swipe row "Wisch ↓ = Trick!" (as the grind trick hint)', () => {
      const p = airTrickHintPlate({ touch: true, portrait: true, viewWidth: 390 });
      expect(p.rows).toEqual([['Wisch', SWIPE_DOWN, '= Trick!']]);
      expect(p.scale).toBe(popupScale({ portrait: true }, false));
    });

    const displays = [
      { name: 'desktop', touch: false, portrait: false },
      { name: 'phone landscape', touch: true, portrait: false },
      { name: 'phone portrait', touch: true, portrait: true },
    ];
    for (const viewWidth of [320, 384, 427]) {
      for (const d of displays) {
        it(`${d.name}, ${viewWidth} wide: under the riding line, on screen, clear of the airborne skater, not too wide`, () => {
          const { rect: r } = airTrickHintPlate({ ...d, viewWidth });
          expect(r.y).toBeGreaterThan(GROUND_Y);
          expect(r.y + r.h).toBeLessThanOrEqual(VIEW_H);
          expect(r.x).toBeGreaterThanOrEqual(POPUP_MARGIN);
          expect(r.x + r.w).toBeLessThanOrEqual(viewWidth - POPUP_MARGIN);
          expect(r.w).toBeLessThanOrEqual(Math.round(viewWidth * 0.6));
          for (const feet of [GROUND_Y - 10, GROUND_Y - 50, GROUND_Y - 80]) {
            expect(overlaps(r, { x: PLAYER_X - 12, y: feet - 32, w: 24, h: 32 })).toBe(false);
          }
          // Same spot as the kicker hint: hints are found in one place.
          expect(r.y).toBe(kickerHintRect(popupScale(d, false), viewWidth).y);
        });
      }
    }
  });
});
