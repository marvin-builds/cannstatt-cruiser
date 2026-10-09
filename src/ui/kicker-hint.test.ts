import { describe, expect, it } from 'vitest';
import { GROUND_Y, PLAYER_X, VIEW_H } from '../core/config';
import { createStore, type Store } from '../core/storage';
import type { Entity, Rect } from '../types';
import { KICKER_HINT_AHEAD, KICKER_HINT_RUNS, KickerHint, kickerHintRect, KICKER_HINT_LABEL } from './kicker-hint';
import { hintSpotRect } from './hint-plate';
import { POPUP_MARGIN } from './layout';

function memoryStore(): Store {
  const raw = new Map<string, string>();
  return createStore({
    getItem: (k: string) => raw.get(k) ?? null,
    setItem: (k: string, v: string) => void raw.set(k, v),
  } as unknown as Storage);
}

const kicker = (id: number, x: number): Entity => ({ id, kind: 'kicker', x, y: GROUND_Y - 8, w: 24, h: 8, done: false });
const cone = (id: number, x: number): Entity => ({ id, kind: 'cone' as Entity['kind'], x, y: GROUND_Y - 10, w: 8, h: 10, done: false });

/** One kicker `id` rolling from far ahead past the skater; the hint's visibility per step. */
function approach(hint: KickerHint, id: number): boolean[] {
  const seen: boolean[] = [];
  for (let x = PLAYER_X + KICKER_HINT_AHEAD + 40; x > PLAYER_X - 60; x -= 10) {
    hint.update([kicker(id, x)]);
    seen.push(hint.visible);
  }
  hint.update([]);
  seen.push(hint.visible);
  return seen;
}

describe('kicker hint', () => {
  it('shows while a kicker approaches and hides once it is passed', () => {
    const hint = new KickerHint(memoryStore());
    const seen = approach(hint, 1);
    expect(seen[0]).toBe(false);
    expect(seen.some(Boolean)).toBe(true);
    expect(seen.at(-1)).toBe(false);
  });

  it('ignores everything that is not a kicker', () => {
    const hint = new KickerHint(memoryStore());
    hint.update([cone(1, PLAYER_X + 40)]);
    expect(hint.visible).toBe(false);
  });

  it('disappears on launch and stays away for that kicker', () => {
    const hint = new KickerHint(memoryStore());
    hint.update([kicker(1, PLAYER_X + 30)]);
    expect(hint.visible).toBe(true);
    hint.launched();
    expect(hint.visible).toBe(false);
    hint.update([kicker(1, PLAYER_X + 20)]);
    expect(hint.visible).toBe(false);
  });

  it('shows for the first few kickers of a run only, and again in the next run', () => {
    const hint = new KickerHint(memoryStore());
    hint.runStarted();
    for (let id = 1; id <= KICKER_HINT_RUNS; id++) expect(approach(hint, id).some(Boolean)).toBe(true);
    expect(approach(hint, 99).some(Boolean)).toBe(false);
    hint.runStarted();
    expect(approach(hint, 100).some(Boolean)).toBe(true);
  });

  it('never shows again once a stunt line was completed, also after a reload', () => {
    const store = memoryStore();
    const hint = new KickerHint(store);
    hint.update([kicker(1, PLAYER_X + 30)]);
    hint.lineCompleted();
    expect(hint.visible).toBe(false);
    hint.runStarted();
    expect(approach(hint, 2).some(Boolean)).toBe(false);
    const reloaded = new KickerHint(store);
    reloaded.runStarted();
    expect(approach(reloaded, 3).some(Boolean)).toBe(false);
  });

  it('a new run hides a hint still showing', () => {
    const hint = new KickerHint(memoryStore());
    hint.update([kicker(1, PLAYER_X + 30)]);
    hint.runStarted();
    expect(hint.visible).toBe(false);
  });

  it('says the same on touch and keyboard: the ramp needs no button', () => {
    expect(KICKER_HINT_LABEL).toBe('Ab über die Rampe!');
  });

  for (const viewWidth of [320, 384, 427]) {
    it(`stays compact in portrait (big font), ${viewWidth} wide: at most 60 % of the view`, () => {
      expect(kickerHintRect(2, viewWidth).w).toBeLessThanOrEqual(Math.round(viewWidth * 0.6));
    });
  }

  it('anchors at the ramp: its anchor follows the kicker it is about, also while it lingers after passing', () => {
    const hint = new KickerHint(memoryStore());
    expect(hint.anchorX).toBe(PLAYER_X);
    hint.update([kicker(1, PLAYER_X + 100)]);
    expect(hint.anchorX).toBe(PLAYER_X + 100 + 12);
    hint.update([kicker(1, PLAYER_X + 50)]);
    expect(hint.anchorX).toBe(PLAYER_X + 50 + 12);
    hint.update([kicker(1, PLAYER_X - 40)]);
    expect(hint.visible).toBe(false);
    expect(hint.anchorX).toBe(PLAYER_X - 40 + 12);
    hint.update([]);
    expect(hint.anchorX).toBe(PLAYER_X - 40 + 12); // gone: stays where it was last
  });

  it('the plate centres on its anchor, kept on screen, the street level under the ramp', () => {
    for (const viewWidth of [320, 427]) {
      for (const anchor of [PLAYER_X, PLAYER_X + 100, viewWidth + 50, -30]) {
        const r = kickerHintRect(1, viewWidth, anchor);
        expect(r.x).toBeGreaterThanOrEqual(POPUP_MARGIN);
        expect(r.x + r.w).toBeLessThanOrEqual(viewWidth - POPUP_MARGIN);
        expect(r.y).toBe(kickerHintRect(1, viewWidth).y);
      }
      const mid = kickerHintRect(1, viewWidth, PLAYER_X + 100);
      expect(mid.x + Math.floor(mid.w / 2)).toBeGreaterThanOrEqual(PLAYER_X + 99);
    }
  });

  describe('placement', () => {
    const skater = (feetY: number): Rect => ({ x: PLAYER_X - 12, y: feetY - 32, w: 24, h: 32 });
    for (const [scale, viewWidth] of [
      [1, 320],
      [1, 427],
      [2, 320],
      [2, 384],
    ] as const) {
      it(`scale ${scale} in a ${viewWidth} wide view: under the riding line, on screen, clear of the skater`, () => {
        const r = kickerHintRect(scale, viewWidth);
        expect(r.y).toBeGreaterThan(GROUND_Y);
        expect(r.y + r.h).toBeLessThanOrEqual(VIEW_H);
        expect(r.x).toBeGreaterThanOrEqual(POPUP_MARGIN);
        expect(r.x + r.w).toBeLessThanOrEqual(viewWidth - POPUP_MARGIN);
        for (const feet of [GROUND_Y, GROUND_Y - 30, GROUND_Y - 60]) {
          const s = skater(feet);
          expect(r.x < s.x + s.w && s.x < r.x + r.w && r.y < s.y + s.h && s.y < r.y + r.h).toBe(false);
        }
        // Same spot as the grind trick hint, so the player looks in one place for hints.
        expect(r.y).toBe(hintSpotRect(r.w, r.h, viewWidth).y);
      });
    }
  });
});
