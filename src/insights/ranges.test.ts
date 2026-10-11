import { describe, expect, it } from 'vitest';
import { ALL_RANGE, STATS_RANGES } from '../net/telemetry-types';
import { isApproximate, rangeButtonLabel, rangeNote } from './ranges';

describe('rangeButtonLabel', () => {
  it('names every range, 0 as Alles', () => {
    expect(STATS_RANGES.map(rangeButtonLabel)).toEqual(['7 T', '30 T', '90 T', '365 T', 'Alles']);
  });
});

describe('rangeNote', () => {
  it('counts the days of a fixed range', () => {
    expect(rangeNote(365, [])).toBe('365 Tage');
    expect(rangeNote(7, [{ day: '2026-10-05', sessions: 0, runs: 0, entries: 0 }])).toBe('7 Tage');
  });
  it('names the first recorded day for Alles', () => {
    expect(rangeNote(ALL_RANGE, [{ day: '2026-10-11', sessions: 3, runs: 5, entries: 0 }])).toBe('seit 11.10.2026');
    expect(rangeNote(ALL_RANGE, [{ day: '2025-05-03', sessions: 3, runs: 5, entries: 0 }])).toBe('seit 3.5.2025');
  });
  it('says Alles when there is no day yet', () => {
    expect(rangeNote(ALL_RANGE, [])).toBe('Alles');
  });
});

describe('isApproximate', () => {
  it('marks ranges beyond the raw retention as approximate', () => {
    expect(STATS_RANGES.filter(isApproximate)).toEqual([365, ALL_RANGE]);
  });
});
