import { describe, expect, it } from 'vitest';
import type { DayStats } from '../net/telemetry-types';
import { ALL_RANGE } from '../net/telemetry-types';
import { chartPeriods, groupDays, isoWeek } from './periods';

function run(start: string, count: number, value = 1): DayStats[] {
  const first = Date.parse(`${start}T00:00:00Z`);
  return Array.from({ length: count }, (_, i) => ({
    day: new Date(first + i * 86_400_000).toISOString().slice(0, 10),
    sessions: value,
    runs: 2 * value,
    entries: value,
  }));
}

describe('isoWeek', () => {
  it('numbers weeks from the Monday of the week with the year’s first Thursday', () => {
    expect(isoWeek('2026-10-11')).toEqual({ year: 2026, week: 41 });
    expect(isoWeek('2026-10-05')).toEqual({ year: 2026, week: 41 });
    expect(isoWeek('2026-10-04')).toEqual({ year: 2026, week: 40 });
  });
  it('handles the year boundary both ways', () => {
    expect(isoWeek('2026-12-31')).toEqual({ year: 2026, week: 53 });
    expect(isoWeek('2027-01-03')).toEqual({ year: 2026, week: 53 });
    expect(isoWeek('2027-01-04')).toEqual({ year: 2027, week: 1 });
    expect(isoWeek('2024-12-30')).toEqual({ year: 2025, week: 1 });
    expect(isoWeek('2021-01-01')).toEqual({ year: 2020, week: 53 });
  });
});

describe('groupDays', () => {
  it('keeps days as single periods with a short label', () => {
    const periods = groupDays(run('2026-10-09', 2), 'day');
    expect(periods.map((p) => p.label)).toEqual(['9.10.', '10.10.']);
    expect(periods[0]).toMatchObject({ start: '2026-10-09', end: '2026-10-09', sessions: 1, runs: 2, entries: 1, title: '9.10.' });
  });
  it('sums ISO weeks labelled KW, also across the new year', () => {
    const periods = groupDays(run('2026-12-28', 14), 'week');
    expect(periods.map((p) => p.label)).toEqual(['KW 53', 'KW 1']);
    expect(periods[0]).toMatchObject({ start: '2026-12-28', end: '2027-01-03', sessions: 7, runs: 14, entries: 7 });
    expect(periods[0]!.title).toBe('KW 53 (28.12.–3.1.)');
  });
  it('sums partial weeks at the edges', () => {
    const periods = groupDays(run('2026-10-10', 3), 'week');
    expect(periods.map((p) => [p.label, p.sessions])).toEqual([
      ['KW 41', 2],
      ['KW 42', 1],
    ]);
  });
  it('sums months with German short names and a two-digit year', () => {
    const periods = groupDays(run('2026-02-27', 2 + 31 + 30 + 31 + 1), 'month');
    expect(periods.map((p) => p.label)).toEqual(['Feb 26', 'Mär 26', 'Apr 26', 'Mai 26', 'Jun 26']);
    expect(periods.map((p) => p.sessions)).toEqual([2, 31, 30, 31, 1]);
    expect(groupDays(run('2026-10-01', 92), 'month').map((p) => p.label)).toEqual(['Okt 26', 'Nov 26', 'Dez 26']);
    expect(groupDays(run('2027-01-01', 1), 'month')[0]!.label).toBe('Jan 27');
  });
  it('returns nothing for no days', () => {
    expect(groupDays([], 'week')).toEqual([]);
  });
});

describe('chartPeriods', () => {
  const wide = 1100;
  it('keeps days for the short ranges on a wide chart', () => {
    expect(chartPeriods(run('2026-09-12', 30), 30, wide, 2).grain).toBe('day');
    expect(chartPeriods(run('2026-07-14', 90), 90, wide, 2).grain).toBe('day');
  });
  it('groups 365 days into weeks', () => {
    const { grain, periods } = chartPeriods(run('2025-10-12', 365), 365, wide, 2);
    expect(grain).toBe('week');
    expect(periods.length).toBeGreaterThanOrEqual(53);
  });
  it('groups Alles into months beyond about 120 days and keeps days below', () => {
    expect(chartPeriods(run('2025-05-30', 500), ALL_RANGE, wide, 2).grain).toBe('month');
    expect(chartPeriods(run('2026-10-11', 1), ALL_RANGE, wide, 2).grain).toBe('day');
    expect(chartPeriods(run('2026-07-01', 60), ALL_RANGE, wide, 2).grain).toBe('day');
  });
  it('goes coarser when a narrow chart would turn bars into hairlines', () => {
    expect(chartPeriods(run('2026-10-05', 7), 7, 290, 2).grain).toBe('day');
    expect(chartPeriods(run('2026-09-12', 30), 30, 290, 2).grain).toBe('week');
    expect(chartPeriods(run('2026-07-14', 90), 90, 290, 2).grain).toBe('week');
    expect(chartPeriods(run('2025-10-12', 365), 365, 290, 2).grain).toBe('month');
  });
  it('gives a single series more room before grouping', () => {
    expect(chartPeriods(run('2026-09-12', 30), 30, 290, 1).grain).toBe('day');
  });
});
