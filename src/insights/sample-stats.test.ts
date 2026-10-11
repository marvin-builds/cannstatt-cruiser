import { describe, expect, it } from 'vitest';
import { ALL_RANGE } from '../net/telemetry-types';
import { sampleStats } from './sample-stats';

describe('sampleStats', () => {
  it('fills one day per range day and a long history for Alles', () => {
    expect(sampleStats(365).perDay).toHaveLength(365);
    const all = sampleStats(ALL_RANGE);
    expect(all.days).toBe(ALL_RANGE);
    expect(all.perDay).toHaveLength(500);
    expect(all.perDay.at(-1)!.day).toBe('2026-10-11');
  });
});
