import { describe, expect, it } from 'vitest';
import { GROUND_Y, PLAYER_X, VIEW_H } from '../core/config';
import { createMemoryStore, type Store } from '../core/storage';
import type { Entity, Rect } from '../types';
import { hintSpotRect } from './hint-plate';
import {
  inKickerHintRange,
  KICKER_HINT_AFTER,
  KICKER_HINT_LAUNCHES,
  KICKER_HINT_LEAD,
  KickerHint,
  kickerHintPlate,
} from './kicker-hint';
import { POPUP_MARGIN } from './layout';

const KICKER_W = 24;
const kicker = (id: number, x: number): Entity => ({ id, kind: 'kicker', x, y: GROUND_Y - 8, w: KICKER_W, h: 8, done: false });
const cone = (id: number, x: number): Entity => ({ id, kind: 'cone' as Entity['kind'], x, y: GROUND_Y - 10, w: 8, h: 10, done: false });
const SPEED = 120;

/** One kicker `id` rolling from far ahead past the skater; the hint's visibility per step. */
function approach(hint: KickerHint, id: number, speed = SPEED): boolean[] {
  const seen: boolean[] = [];
  for (let x = PLAYER_X + speed * KICKER_HINT_LEAD + 60; x > PLAYER_X - 100; x -= 4) {
    hint.update([kicker(id, x)], speed);
    seen.push(hint.visible);
  }
  hint.update([], speed);
  seen.push(hint.visible);
  return seen;
}

const display = (touch: boolean, portrait: boolean, viewWidth = 320) => ({ touch, portrait, viewWidth });
const texts = (rows: readonly (readonly unknown[])[]) => rows.flat().filter((p) => typeof p === 'string').join(' ');

describe('ramp hint: when it shows (ROADMAP 40)', () => {
  it('is in range from KICKER_HINT_LEAD seconds before the ramp through the ramp to just after its lip, scaled by speed', () => {
    for (const speed of [90, 190]) {
      const lead = speed * KICKER_HINT_LEAD;
      expect(inKickerHintRange(kicker(1, PLAYER_X + lead + 2), speed)).toBe(false);
      expect(inKickerHintRange(kicker(1, PLAYER_X + lead - 2), speed)).toBe(true);
      expect(inKickerHintRange(kicker(1, PLAYER_X), speed)).toBe(true); // feet at the ramp's foot
      expect(inKickerHintRange(kicker(1, PLAYER_X - KICKER_W / 2), speed)).toBe(true); // feet at the lip
      expect(inKickerHintRange(kicker(1, PLAYER_X - KICKER_W), speed)).toBe(true); // right after the lip
      const after = speed * KICKER_HINT_AFTER;
      expect(inKickerHintRange(kicker(1, PLAYER_X - KICKER_W - after + 2), speed)).toBe(true);
      expect(inKickerHintRange(kicker(1, PLAYER_X - KICKER_W - after - 2), speed)).toBe(false);
    }
  });

  it('gives at least about a second to read before the ramp, but stays short after the lip', () => {
    expect(KICKER_HINT_LEAD).toBeGreaterThanOrEqual(1);
    expect(KICKER_HINT_AFTER).toBeLessThanOrEqual(0.3);
  });

  it('shows while a kicker approaches and while the skater is on it, and hides once it is passed', () => {
    const hint = new KickerHint(createMemoryStore());
    const seen = approach(hint, 1);
    expect(seen[0]).toBe(false);
    expect(seen.some(Boolean)).toBe(true);
    expect(seen.at(-1)).toBe(false);
    hint.update([kicker(2, PLAYER_X - 4)], SPEED); // feet on the ramp
    expect(hint.visible).toBe(true);
  });

  it('ignores everything that is not a kicker', () => {
    const hint = new KickerHint(createMemoryStore());
    hint.update([cone(1, PLAYER_X + 40)], SPEED);
    expect(hint.visible).toBe(false);
  });

  it('disappears on launch and stays away for that kicker', () => {
    const hint = new KickerHint(createMemoryStore());
    hint.update([kicker(1, PLAYER_X + 30)], SPEED);
    expect(hint.visible).toBe(true);
    hint.launched();
    expect(hint.visible).toBe(false);
    hint.update([kicker(1, PLAYER_X + 20)], SPEED);
    expect(hint.visible).toBe(false);
  });

  it('repeats for every kicker (also within one run) until the player launched KICKER_HINT_LAUNCHES times, persisted', () => {
    expect(KICKER_HINT_LAUNCHES).toBeGreaterThanOrEqual(3);
    const store: Store = createMemoryStore();
    const hint = new KickerHint(store);
    hint.runStarted();
    for (let id = 1; id <= 8; id++) expect(approach(hint, id).some(Boolean), `kicker ${id} without a launch`).toBe(true);
    for (let i = 1; i < KICKER_HINT_LAUNCHES; i++) {
      hint.update([kicker(100 + i, PLAYER_X)], SPEED);
      hint.launched();
    }
    expect(approach(hint, 200).some(Boolean), 'one launch short').toBe(true);
    const reloaded = new KickerHint(store);
    expect(approach(reloaded, 201).some(Boolean), 'reloaded, one launch short').toBe(true);
    reloaded.launched();
    expect(approach(reloaded, 202).some(Boolean)).toBe(false);
    reloaded.runStarted();
    expect(approach(reloaded, 203).some(Boolean)).toBe(false);
    expect(approach(new KickerHint(store), 204).some(Boolean), 'after a reload').toBe(false);
  });

  it('a new run hides a hint still showing', () => {
    const hint = new KickerHint(createMemoryStore());
    hint.update([kicker(1, PLAYER_X + 30)], SPEED);
    hint.runStarted();
    expect(hint.visible).toBe(false);
  });

  it('anchors at the ramp: its anchor follows the kicker it is about, also while it lingers after passing', () => {
    const hint = new KickerHint(createMemoryStore());
    expect(hint.anchorX).toBe(PLAYER_X);
    hint.update([kicker(1, PLAYER_X + 100)], SPEED);
    expect(hint.anchorX).toBe(PLAYER_X + 100 + 12);
    hint.update([kicker(1, PLAYER_X + 50)], SPEED);
    expect(hint.anchorX).toBe(PLAYER_X + 50 + 12);
    hint.update([kicker(1, PLAYER_X - 80)], SPEED);
    expect(hint.visible).toBe(false);
    expect(hint.anchorX).toBe(PLAYER_X - 80 + 12);
    hint.update([], SPEED);
    expect(hint.anchorX).toBe(PLAYER_X - 80 + 12); // gone: stays where it was last
  });
});

