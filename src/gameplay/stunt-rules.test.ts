import { describe, expect, it } from 'vitest';
import { GROUND_Y, TICK_DT } from '../core/config';
import { GRAVITY } from '../player/tuning';
import { isGrindable, isKicker, isLedge, isObstacle, isRail, KICKER, kickerRect, LEDGE, ledgeRect } from './catalogue';
import { groundBody, launchBody, stepBody } from './jumpsim';
import { hitsKicker, landsOnHighLedge, landsOnRail, launchVelocityFor, STUNT_MAGNET_DEPTH, STUNT_MAGNET_FRONT } from './rules';

const feet = (x: number, y: number, vy: number, supported = false) => ({ x, y, vy, supported });

describe('stunt pieces in the catalogue', () => {
  it('kicker and ledge are neither obstacles nor rails (the solver and crash checks never see them); a ledge is grindable', () => {
    for (const kind of ['kicker', 'ledge'] as const) {
      expect(isObstacle(kind)).toBe(false);
      expect(isRail(kind)).toBe(false);
    }
    expect(isGrindable('ledge')).toBe(true);
    expect(isGrindable('kicker')).toBe(false);
    expect(isKicker('kicker') && isLedge('ledge')).toBe(true);
  });

  it('a kicker is a small ramp on the street, a ledge a slim deck 40-60 px up', () => {
    const k = kickerRect(100);
    expect(k).toEqual({ x: 100, y: GROUND_Y - KICKER.h, w: KICKER.w, h: KICKER.h });
    expect(KICKER.w).toBeGreaterThanOrEqual(16);
    expect(KICKER.w).toBeLessThanOrEqual(20);
    expect(KICKER.h).toBeGreaterThanOrEqual(6);
    expect(KICKER.h).toBeLessThanOrEqual(8);
    const l = ledgeRect(40, 50, 80);
    expect(l).toEqual({ x: 40, y: GROUND_Y - 50, w: 80, h: LEDGE.deck });
    expect(LEDGE.minHeight).toBeGreaterThanOrEqual(40);
    expect(LEDGE.maxHeight).toBeLessThanOrEqual(60);
    expect(LEDGE.minLength).toBeGreaterThanOrEqual(40);
    expect(LEDGE.maxLength).toBeLessThanOrEqual(120);
  });
});

describe('kicker contact (hitsKicker)', () => {
  const k = kickerRect(100);

  it('launches a rider on the street once the wheels reach the middle of the ramp', () => {
    expect(hitsKicker(feet(100 + KICKER.w / 2 - 1, GROUND_Y, 0, true), k)).toBe(false);
    expect(hitsKicker(feet(100 + KICKER.w / 2, GROUND_Y, 0, true), k)).toBe(true);
    expect(hitsKicker(feet(100 + KICKER.w, GROUND_Y, 0, true), k)).toBe(true);
    expect(hitsKicker(feet(100 + KICKER.w + 1, GROUND_Y, 0, true), k)).toBe(false);
  });

  it('launches a skater coming down onto it, not one flying over or still rising', () => {
    expect(hitsKicker(feet(112, k.y + 1, 200), k)).toBe(true);
    expect(hitsKicker(feet(112, k.y - 2, 200), k)).toBe(false);
    expect(hitsKicker(feet(112, GROUND_Y - 2, -150), k)).toBe(false);
  });
});

describe('ledge magnet (landsOnHighLedge)', () => {
  const top = ledgeRect(100, 50, 80);

  it('catches a falling skater like a rail, and also a little before its front corner', () => {
    expect(landsOnHighLedge(feet(120, top.y + 2, 180), top)).toBe(true);
    expect(landsOnRail(feet(100 - STUNT_MAGNET_FRONT, top.y + 2, 180), top)).toBe(false);
    expect(landsOnHighLedge(feet(100 - STUNT_MAGNET_FRONT, top.y + 2, 180), top)).toBe(true);
    expect(landsOnHighLedge(feet(100 - STUNT_MAGNET_FRONT - 1, top.y + 2, 180), top)).toBe(false);
    expect(landsOnHighLedge(feet(181, top.y + 2, 180), top)).toBe(false);
  });

  it('pulls up a skater whose arc tops out just below the deck', () => {
    // The apex was STUNT_MAGNET_DEPTH below the top: now falling, still within the magnet.
    expect(landsOnHighLedge(feet(140, top.y + STUNT_MAGNET_DEPTH, 10), top)).toBe(true);
    expect(landsOnHighLedge(feet(140, top.y + STUNT_MAGNET_DEPTH + 4, 10), top)).toBe(false);
  });

  it('never catches a rising or supported skater', () => {
    expect(landsOnHighLedge(feet(140, top.y + 2, -50), top)).toBe(false);
    expect(landsOnHighLedge(feet(140, top.y, 0, true), top)).toBe(false);
  });
});

describe('launch (jumpsim mirror of the launch event)', () => {
  it('takes off on the next step with -velocity and normal gravity, whatever the action does', () => {
    const v = launchVelocityFor(50);
    const launched = stepBody(launchBody(groundBody(), v), 0, true, true);
    expect(launched.vy).toBeCloseTo(-v + GRAVITY * TICK_DT, 9);
    expect(launched.y).toBeCloseTo(GROUND_Y + launched.vy * TICK_DT, 9);
    expect(launched.grounded).toBe(false);
  });

  it('launchVelocityFor(height) carries the feet clearly above a ledge that high', () => {
    for (const height of [LEDGE.minHeight, 50, LEDGE.maxHeight]) {
      let b = launchBody(groundBody(), launchVelocityFor(height));
      let apex = 0;
      for (let i = 0; i < 120; i++) {
        b = stepBody(b, 0, false, false);
        apex = Math.max(apex, GROUND_Y - b.y);
      }
      expect(apex).toBeGreaterThan(height + 8);
      expect(apex).toBeLessThan(height + 20);
    }
  });
});
