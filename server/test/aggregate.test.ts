import { describe, expect, it } from 'vitest';
import { dayRange, histogram, largestFirst, mergeSmallGroups, utcDay, utcHour } from '../src/aggregate';

describe('UTC day helpers', () => {
  it('gives the UTC day and hour of a time', () => {
    const at = Date.parse('2026-10-11T23:59:59.999Z');
    expect(utcDay(at)).toBe('2026-10-11');
    expect(utcHour(at)).toBe(23);
    expect(utcDay(Date.parse('2026-10-12T00:00:00Z'))).toBe('2026-10-12');
  });

  it('lists the days of a range ending today, oldest first', () => {
    expect(dayRange(Date.parse('2026-03-02T08:00:00Z'), 4)).toEqual(['2026-02-27', '2026-02-28', '2026-03-01', '2026-03-02']);
    expect(dayRange(Date.parse('2026-10-11T08:00:00Z'), 90)).toHaveLength(90);
  });
});

describe('count helpers', () => {
  it('sorts largest first, ties by key', () => {
    expect(largestFirst([{ key: 'b', count: 2 }, { key: 'c', count: 5 }, { key: 'a', count: 2 }])).toEqual([
      { key: 'c', count: 5 },
      { key: 'a', count: 2 },
      { key: 'b', count: 2 },
    ]);
  });

  it('merges groups below the minimum and unknown values into other, largest first', () => {
    const rows = [
      { key: 'Stuttgart', count: 9 },
      { key: 'Esslingen', count: 4 },
      { key: 'Fellbach', count: 5 },
      { key: null, count: 2 },
      { key: 'Waiblingen', count: 1 },
    ];
    expect(mergeSmallGroups(rows, 5)).toEqual([
      { key: 'Stuttgart', count: 9 },
      { key: 'other', count: 7 },
      { key: 'Fellbach', count: 5 },
    ]);
  });

  it('adds no other entry when every group is large enough', () => {
    expect(mergeSmallGroups([{ key: 'DE', count: 5 }], 5)).toEqual([{ key: 'DE', count: 5 }]);
  });
});

describe('histogram', () => {
  it('counts values into the largest lower bound at or below them, zero-filled, keys as strings', () => {
    const rows = [{ key: 0, count: 1 }, { key: 20, count: 2 }, { key: 30, count: 1 }, { key: 3600, count: 4 }, { key: 600, count: 1 }];
    expect(histogram([0, 30, 60, 180, 600], rows)).toEqual([
      { key: '0', count: 3 }, { key: '30', count: 1 }, { key: '60', count: 0 }, { key: '180', count: 0 }, { key: '600', count: 5 },
    ]);
  });

  it('ignores values below the first bound and unknown values', () => {
    expect(histogram([10, 20], [{ key: 5, count: 1 }, { key: null, count: 2 }, { key: 25, count: 1 }])).toEqual([
      { key: '10', count: 0 }, { key: '20', count: 1 },
    ]);
  });
});
