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
  it('splits sessions into new, returning and unknown visits', () => {
    const stats = sampleStats(30);
    const { visits } = stats;
    expect(visits.new + visits.returning + visits.unknown).toBe(stats.sessions.total);
    expect(visits.unknown).toBeGreaterThan(0);
    expect(stats.perDay.every((d) => d.newPlayers + d.returningVisits <= d.sessions)).toBe(true);
    expect(stats.perDay.reduce((a, d) => a + d.newPlayers, 0)).toBe(visits.new);
  });
});
