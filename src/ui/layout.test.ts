import { describe, expect, it } from 'vitest';
import { blinkOn, centreX, formatNumber, hudButtons, metres, rightAnchor } from './layout';

describe('layout helpers', () => {
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
