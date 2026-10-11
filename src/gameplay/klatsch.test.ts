import { describe, expect, it } from 'vitest';
import { GROUND_Y, PLAYER_X, TICK_RATE } from '../core/config';
import { B, BOARD_DECK_ROW, BOARD_H, BODY_ANCHOR_X, BODY_DECK_ROW } from '../player/art';
import { HIGH_FIVE_HOLD, HIGH_FIVE_RAISE, type HighFiveSide } from '../player/high-five';
import { highFiveDraw, PALM_H } from '../player/high-five-art';
import type { Entity } from '../types';
import { highFiverRect } from './catalogue';
import { atContact, fiverHand, KLATSCH_DELAY, KLATSCH_FRAMES, KLATSCH_TICKS, klatschFrame, klatschPoint, SKATER_PALM, slapsRight } from './klatsch';

const fiverAt = (x: number): Entity => ({ id: 1, kind: 'highFiver', ...highFiverRect(x), done: false });
/** A high fiver whose middle is `ahead` px in front of the skater. */
const fiverAhead = (ahead: number) => fiverAt(PLAYER_X + ahead - highFiverRect(0).w / 2);
const skater = (y = GROUND_Y) => ({ x: PLAYER_X, y });

describe('the klatsch burst', () => {
  it('starts when the skater’s palm reaches the slap and lasts 0.2-0.3 s, stepping through its frames in order', () => {
    expect(KLATSCH_DELAY).toBe(Math.round(HIGH_FIVE_RAISE * TICK_RATE));
    expect(KLATSCH_TICKS / TICK_RATE).toBeGreaterThanOrEqual(0.2);
    expect(KLATSCH_TICKS / TICK_RATE).toBeLessThanOrEqual(0.3);
    const start = 100 + KLATSCH_DELAY;
    expect(klatschFrame(undefined, 100)).toBeNull();
    expect(klatschFrame(100, start - 1)).toBeNull();
    expect(klatschFrame(100, start)).toBe(0);
    expect(klatschFrame(100, start + KLATSCH_TICKS - 1)).toBe(KLATSCH_FRAMES - 1);
    expect(klatschFrame(100, start + KLATSCH_TICKS)).toBeNull();
    const frames = Array.from({ length: KLATSCH_TICKS }, (_, i) => klatschFrame(100, start + i)!);
    expect(frames).toEqual([...frames].sort((a, b) => a - b));
    expect(new Set(frames).size).toBe(KLATSCH_FRAMES);
    // The burst's brightest frame lands inside the player's slap hold.
    expect(KLATSCH_DELAY).toBeLessThan(Math.round((HIGH_FIVE_RAISE + HIGH_FIVE_HOLD) * TICK_RATE));
  });

  it('knows where the player draws the open palm at the slap (ride pose, from the wheel contact point)', () => {
    for (const side of ['ahead', 'over', 'behind'] as HighFiveSide[]) {
      const five = highFiveDraw(B.ride, 'slap', side)!;
      const left = -BODY_ANCHOR_X;
      const top = -BOARD_H + BOARD_DECK_ROW - BODY_DECK_ROW;
      expect(SKATER_PALM[side]).toEqual({ dx: left + five.palm!.x, dy: top + five.palm!.y + Math.floor(PALM_H / 2) });
    }
  });

  it('turns him towards a skater who already passed him', () => {
    expect(slapsRight(fiverAhead(20), skater())).toBe(false);
    expect(slapsRight(fiverAhead(0), skater())).toBe(false);
    expect(slapsRight(fiverAhead(-20), skater())).toBe(true);
    const fiver = fiverAt(50);
    expect(fiverHand(fiver, true).x - fiver.x).toBe(fiver.w - 1 - (fiverHand(fiver, false).x - fiver.x));
    expect(fiverHand(fiver, true).y).toBe(fiverHand(fiver, false).y);
  });

  it('sits at integer pixels halfway between his slapping hand and the skater’s palm', () => {
    for (const ahead of [-24, -8, 0, 12, 24]) {
      const fiver = fiverAhead(ahead);
      const s = skater();
      const side: HighFiveSide = ahead > 6 ? 'ahead' : ahead < -6 ? 'behind' : 'over';
      const hand = fiverHand(fiver, slapsRight(fiver, s));
      const palm = { x: s.x + SKATER_PALM[side].dx, y: s.y + SKATER_PALM[side].dy };
      const p = klatschPoint(fiver, s);
      expect(Number.isInteger(p.dx) && Number.isInteger(p.y)).toBe(true);
      expect(Math.abs(fiver.x + p.dx - (hand.x + palm.x) / 2)).toBeLessThanOrEqual(0.5);
      expect(Math.abs(p.y - (hand.y + palm.y) / 2)).toBeLessThanOrEqual(0.5);
    }
  });

  it('is placed where he will be at the contact: carried KLATSCH_DELAY ticks further left by the street', () => {
    const fiver = fiverAt(80);
    expect(atContact(fiver, 120)).toEqual({ ...fiver, x: 80 - (120 * KLATSCH_DELAY) / TICK_RATE });
    expect(atContact(fiver, 0)).toEqual(fiver);
    // A fiver level with the skater at the press is already behind him at the contact (at top-ish speed).
    expect(slapsRight(atContact(fiverAhead(0), 240), skater())).toBe(true);
  });

  it('rises towards a skater who slaps from the air', () => {
    const fiver = fiverAhead(0);
    expect(klatschPoint(fiver, skater(GROUND_Y - 20)).y).toBeLessThan(klatschPoint(fiver, skater()).y);
  });
});
