import { describe, expect, it } from 'vitest';
import { CHILL_DURATION } from '../core/chill';
import { timerBarFill, TIMER_BAR_W, STATS_PAD, statsLayout } from './stats';
import { plusPoints } from './layout';

describe('HUD stats plate', () => {
  it('fits its content with the same padding on every side', () => {
    const l = statsLayout(70, false);
    expect(l.plate.x + STATS_PAD).toBe(l.x);
    expect(l.plate.x + l.plate.w).toBe(l.x + 70 + STATS_PAD);
    expect(l.plate.y + STATS_PAD).toBe(l.label);
    expect(l.plate.y + l.plate.h).toBe(l.bottom + STATS_PAD);
    expect(l.chill).toBeNull();
  });

  it('grows by one row for the chill timer, only while it runs', () => {
    const plain = statsLayout(40, false);
    const chill = statsLayout(40, true);
    expect(chill.chill).not.toBeNull();
    expect(chill.chill!).toBeGreaterThan(plain.hearts);
    expect(chill.plate.h).toBeGreaterThan(plain.plate.h);
    // Never narrower than the chill row.
    expect(chill.plate.w).toBeGreaterThanOrEqual(TIMER_BAR_W + 2 * STATS_PAD);
  });

  it('grows by one more row for the drunk timer, below the chill row', () => {
    const plain = statsLayout(40, false);
    const drunk = statsLayout(40, false, true);
    expect(plain.drunk).toBeNull();
    expect(drunk.drunk!).toBeGreaterThan(plain.hearts);
    expect(drunk.plate.h).toBe(statsLayout(40, true).plate.h);
    const both = statsLayout(40, true, true);
    expect(both.drunk!).toBeGreaterThan(both.chill!);
    expect(both.plate.y + both.plate.h).toBe(both.bottom + STATS_PAD);
  });

  it('drains the chill bar with the timer', () => {
    expect(timerBarFill(CHILL_DURATION, CHILL_DURATION)).toBe(TIMER_BAR_W);
    expect(timerBarFill(CHILL_DURATION / 2, CHILL_DURATION)).toBe(Math.ceil(TIMER_BAR_W / 2));
    expect(timerBarFill(0.001, CHILL_DURATION)).toBe(1);
    expect(timerBarFill(0, CHILL_DURATION)).toBe(0);
  });

  it('formats popup points with German thousands dots', () => {
    expect(plusPoints(750)).toBe('+750');
    expect(plusPoints(1250)).toBe('+1.250');
  });
});