describe('ramp hint: what it says', () => {
  it('keyboard: "Auf der Rampe springen!" with the jump key', () => {
    const t = texts(kickerHintPlate(display(false, false)).rows);
    expect(t).toContain('Auf der Rampe springen!');
    expect(t).toContain('Leertaste');
  });

  it('touch (landscape and portrait): "Auf der Rampe tippen!"', () => {
    for (const portrait of [false, true]) expect(texts(kickerHintPlate(display(true, portrait)).rows)).toBe('Auf der Rampe tippen!');
  });

  for (const viewWidth of [320, 384, 427]) {
    it(`stays compact in portrait (big font), ${viewWidth} wide: at most 60 % of the view`, () => {
      expect(kickerHintPlate(display(true, true, viewWidth)).rect.w).toBeLessThanOrEqual(Math.round(viewWidth * 0.6));
    });
  }

  it('the plate centres on its anchor, kept on screen, the street level under the ramp', () => {
    for (const viewWidth of [320, 427]) {
      for (const touch of [false, true]) {
        for (const anchor of [PLAYER_X, PLAYER_X + 100, viewWidth + 50, -30]) {
          const r = kickerHintPlate(display(touch, false, viewWidth), anchor).rect;
          expect(r.x).toBeGreaterThanOrEqual(POPUP_MARGIN);
          expect(r.x + r.w).toBeLessThanOrEqual(viewWidth - POPUP_MARGIN);
          expect(r.y).toBe(kickerHintPlate(display(touch, false, viewWidth)).rect.y);
        }
        const mid = kickerHintPlate(display(touch, false, viewWidth), PLAYER_X + 100).rect;
        expect(mid.x + Math.floor(mid.w / 2)).toBeGreaterThanOrEqual(PLAYER_X + 99);
      }
    }
  });

  describe('placement', () => {
    const skater = (feetY: number): Rect => ({ x: PLAYER_X - 12, y: feetY - 32, w: 24, h: 32 });
    for (const [touch, portrait, viewWidth] of [
      [false, false, 320],
      [false, false, 427],
      [true, false, 427],
      [true, true, 320],
      [true, true, 384],
    ] as const) {
      it(`touch ${touch}, portrait ${portrait}, ${viewWidth} wide: under the riding line, on screen, clear of the skater`, () => {
        const r = kickerHintPlate(display(touch, portrait, viewWidth)).rect;
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
