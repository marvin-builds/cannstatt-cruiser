import { describe, expect, it } from 'vitest';
import { PX_PER_METRE } from '../ui/layout';
import { scorePayload } from './payload';

describe('scorePayload', () => {
  it('turns game pixels into metres and play time into whole seconds', () => {
    const p = scorePayload({ score: 1234, distance: 5678, seconds: 61.6 }, 'Max', '2026-10-09.3', 'device-1234');
    expect(PX_PER_METRE).toBe(10);
    expect(p).toEqual({ name: 'Max', score: 1234, distance: 568, duration: 62, version: '2026-10-09.3', device: 'device-1234' });
  });

  it('sends whole numbers only, never a zero duration', () => {
    const p = scorePayload({ score: 99.7, distance: 4, seconds: 0.2 }, 'Max', 'v', 'device-1234');
    expect(p.score).toBe(100);
    expect(p.distance).toBe(0);
    expect(p.duration).toBe(1);
    for (const n of [p.score, p.distance, p.duration]) expect(Number.isInteger(n)).toBe(true);
  });

  it('never sends negative numbers', () => {
    const p = scorePayload({ score: -5, distance: -40, seconds: -3 }, 'Max', 'v', 'device-1234');
    expect([p.score, p.distance, p.duration]).toEqual([0, 0, 1]);
  });
});
