import { describe, expect, it } from 'vitest';
import { normalizeZone, ZONE_COUNT, ZONE_LENGTH, ZoneClock } from './zones';

describe('normalizeZone', () => {
  it('wraps any index into 0..ZONE_COUNT-1', () => {
    expect(ZONE_COUNT).toBe(3);
    expect(normalizeZone(0)).toBe(0);
    expect(normalizeZone(4)).toBe(1);
    expect(normalizeZone(-1)).toBe(2);
  });
});

describe('ZoneClock', () => {
  it('asks for the next zone once the current one lasted ZONE_LENGTH', () => {
    const clock = new ZoneClock();
    expect(clock.due(ZONE_LENGTH - 1, 0)).toBeNull();
    expect(clock.due(ZONE_LENGTH, 0)).toBe(1);
  });

  it('cycles 0 -> 1 -> 2 -> 0', () => {
    const clock = new ZoneClock();
    expect(clock.due(ZONE_LENGTH, 2)).toBe(0);
  });

  it('measures from the last reset', () => {
    const clock = new ZoneClock();
    clock.reset(1000);
    expect(clock.due(ZONE_LENGTH, 0)).toBeNull();
    expect(clock.due(1000 + ZONE_LENGTH, 0)).toBe(1);
  });
});
